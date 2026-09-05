'use client';

import { useQuery } from '@tanstack/react-query';
import { getVehicles, getAllVehicles, getTripLogs } from '@/services/fleet/FleetService';
import { getBranchScope } from '@/utils/branchScope';
import type { Vehicle, TripLog } from '@/types/fleet';

/**
 * Active/available vehicles for the current branch, for selection dropdowns
 * (e.g. Fuel reimbursements). Main users (no branch scope) see all vehicles.
 * Mirrors the useStaffMembers pattern.
 */
export function useVehicles(enabled = true) {
  const { data, isLoading, error } = useQuery<Vehicle[], Error>({
    queryKey: ['fleet', 'vehicles'],
    queryFn: async () => {
      const branchId = getBranchScope().id;
      return branchId ? getVehicles(branchId) : getAllVehicles();
    },
    enabled,
  });
  return { vehicles: data ?? [], isLoading, error: error ?? null };
}

/**
 * Trip logs for a given vehicle (server-side filtered). Enabled only once a
 * vehicle is chosen, so the optional Trip picker stays scoped and cheap.
 */
export function useTripLogs(vehicleId: string | undefined, enabled = true) {
  const { data, isLoading, error } = useQuery<TripLog[], Error>({
    queryKey: ['fleet', 'trip-logs', vehicleId ?? 'none'],
    queryFn: async () => {
      const branchId = getBranchScope().id;
      // getTripLogs requires a branchId; for main users fall back to an empty
      // string which the service treats as unscoped where applicable.
      return getTripLogs(branchId ?? '', vehicleId);
    },
    enabled: enabled && !!vehicleId,
  });
  return { tripLogs: data ?? [], isLoading, error: error ?? null };
}
