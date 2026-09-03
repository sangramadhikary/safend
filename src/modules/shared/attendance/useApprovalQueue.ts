'use client';

/**
 * Approval Queue hook + pure view-model builder (shared by both portals).
 *
 * The Supervisor portal and the Operations portal both render the same pending
 * Approval Queue (R10.1). To avoid duplicating logic, this module exposes:
 *
 *  1. `buildCheckInViewModel` — a **pure**, dependency-free function that maps a
 *     `QrCheckIn` record to the display view-model the queue UI consumes
 *     (photo reference, computed distance, map location, timestamp, employee id,
 *     post id, and the out-of-geofence / low-accuracy indicators). Keeping it
 *     pure makes it directly unit- and property-testable (Property 8, R10.2–10.4)
 *     without React, react-query, or Supabase.
 *
 *  2. `useApprovalQueue` — a `@tanstack/react-query` hook (mirroring the existing
 *     `useSupervisorData` / `useOperationalPosts` conventions) that fetches the
 *     branch/role-scoped pending records via `QrCheckInService.getPendingCheckIns`,
 *     subscribes to realtime changes so new `pending` records surface promptly
 *     (R10.1), and returns the derived view-models.
 *
 * Requirements: 10.1, 10.2, 10.3, 10.4
 */

import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getPendingCheckIns,
  subscribeToPendingCheckIns,
  type PendingCheckInQuery,
  type QrCheckIn,
} from '@/services/supabase/QrCheckInService';
import type { ShiftKey } from '@/lib/attendance/lifecycle';

// ---------------------------------------------------------------------------
// View-model
// ---------------------------------------------------------------------------

/** A geographic point rendered as a map marker in the queue (R10.2). */
export interface MapLocation {
  lat: number;
  lng: number;
}

/**
 * The derived display shape for a single pending check-in in the Approval
 * Queue. Every field maps to a piece of evidence the reviewer must see (R10.2)
 * plus the two attention indicators (R10.3, R10.4).
 */
export interface CheckInViewModel {
  /** Underlying record id (used as a stable list key and for actions). */
  id: string;
  /**
   * Server photo route the card fetches through — never a public URL (R8.7).
   * Points at `/api/attendance/checkin/{id}/photo`, which returns a short-lived
   * signed URL for authorized approvers only.
   */
  photoRef: string;
  /** Server-computed great-circle distance to the post, in meters (R10.2). */
  distanceM: number;
  /** Captured GPS location for the map marker (R10.2). */
  mapLocation: MapLocation;
  /** Check-in timestamp (submission time), ISO 8601 (R10.2). */
  timestamp: string;
  /** Human-readable employee identifier shown to the approver (R10.2). */
  employeeId: string;
  /** Post identifier the check-in belongs to (R10.2). */
  postId: string;
  /** True iff the record is outside the geofence (R10.3). */
  outOfGeofence: boolean;
  /** True iff the record is flagged low-accuracy (R10.4). */
  lowAccuracy: boolean;

  // --- extra context the card uses for rendering (not part of Property 8) ---
  shiftKey: ShiftKey;
  serviceTypeKey: string;
  checkInDate: string;
  gpsAccuracyM: number | null;
  /** True once the photo has been auto-deleted by retention (R9.5). */
  photoExpired: boolean;
}

/**
 * Build the server photo route for a check-in. The queue never embeds a public
 * URL; it references the authorized route that mints a signed URL on demand
 * (R8.4, R8.7).
 */
export function checkInPhotoRef(id: string): string {
  return `/api/attendance/checkin/${id}/photo`;
}

/**
 * Pure view-model builder (Property 8). Given a `QrCheckIn`, produce the queue
 * display view-model with:
 *   - `photoRef` pointing at the authorized photo route,
 *   - `distanceM`, `mapLocation {lat,lng}`, `timestamp`, `employeeId`, `postId`,
 *   - `outOfGeofence` true iff `withinGeofence === false` (R10.3),
 *   - `lowAccuracy` true iff `lowAccuracy === true` (R10.4).
 *
 * No I/O, no React — safe to unit/property test in isolation.
 */
export function buildCheckInViewModel(record: QrCheckIn): CheckInViewModel {
  return {
    id: record.id,
    photoRef: checkInPhotoRef(record.id),
    distanceM: record.distanceM,
    mapLocation: { lat: record.gpsLat, lng: record.gpsLng },
    // The check-in timestamp is the submission (creation) time (R10.2).
    timestamp: record.createdAt,
    // The employee identifier displayed to approvers is the human code.
    employeeId: record.employeeCode,
    postId: record.postId,
    // Out-of-geofence indicator iff the within-geofence flag is false (R10.3).
    outOfGeofence: record.withinGeofence === false,
    // Low-accuracy indicator iff the low-accuracy flag is true (R10.4).
    lowAccuracy: record.lowAccuracy === true,

    shiftKey: record.shiftKey,
    serviceTypeKey: record.serviceTypeKey,
    checkInDate: record.checkInDate,
    gpsAccuracyM: record.gpsAccuracyM,
    photoExpired: record.photoExpired,
  };
}

/**
 * Map a list of records to view-models, preserving order (oldest-first from the
 * service).
 */
export function buildApprovalQueue(records: QrCheckIn[]): CheckInViewModel[] {
  return records.map(buildCheckInViewModel);
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/** Stable react-query key for a given scope. */
export function approvalQueueQueryKey(scope: PendingCheckInQuery = {}) {
  return [
    'attendance',
    'approval-queue',
    scope.postId ?? null,
    scope.branchIds ?? null,
    scope.limit ?? null,
  ] as const;
}

export interface UseApprovalQueueResult {
  /** Derived view-models for the pending records, oldest-first. */
  items: CheckInViewModel[];
  /** Raw records, in case a consumer needs fields beyond the view-model. */
  records: QrCheckIn[];
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * React-query hook returning the branch/role-scoped pending Approval Queue with
 * derived display view-models. Realtime changes to `qr_check_ins` (and branch
 * scope switches) refresh the cache so newly-`pending` records appear promptly
 * (R10.1). Role gating is enforced by the mounting portal, per the design.
 */
export function useApprovalQueue(
  scope: PendingCheckInQuery = {},
): UseApprovalQueueResult {
  const queryClient = useQueryClient();
  const queryKey = approvalQueueQueryKey(scope);

  const query = useQuery<QrCheckIn[], Error>({
    queryKey,
    queryFn: async () => {
      const result = await getPendingCheckIns(scope);
      if (!result.success) {
        throw new Error(result.error || 'Failed to load pending check-ins');
      }
      return result.data ?? [];
    },
  });

  // Keep the cache fresh via the service's realtime subscription (R10.1). The
  // subscription performs its own scoped fetch and hands back the latest list,
  // which we write straight into the query cache.
  useEffect(() => {
    const unsubscribe = subscribeToPendingCheckIns((checkIns) => {
      queryClient.setQueryData<QrCheckIn[]>(queryKey, checkIns);
    }, scope);
    return unsubscribe;
    // `queryKey` is derived deterministically from `scope`; stringify to keep
    // the effect stable across renders without re-subscribing needlessly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryClient, JSON.stringify(queryKey)]);

  const records = query.data ?? [];

  return {
    items: buildApprovalQueue(records),
    records,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error ?? null,
    refetch: query.refetch,
  };
}
