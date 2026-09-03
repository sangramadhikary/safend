'use client';

import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { traccarFetch, traccarMutate } from '@/services/traccar/traccarApi';
import { istRangeInstants, type DayRange } from '@/services/traccar/traccarTime';
import type {
  TraccarDevice,
  TraccarEvent,
  TraccarGeofence,
  TraccarPosition,
  TraccarStop,
  TraccarSummary,
  TraccarTrip,
} from '@/services/traccar/traccarTypes';
import type { MapPin } from './TrackMap';
import { getOperationalPosts } from '@/services/supabase/OperationalPostService';
import { getActiveRentedProperties } from '@/services/supabase/RentedPropertyService';

/**
 * React Query layer for the fleet tracking console.
 *
 * Report queries stay disabled until at least one device is selected, so the
 * console never fires a request that the proxy would reject with a 400. Live
 * positions poll on an interval the user controls; everything else is fetched
 * once per filter change and served from cache while the user switches views.
 */

// ─── Query keys ───────────────────────────────────────────────────────────────

type ReportName = 'route' | 'summary' | 'trips' | 'stops' | 'events';

export const trackingKeys = {
  all: ['traccar'] as const,
  devices: () => [...trackingKeys.all, 'devices'] as const,
  positions: () => [...trackingKeys.all, 'positions'] as const,
  geofences: () => [...trackingKeys.all, 'geofences'] as const,
  report: (report: ReportName, deviceIds: number[], range: DayRange, variant = '') =>
    [
      ...trackingKeys.all,
      'report',
      report,
      variant,
      range.startDate,
      range.endDate,
      [...deviceIds].sort((a, b) => a - b).join(','),
    ] as const,
};

// ─── Shared options ───────────────────────────────────────────────────────────

const REPORT_STALE_MS = 60_000;
const REPORT_GC_MS = 5 * 60_000;

function reportParams(deviceIds: number[], range: DayRange) {
  const { from, to } = istRangeInstants(range);
  return { deviceId: deviceIds, from, to };
}

// ─── Devices ──────────────────────────────────────────────────────────────────

/** Every registered tracker. Refreshed on a slow interval so status stays current. */
export function useTraccarDevices(): UseQueryResult<TraccarDevice[], Error> {
  return useQuery<TraccarDevice[], Error>({
    queryKey: trackingKeys.devices(),
    queryFn: () => traccarFetch<TraccarDevice[]>('/api/traccar/devices'),
    staleTime: 30_000,
    gcTime: REPORT_GC_MS,
    retry: 0,
  });
}

// ─── Live positions ───────────────────────────────────────────────────────────

/**
 * Latest fix per device.
 *
 * @param intervalMs Poll interval; pass 0 to stop polling and refresh manually.
 */
export function useLivePositions(
  intervalMs: number,
  enabled = true
): UseQueryResult<TraccarPosition[], Error> {
  return useQuery<TraccarPosition[], Error>({
    queryKey: trackingKeys.positions(),
    queryFn: () => traccarFetch<TraccarPosition[]>('/api/traccar/positions'),
    enabled,
    // A live feed is stale the moment it lands.
    staleTime: 0,
    gcTime: 60_000,
    refetchInterval: intervalMs > 0 ? intervalMs : false,
    refetchIntervalInBackground: false,
    retry: 0,
  });
}

// ─── Reports ──────────────────────────────────────────────────────────────────

/** All GPS points for the selection. Heavy, so it is opt-in per view. */
export function useRouteReport(
  deviceIds: number[],
  range: DayRange,
  enabled = true
): UseQueryResult<TraccarPosition[], Error> {
  return useQuery<TraccarPosition[], Error>({
    queryKey: trackingKeys.report('route', deviceIds, range),
    queryFn: () =>
      traccarFetch<TraccarPosition[]>('/api/traccar/route-positions', reportParams(deviceIds, range)),
    enabled: enabled && deviceIds.length > 0,
    staleTime: REPORT_STALE_MS,
    gcTime: REPORT_GC_MS,
    retry: 0,
  });
}

/** Aggregate totals. `daily` splits into one row per device per day. */
export function useSummaryReport(
  deviceIds: number[],
  range: DayRange,
  options?: { daily?: boolean; enabled?: boolean }
): UseQueryResult<TraccarSummary[], Error> {
  const daily = options?.daily ?? false;

  return useQuery<TraccarSummary[], Error>({
    queryKey: trackingKeys.report('summary', deviceIds, range, daily ? 'daily' : 'total'),
    queryFn: () =>
      traccarFetch<TraccarSummary[]>('/api/traccar/summary', {
        ...reportParams(deviceIds, range),
        ...(daily ? { daily: 'true' } : {}),
      }),
    enabled: (options?.enabled ?? true) && deviceIds.length > 0,
    staleTime: REPORT_STALE_MS,
    gcTime: REPORT_GC_MS,
    retry: 0,
  });
}

export function useTripsReport(
  deviceIds: number[],
  range: DayRange,
  enabled = true
): UseQueryResult<TraccarTrip[], Error> {
  return useQuery<TraccarTrip[], Error>({
    queryKey: trackingKeys.report('trips', deviceIds, range),
    queryFn: () => traccarFetch<TraccarTrip[]>('/api/traccar/trips', reportParams(deviceIds, range)),
    enabled: enabled && deviceIds.length > 0,
    staleTime: REPORT_STALE_MS,
    gcTime: REPORT_GC_MS,
    retry: 0,
  });
}

export function useStopsReport(
  deviceIds: number[],
  range: DayRange,
  enabled = true
): UseQueryResult<TraccarStop[], Error> {
  return useQuery<TraccarStop[], Error>({
    queryKey: trackingKeys.report('stops', deviceIds, range),
    queryFn: () => traccarFetch<TraccarStop[]>('/api/traccar/stops', reportParams(deviceIds, range)),
    enabled: enabled && deviceIds.length > 0,
    staleTime: REPORT_STALE_MS,
    gcTime: REPORT_GC_MS,
    retry: 0,
  });
}

export function useEventsReport(
  deviceIds: number[],
  range: DayRange,
  enabled = true
): UseQueryResult<TraccarEvent[], Error> {
  return useQuery<TraccarEvent[], Error>({
    queryKey: trackingKeys.report('events', deviceIds, range),
    queryFn: () => traccarFetch<TraccarEvent[]>('/api/traccar/events', reportParams(deviceIds, range)),
    enabled: enabled && deviceIds.length > 0,
    staleTime: REPORT_STALE_MS,
    gcTime: REPORT_GC_MS,
    retry: 0,
  });
}

// ─── Geofences ────────────────────────────────────────────────────────────────

export function useGeofences(enabled = true): UseQueryResult<TraccarGeofence[], Error> {
  return useQuery<TraccarGeofence[], Error>({
    queryKey: trackingKeys.geofences(),
    queryFn: () => traccarFetch<TraccarGeofence[]>('/api/traccar/geofence'),
    enabled,
    staleTime: 5 * 60_000,
    gcTime: REPORT_GC_MS,
    retry: 0,
  });
}

// ─── Mutations ────────────────────────────────────────────────────────────────

/** Payload accepted by the device update endpoint. Send the whole record. */
export interface DeviceUpdateInput {
  id: number;
  name: string;
  uniqueId: string;
  phone?: string | null;
  model?: string | null;
  contact?: string | null;
  category?: string | null;
  disabled?: boolean;
  attributes?: Record<string, unknown>;
}

export function useUpdateDevice() {
  const queryClient = useQueryClient();

  return useMutation<TraccarDevice, Error, DeviceUpdateInput>({
    mutationFn: (device) =>
      traccarMutate<TraccarDevice>('PUT', '/api/traccar/devices/manage', { body: device }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trackingKeys.devices() });
    },
  });
}

export function useDeleteDevice() {
  const queryClient = useQueryClient();

  return useMutation<{ success: boolean }, Error, number>({
    mutationFn: (id) =>
      traccarMutate<{ success: boolean }>('DELETE', '/api/traccar/devices/manage', {
        params: { id },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trackingKeys.devices() });
      queryClient.invalidateQueries({ queryKey: trackingKeys.positions() });
    },
  });
}

export interface GeofenceInput {
  name: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
  description?: string;
}

export function useCreateGeofence() {
  const queryClient = useQueryClient();

  return useMutation<unknown, Error, GeofenceInput>({
    mutationFn: (input) => traccarMutate('POST', '/api/traccar/geofence', { body: input }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trackingKeys.geofences() });
    },
  });
}

export function useDeleteGeofence() {
  const queryClient = useQueryClient();

  return useMutation<{ success: boolean }, Error, number>({
    mutationFn: (id) =>
      traccarMutate<{ success: boolean }>('DELETE', '/api/traccar/geofence', { params: { id } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trackingKeys.geofences() });
    },
  });
}

/** Drop every cached tracking query — used by the console's refresh button. */
export function useRefreshTracking() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: trackingKeys.all });
}

// ─── Operational post pins ────────────────────────────────────────────────────

/**
 * Fetch all active operational posts that have a lat/lng and return them
 * pre-shaped as MapPin[] with kind='post' for the fleet map.
 */
export function useOperationalPostPins(): UseQueryResult<MapPin[], Error> {
  return useQuery<MapPin[], Error>({
    queryKey: ['operational-posts', 'map-pins'],
    queryFn: async () => {
      const result = await getOperationalPosts();
      const posts = result.data ?? [];
      const pins: MapPin[] = [];
      for (const post of posts) {
        const lat = post.location?.latitude;
        const lng = post.location?.longitude;
        if (typeof lat !== 'number' || typeof lng !== 'number') continue;
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
        if (lat === 0 && lng === 0) continue; // PostForm default — location not yet pinned
        const radius = (post.location as { geofenceRadius?: number }).geofenceRadius;
        pins.push({
          id: `post-${post.id ?? post.postCode}`,
          latitude: lat,
          longitude: lng,
          color: '#2563eb',
          title: post.postName,
          kind: 'post',
          radiusMetres: typeof radius === 'number' && radius > 0 ? radius : 50,
          lines: [
            post.clientName,
            `${post.totalGuards} guard${post.totalGuards !== 1 ? 's' : ''} · ${post.shiftType}`,
            post.location.address,
            `${lat.toFixed(6)}, ${lng.toFixed(6)}`,
            `Geofence: ${typeof radius === 'number' && radius > 0 ? radius : 50} m`,
            `Status: ${post.status}`,
          ],
        });
      }
      return pins;
    },
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
    retry: 0,
  });
}

// ─── Rented property pins ─────────────────────────────────────────────────────

/**
 * Fetch all active rented properties that have a lat/lng and return them
 * pre-shaped as MapPin[] with kind='property' for the fleet map.
 */
export function useRentedPropertyPins(): UseQueryResult<MapPin[], Error> {
  return useQuery<MapPin[], Error>({
    queryKey: ['rented-properties', 'map-pins'],
    queryFn: async () => {
      const properties = await getActiveRentedProperties();
      const pins: MapPin[] = [];
      for (const property of properties) {
        const lat = property.latitude;
        const lng = property.longitude;
        if (typeof lat !== 'number' || typeof lng !== 'number') continue;
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
        pins.push({
          id: `property-${property.id}`,
          latitude: lat,
          longitude: lng,
          color: '#ea580c',
          title: property.name,
          kind: 'property',
          lines: [
            property.address,
            ...(property.city ? [`${property.city}${property.state ? `, ${property.state}` : ''}`] : []),
            ...(property.capacity ? [`Capacity: ${property.capacity} staff`] : []),
            ...(property.landlordName ? [`Landlord: ${property.landlordName}`] : []),
          ],
        });
      }
      return pins;
    },
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
    retry: 0,
  });
}
