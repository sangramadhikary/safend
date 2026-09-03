'use client';

import { Badge } from "@/components/ui/badge";
import { OperationalPost } from "@/services/supabase/OperationalPostService";
import { activeServiceTypeKeys, serviceTypeLabel } from "@/modules/shared/constants/serviceTypes";
import { Moon, Sun, Sunset, Users } from "lucide-react";

interface PostServiceDisplayProps {
  post: OperationalPost;
}

/**
 * Colours only. The key→label map and the "which services does this post
 * actually staff" logic come from the canonical module — this file used to keep
 * its own list which was missing `pso`, `bouncers` and `manpower`, so those
 * work-order services rendered nowhere in Operations.
 */
const SERVICE_COLORS: Record<string, string> = {
  unarmedGuards: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  armedGuards: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  supervisors: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  patrolOfficers: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  pso: 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300',
  bouncers: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  manpower: 'bg-slate-100 text-slate-800 dark:bg-slate-800/40 dark:text-slate-300',
  eventSecurity: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  personalSecurity: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300',
};

const serviceColor = (key: string) =>
  SERVICE_COLORS[key] ?? 'bg-gray-100 text-gray-800 dark:bg-gray-800/40 dark:text-gray-300';

/** A shift only counts as staffed when it is enabled AND has a quantity. */
const isShiftStaffed = (shift: any) =>
  Boolean(shift?.enabled) && (Number(shift?.quantity) || 0) > 0;

const SHIFT_ICONS: Record<string, React.ReactNode> = {
  day: <Sun className="h-3.5 w-3.5" />,
  afternoon: <Sunset className="h-3.5 w-3.5" />,
  night: <Moon className="h-3.5 w-3.5" />,
};

const SHIFT_LABELS: Record<string, string> = {
  day: 'Day',
  afternoon: 'Afternoon',
  night: 'Night',
};

export function PostServiceDisplay({ post }: PostServiceDisplayProps) {
  // Normalise to new format
  let displayData: any = post.serviceInstances;

  if (!displayData || Object.keys(displayData).length === 0) {
    if (post.securityServices && Object.keys(post.securityServices).length > 0) {
      displayData = {};
      Object.keys(post.securityServices).forEach(key => {
        const svc = (post.securityServices as any)[key];
        if (svc) {
          (displayData as any)[key] = [{
            id: `${key}-1`,
            shiftType: svc.shiftType || '8H',
            shifts: svc.shifts || {
              day: { enabled: false, quantity: 0 },
              afternoon: { enabled: false, quantity: 0 },
              night: { enabled: false, quantity: 0 },
            },
          }];
        }
      });
    }
  }

  if (!displayData || Object.keys(displayData).length === 0) {
    return (
      <div className="text-center py-6 text-muted-foreground text-sm">
        No service configuration found for this post.
      </div>
    );
  }

  const countTypeGuards = (key: string) =>
    ((displayData as any)?.[key] || []).reduce((s: number, inst: any) =>
      s + ['day', 'afternoon', 'night'].reduce((ss: number, sh: string) =>
        ss + (isShiftStaffed(inst.shifts?.[sh]) ? (Number(inst.shifts[sh].quantity) || 0) : 0), 0), 0);

  // Canonical resolution: includes pso / bouncers / manpower, keeps legacy types
  // visible, and requires quantity > 0 so pre-seeded empty rows are not shown.
  const activeTypes = activeServiceTypeKeys(displayData).map((key) => ({
    key,
    label: serviceTypeLabel(key),
    color: serviceColor(key),
  }));

  if (activeTypes.length === 0) {
    return (
      <div className="text-center py-6 text-muted-foreground text-sm">
        No active services configured for this post.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {activeTypes.map(({ key, label, color }) => {
        const instances = (displayData as any)?.[key] || [];
        const totalGuards = countTypeGuards(key);
        const staffed = instances.filter((inst: any) =>
          ['day', 'afternoon', 'night'].some((s) => isShiftStaffed(inst.shifts?.[s]))
        );
        // A service can hold both an 8H and a 12H instance; a single header badge
        // taken from instances[0] mislabelled the rest.
        const shiftTypes = Array.from(new Set(staffed.map((i: any) => (i.shiftType === '12H' ? '12-Hour' : '8-Hour'))));

        return (
          <div key={key} className="rounded-lg border bg-white dark:bg-gray-800/50 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border-b">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <span className="font-semibold text-sm">{label}</span>
                <Badge className={`text-xs ${color}`}>{totalGuards} guards</Badge>
              </div>
              <div className="flex items-center gap-1.5">
                {shiftTypes.map((st) => (
                  <Badge key={st as string} variant="outline" className="text-xs">{st as string}</Badge>
                ))}
              </div>
            </div>

            {/* Shift rows */}
            <div className="divide-y">
              {instances.map((inst: any, idx: number) => {
                const activeShifts = ['day', 'afternoon', 'night'].filter(s => isShiftStaffed(inst.shifts?.[s]));
                if (activeShifts.length === 0) return null;
                const role = String(inst?.manpowerRole || '').trim();
                return (
                  <div key={inst.id || idx} className="px-4 py-3">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      {staffed.length > 1 && (
                        <span className="text-xs text-muted-foreground">Instance {idx + 1}</span>
                      )}
                      {/* Manpower roles are distinct designations, not interchangeable. */}
                      {role && <Badge variant="secondary" className="text-xs">{role}</Badge>}
                      {shiftTypes.length > 1 && (
                        <Badge variant="outline" className="text-xs">
                          {inst.shiftType === '12H' ? '12-Hour' : '8-Hour'}
                        </Badge>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {activeShifts.map(shift => (
                        <div key={shift} className="flex items-center gap-1.5 bg-gray-50 dark:bg-gray-900 rounded-md px-3 py-1.5 text-sm">
                          {SHIFT_ICONS[shift]}
                          <span className="text-muted-foreground">{SHIFT_LABELS[shift]}</span>
                          <span className="font-semibold ml-1">{inst.shifts[shift].quantity}</span>
                          <span className="text-xs text-muted-foreground">guards</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
