'use client';

import { useCallback, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import { MapPinPicker } from "@/components/ui/map-pin-picker";

// ── Shared constants/helpers (mirrors QuotationForm) ────────────────────────
// Wage categories per industry standard (FICCI / PSARA / CLC Watch & Ward notification):
//   Unarmed Guards  → Semi-Skilled  (PSARA-certified, trained — not unskilled)
//   Armed Guards    → Skilled       (weapon licence, higher training)
//   Supervisors     → Highly Skilled (supervisory role, PSARA-certified)
//   Patrol Officers → Skilled       (mobile patrol, trained)
//   PSO             → Highly Skilled (personal protection, highest training)
//   Bouncers        → Skilled       (physical security specialism)
//   Manpower        → Unskilled     (general labour / support roles)
// Rates: Odisha 2026 notification (₹/day incl. VDA), effective 1 April 2026
// Source: Govt. of Odisha / ETHRWorld notification:
//   Unskilled ₹472 · Semi-Skilled ₹522 · Skilled ₹572 · Highly Skilled ₹622
const MIN_WAGE_DAILY: Record<string, number> = {
  unarmedGuards:  522,  // Semi-Skilled
  armedGuards:    572,  // Skilled
  supervisors:    622,  // Highly Skilled
  patrolOfficers: 572,  // Skilled
  pso:            622,  // Highly Skilled
  bouncers:       572,  // Skilled
  manpower:       472,  // Unskilled (general labour)
};
const STATUTORY_RATE = 0.1611;
const WORKING_DAYS_PER_MONTH = 26;

export const computeMinWageMonthlyRate = (serviceType: string, shiftType: string, margin: number, manpowerRole?: string): number => {
  // For manpower, look up the role-specific daily rate if available
  const dailyWage = serviceType === 'manpower' && manpowerRole && MANPOWER_ROLE_CATEGORY[manpowerRole]
    ? MANPOWER_ROLE_CATEGORY[manpowerRole].dailyRate
    : (MIN_WAGE_DAILY[serviceType] || 0);
  const statutory = dailyWage * STATUTORY_RATE;
  const dailyCTC = dailyWage + statutory;
  const totalDailyBilling = dailyCTC * (1 + margin / 100);
  const shiftMultiplier = shiftType === '12H' ? 1.5 : 1;
  return Math.round(totalDailyBilling * shiftMultiplier * WORKING_DAYS_PER_MONTH);
};

export type ServiceDay = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

type MonetaryRate = number | string;

export interface ServiceInstance {
  id: string;
  shiftType: string;
  /** Only used for the "manpower" service type */
  manpowerRole?: string;
  shifts: {
    day: { enabled: boolean; quantity: number; rate: MonetaryRate };
    afternoon: { enabled: boolean; quantity: number; rate: MonetaryRate };
    night: { enabled: boolean; quantity: number; rate: MonetaryRate };
  };
  /** Which calendar days this service instance is active */
  serviceDays: Record<ServiceDay, boolean>;
}

export interface ServiceInstancesMap {
  unarmedGuards: ServiceInstance[];
  armedGuards: ServiceInstance[];
  supervisors: ServiceInstance[];
  patrolOfficers: ServiceInstance[];
  pso: ServiceInstance[];
  bouncers: ServiceInstance[];
  manpower: ServiceInstance[];
}

export const generateServiceId = () => `svc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

export const ALL_SERVICE_DAYS: ServiceDay[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

export const DEFAULT_SERVICE_DAYS: Record<ServiceDay, boolean> = {
  mon: true, tue: true, wed: true, thu: true, fri: true, sat: true, sun: true,
};

export const createDefaultServiceInstance = (): ServiceInstance => ({
  id: generateServiceId(),
  shiftType: "8H",
  shifts: {
    day: { enabled: false, quantity: 0, rate: 0 },
    afternoon: { enabled: false, quantity: 0, rate: 0 },
    night: { enabled: false, quantity: 0, rate: 0 },
  },
  serviceDays: { ...DEFAULT_SERVICE_DAYS },
});

export const createEmptyServiceInstances = (): ServiceInstancesMap => ({
  unarmedGuards: [createDefaultServiceInstance()],
  armedGuards: [createDefaultServiceInstance()],
  supervisors: [createDefaultServiceInstance()],
  patrolOfficers: [createDefaultServiceInstance()],
  pso: [createDefaultServiceInstance()],
  bouncers: [createDefaultServiceInstance()],
  manpower: [createDefaultServiceInstance()],
});

// ── Per-post service instances type ──────────────────────────────────────────
// Each post (by index string "0", "1", etc.) has its own independent
// ServiceInstancesMap so pricing never bleeds between posts.
export type PerPostServiceInstances = Record<string, ServiceInstancesMap>;

/** Ensure every post index has a ServiceInstancesMap, adding defaults for new posts */
export function ensurePerPostInstances(
  perPost: PerPostServiceInstances,
  postCount: number
): PerPostServiceInstances {
  const result = { ...perPost };
  for (let i = 0; i < postCount; i++) {
    if (!result[String(i)]) {
      result[String(i)] = createEmptyServiceInstances();
    }
  }
  return result;
}

/** Get the ServiceInstancesMap for a specific post, defaulting if missing */
export function getPostServiceInstances(
  perPost: PerPostServiceInstances,
  postIndex: number
): ServiceInstancesMap {
  return perPost[String(postIndex)] ?? createEmptyServiceInstances();
}

const rateAsNumber = (rate: MonetaryRate): number => {
  const parsed = typeof rate === 'number' ? rate : parseFloat(rate);
  return Number.isFinite(parsed) ? parsed : 0;
};

/** Monthly value of one post's services, before GST */
export function calculatePostMonthlySubtotal(svcMap: ServiceInstancesMap): number {
  let total = 0;
  (Object.keys(svcMap) as (keyof ServiceInstancesMap)[]).forEach((svcType) => {
    (svcMap[svcType] || []).forEach((inst) => {
      if (inst.shifts.day.enabled) total += inst.shifts.day.quantity * rateAsNumber(inst.shifts.day.rate);
      if (inst.shifts.afternoon.enabled && inst.shiftType === '8H') total += inst.shifts.afternoon.quantity * rateAsNumber(inst.shifts.afternoon.rate);
      if (inst.shifts.night.enabled) total += inst.shifts.night.quantity * rateAsNumber(inst.shifts.night.rate);
    });
  });
  return total;
}

/** Compute the grand total across ALL posts */
export function calculateAllPostsTotal(perPost: PerPostServiceInstances, gstPercentage: number, gstExempt: boolean): number {
  const total = Object.values(perPost).reduce((sum, svcMap) => sum + calculatePostMonthlySubtotal(svcMap), 0);
  const gst = gstExempt ? 0 : total * gstPercentage / 100;
  return total + gst;
}

const SERVICE_LABELS: { key: keyof ServiceInstancesMap; label: string }[] = [
  { key: 'unarmedGuards', label: 'Unarmed Guards' },
  { key: 'armedGuards', label: 'Armed Guards' },
  { key: 'supervisors', label: 'Supervisors' },
  { key: 'patrolOfficers', label: 'Patrol Officers' },
  { key: 'pso', label: 'PSO' },
  { key: 'bouncers', label: 'Bouncers' },
  { key: 'manpower', label: 'Manpower' },
];

// Manpower role → wage category mapping
// Based on standard Indian labour law classification (Minimum Wages Act, 1948):
//   Unskilled    — physically simple tasks, no prior training/experience needed
//   Semi-Skilled — some experience/responsibility required; no formal trade certificate
//   Skilled      — ITI-level trade qualification or equivalent trade experience
//   Highly Skilled — professional qualification or supervisory/specialist role
// Rates: Odisha 2026 notification (effective 1 April 2026):
//   Unskilled ₹472 · Semi-Skilled ₹522 · Skilled ₹572 · Highly Skilled ₹622
const MANPOWER_ROLE_CATEGORY: Record<string, { category: string; dailyRate: number }> = {
  // Unskilled — ₹472/day: basic physical/errand tasks, no prior experience needed
  'Peon':          { category: 'Unskilled', dailyRate: 472 },
  'OfficeBoy':     { category: 'Unskilled', dailyRate: 472 },
  'Labor':         { category: 'Unskilled', dailyRate: 472 },
  'DeliveryBoy':   { category: 'Unskilled', dailyRate: 472 },
  'Housekeeping':  { category: 'Unskilled', dailyRate: 472 },
  'Attendant':     { category: 'Unskilled', dailyRate: 472 },

  // Semi-Skilled — ₹522/day: requires experience, responsibility, or domain familiarity
  'Cook':          { category: 'Semi-Skilled', dailyRate: 522 },
  'Driver':        { category: 'Semi-Skilled', dailyRate: 522 },
  'Gardner':       { category: 'Semi-Skilled', dailyRate: 522 },  // plant care / landscaping
  'Servant':       { category: 'Semi-Skilled', dailyRate: 522 },  // domestic service; trust-based
  'CareTaker':     { category: 'Semi-Skilled', dailyRate: 522 },
  'BabySitter':    { category: 'Semi-Skilled', dailyRate: 522 },  // childcare responsibility
  'Pet-CareTaker': { category: 'Semi-Skilled', dailyRate: 522 },  // animal handling experience
  'Pujari':        { category: 'Semi-Skilled', dailyRate: 522 },  // religious knowledge / training
  'OfficeAssistant': { category: 'Semi-Skilled', dailyRate: 522 }, // admin-support with office tools

  // Skilled — ₹572/day: ITI-level trade qualification or equivalent trade experience
  'Plumber':       { category: 'Skilled', dailyRate: 572 },
  'Carpenter':     { category: 'Skilled', dailyRate: 572 },
  'Electrician':   { category: 'Skilled', dailyRate: 572 },
  'Technician':    { category: 'Skilled', dailyRate: 572 },
  'Welder':        { category: 'Skilled', dailyRate: 572 },
  'Mason':         { category: 'Skilled', dailyRate: 572 },
  'Painter':       { category: 'Skilled', dailyRate: 572 },       // trade painter (not artist)
  'Mechanic':      { category: 'Skilled', dailyRate: 572 },

  // Highly Skilled — ₹622/day: professional qualification or supervisory/specialist role
  'Accountant':    { category: 'Highly Skilled', dailyRate: 622 },
  'Supervisor':    { category: 'Highly Skilled', dailyRate: 622 },
  'DataEntryOp':   { category: 'Highly Skilled', dailyRate: 622 }, // computer operator / DEO
};

const MANPOWER_ROLES = Object.keys(MANPOWER_ROLE_CATEGORY);

interface SecurityPostsEditorProps {
  locations: any[];
  /** Per-post service instances: key = post index string ("0", "1", ...) */
  perPostServiceInstances: PerPostServiceInstances;
  gstPercentage: number;
  gstExempt: boolean;
  expandedPostIndex: number | null;
  servicesExpandedForPost: number | null;
  onExpandedPostChange: (index: number | null) => void;
  onServicesExpandedChange: (index: number | null) => void;
  onLocationsChange: (locations: any[]) => void;
  /** Called with the updated map for a SINGLE post's services */
  onPostServiceInstancesChange: (postIndex: number, next: ServiceInstancesMap) => void;
  /** Optional pincode lookup to auto-fill district/state */
  fetchPincodeDetails?: (locationIndex: number, pincode: string) => void;
  readOnlyPricing?: boolean;
}

export function SecurityPostsEditor({
  locations,
  perPostServiceInstances,
  gstPercentage,
  gstExempt,
  expandedPostIndex,
  servicesExpandedForPost,
  onExpandedPostChange,
  onServicesExpandedChange,
  onLocationsChange,
  onPostServiceInstancesChange,
  fetchPincodeDetails,
}: SecurityPostsEditorProps) {
  // Track which service types are expanded (by key)
  const [expandedServices, setExpandedServices] = useState<Set<string>>(new Set());

  // The active post index for service editing (the one with services panel open)
  const activePostIndex = servicesExpandedForPost ?? 0;

  // Get service instances for the currently active post
  const serviceInstances = getPostServiceInstances(perPostServiceInstances, activePostIndex);

  // Convenience: emit changes scoped to the active post
  const onServiceInstancesChange = (next: ServiceInstancesMap) => {
    onPostServiceInstancesChange(activePostIndex, next);
  };

  const toggleServiceExpanded = (key: string) => {
    setExpandedServices(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // ── Calculations ──────────────────────────────────────────────────────────
  const calculateInstanceTotal = (instance: ServiceInstance) => {
    let total = 0;
    if (instance.shifts.day.enabled) total += instance.shifts.day.quantity * rateAsNumber(instance.shifts.day.rate);
    if (instance.shifts.afternoon.enabled && instance.shiftType === "8H") total += instance.shifts.afternoon.quantity * rateAsNumber(instance.shifts.afternoon.rate);
    if (instance.shifts.night.enabled) total += instance.shifts.night.quantity * rateAsNumber(instance.shifts.night.rate);
    return total;
  };

  const calculateServiceTypeTotal = (serviceType: keyof ServiceInstancesMap) =>
    (serviceInstances[serviceType] || []).reduce((total, inst) => total + calculateInstanceTotal(inst), 0);

  const calculateSubtotal = () => {
    let subtotal = 0;
    (Object.keys(serviceInstances) as (keyof ServiceInstancesMap)[]).forEach((serviceType) => {
      subtotal += calculateServiceTypeTotal(serviceType);
    });
    return subtotal;
  };

  const calculateTotal = () => {
    const subtotal = calculateSubtotal();
    const gstAmount = gstExempt ? 0 : (subtotal * gstPercentage / 100);
    return subtotal + gstAmount;
  };

  const guardsExceedLimit = () => {
    const used = calculateTotalGuardsUsed();
    const limit = getTotalGuardsLimit();
    return limit > 0 && used > limit;
  };

  const getTotalGuardsLimit = () => {
    // Limit for the currently active post only
    return (locations[activePostIndex] as any)?.guards || 0;
  };

  const calculateTotalGuardsUsed = () => {
    // Count guards assigned in the current post's service instances only
    let totalGuards = 0;
    (Object.keys(serviceInstances) as (keyof ServiceInstancesMap)[]).forEach((serviceType) => {
      serviceInstances[serviceType].forEach((instance) => {
        if (instance.shifts.day.enabled) totalGuards += instance.shifts.day.quantity;
        if (instance.shifts.afternoon.enabled && instance.shiftType === "8H") totalGuards += instance.shifts.afternoon.quantity;
        if (instance.shifts.night.enabled) totalGuards += instance.shifts.night.quantity;
      });
    });
    return totalGuards;
  };

  const getActiveMinWageMargin = (): number | null => {
    // Use the currently active post's margin, not all posts
    const activeLoc = locations[activePostIndex] as any;
    if (activeLoc?.asPerStateMinWage && activeLoc?.profitMargin && parseFloat(activeLoc.profitMargin) >= 3) {
      return parseFloat(activeLoc.profitMargin);
    }
    return null;
  };

  // ── Service instance mutations ──────────────────────────────────────────────
  const addServiceInstance = (serviceType: keyof ServiceInstancesMap) => {
    onServiceInstancesChange({
      ...serviceInstances,
      [serviceType]: [...(serviceInstances[serviceType] || []), createDefaultServiceInstance()],
    });
  };

  const removeServiceInstance = (serviceType: keyof ServiceInstancesMap, instanceId: string) => {
    onServiceInstancesChange({
      ...serviceInstances,
      [serviceType]: (serviceInstances[serviceType] || []).filter(inst => inst.id !== instanceId),
    });
  };

  const updateInstanceShiftType = (serviceType: keyof ServiceInstancesMap, instanceId: string, shiftType: string) => {
    const minWageMargin = getActiveMinWageMargin();
    onServiceInstancesChange({
      ...serviceInstances,
      [serviceType]: serviceInstances[serviceType].map(inst => {
        if (inst.id !== instanceId) return inst;
        const updated = { ...inst, shiftType };
        if (minWageMargin !== null) {
          const newRate = computeMinWageMonthlyRate(serviceType, shiftType, minWageMargin, inst.manpowerRole);
          updated.shifts = {
            day: { ...inst.shifts.day, rate: inst.shifts.day.enabled ? newRate : inst.shifts.day.rate },
            afternoon: { ...inst.shifts.afternoon, rate: inst.shifts.afternoon.enabled ? newRate : inst.shifts.afternoon.rate },
            night: { ...inst.shifts.night, rate: inst.shifts.night.enabled ? newRate : inst.shifts.night.rate },
          };
        }
        return updated;
      }),
    });
  };

  const toggleInstanceShift = (serviceType: keyof ServiceInstancesMap, instanceId: string, shift: 'day' | 'afternoon' | 'night', enabled: boolean) => {
    const minWageMargin = getActiveMinWageMargin();
    onServiceInstancesChange({
      ...serviceInstances,
      [serviceType]: serviceInstances[serviceType].map(inst => {
        if (inst.id !== instanceId) return inst;
        const autoRate = (enabled && minWageMargin !== null)
          ? computeMinWageMonthlyRate(serviceType, inst.shiftType, minWageMargin, inst.manpowerRole)
          : inst.shifts[shift].rate;
        return {
          ...inst,
          shifts: { ...inst.shifts, [shift]: { ...inst.shifts[shift], enabled, rate: autoRate } },
        };
      }),
    });
  };

  const updateInstanceShiftQuantity = (serviceType: keyof ServiceInstancesMap, instanceId: string, shift: 'day' | 'afternoon' | 'night', value: string) => {
    const numValue = value === '' ? 0 : parseInt(value, 10) || 0;
    onServiceInstancesChange({
      ...serviceInstances,
      [serviceType]: serviceInstances[serviceType].map(inst =>
        inst.id === instanceId ? { ...inst, shifts: { ...inst.shifts, [shift]: { ...inst.shifts[shift], quantity: numValue } } } : inst
      ),
    });
  };

  const updateInstanceShiftRate = (serviceType: keyof ServiceInstancesMap, instanceId: string, shift: 'day' | 'afternoon' | 'night', value: string) => {
    // Retain the text while the user is typing (including a trailing decimal
    // point), but accept at most two fractional digits for currency rates.
    const [whole = '', ...fractionParts] = value.replace(/[^\d.]/g, '').split('.');
    const normalizedValue = fractionParts.length > 0
      ? `${whole}.${fractionParts.join('').slice(0, 2)}`
      : whole;
    onServiceInstancesChange({
      ...serviceInstances,
      [serviceType]: serviceInstances[serviceType].map(inst =>
        inst.id === instanceId ? { ...inst, shifts: { ...inst.shifts, [shift]: { ...inst.shifts[shift], rate: normalizedValue } } } : inst
      ),
    });
  };

  const updateInstanceManpowerRole = (instanceId: string, role: string) => {
    const minWageMargin = getActiveMinWageMargin();
    onServiceInstancesChange({
      ...serviceInstances,
      manpower: serviceInstances.manpower.map(inst => {
        if (inst.id !== instanceId) return { ...inst, manpowerRole: role };
        const updated = { ...inst, manpowerRole: role };
        // Auto-recalculate rates for enabled shifts when min-wage is active
        if (minWageMargin !== null) {
          const newRate = computeMinWageMonthlyRate('manpower', inst.shiftType, minWageMargin, role);
          updated.shifts = {
            day: { ...inst.shifts.day, rate: inst.shifts.day.enabled ? newRate : inst.shifts.day.rate },
            afternoon: { ...inst.shifts.afternoon, rate: inst.shifts.afternoon.enabled ? newRate : inst.shifts.afternoon.rate },
            night: { ...inst.shifts.night, rate: inst.shifts.night.enabled ? newRate : inst.shifts.night.rate },
          };
        }
        return updated;
      }),
    });
  };

  const toggleInstanceServiceDay = (serviceType: keyof ServiceInstancesMap, instanceId: string, day: ServiceDay, enabled: boolean) => {
    onServiceInstancesChange({
      ...serviceInstances,
      [serviceType]: serviceInstances[serviceType].map(inst =>
        inst.id !== instanceId ? inst : {
          ...inst,
          serviceDays: { ...(inst.serviceDays ?? { ...DEFAULT_SERVICE_DAYS }), [day]: enabled },
        }
      ),
    });
  };

  // ── Location mutations ──────────────────────────────────────────────────────
  const handleLocationChange = useCallback((index: number, field: string, value: string) => {
    const updatedLocations = [...locations];
    if (field === 'guards') {
      updatedLocations[index] = { ...updatedLocations[index], [field]: parseInt(value, 10) || 0 };
    } else if (field === 'asPerStateMinWage') {
      updatedLocations[index] = { ...updatedLocations[index], [field]: value === 'true' };
    } else {
      updatedLocations[index] = { ...updatedLocations[index], [field]: value };
    }
    onLocationsChange(updatedLocations);

    if (field === 'profitMargin' || field === 'asPerStateMinWage') {
      const loc: any = updatedLocations[index];
      const isMinWage = field === 'asPerStateMinWage' ? value === 'true' : loc.asPerStateMinWage;
      const margin = field === 'profitMargin' ? parseFloat(value) : parseFloat(loc.profitMargin);
      if (isMinWage && !isNaN(margin) && margin >= 3) {
        // Only update THIS post's service instances (keyed by index)
        const postSvcMap = getPostServiceInstances(perPostServiceInstances, index);
        const next = { ...postSvcMap };
        (Object.keys(next) as (keyof ServiceInstancesMap)[]).forEach((serviceType) => {
          next[serviceType] = next[serviceType].map((inst) => {
            const rate = computeMinWageMonthlyRate(serviceType as string, inst.shiftType, margin, inst.manpowerRole);
            return {
              ...inst,
              shifts: {
                day: { ...inst.shifts.day, rate: inst.shifts.day.enabled ? rate : inst.shifts.day.rate },
                afternoon: { ...inst.shifts.afternoon, rate: inst.shifts.afternoon.enabled ? rate : inst.shifts.afternoon.rate },
                night: { ...inst.shifts.night, rate: inst.shifts.night.enabled ? rate : inst.shifts.night.rate },
              },
            };
          });
        });
        onPostServiceInstancesChange(index, next);
      }
    }
  }, [locations, serviceInstances, onLocationsChange, onServiceInstancesChange]);

  const addLocation = () => {
    const newIndex = locations.length;
    onLocationsChange([...locations, { name: "", address: "", city: "", state: "", pincode: "", guards: 0 }]);
    // Initialize a fresh service instances map for the new post
    onPostServiceInstancesChange(newIndex, createEmptyServiceInstances());
    // Auto-expand the newly added post
    onExpandedPostChange(newIndex);
  };

  const removeLocation = (index: number) => {
    const updatedLocations = [...locations];
    updatedLocations.splice(index, 1);
    onLocationsChange(updatedLocations);

    // Rebuild per-post instances with shifted indices
    const newPerPost: PerPostServiceInstances = {};
    updatedLocations.forEach((_, newIdx) => {
      const oldIdx = newIdx >= index ? newIdx + 1 : newIdx;
      newPerPost[String(newIdx)] = getPostServiceInstances(perPostServiceInstances, oldIdx);
    });
    // Emit all updated posts at once by calling for each
    Object.entries(newPerPost).forEach(([idx, svcMap]) => {
      onPostServiceInstancesChange(Number(idx), svcMap);
    });
    // Clear any removed post entries above the new length
    for (let i = updatedLocations.length; i < locations.length; i++) {
      onPostServiceInstancesChange(i, createEmptyServiceInstances());
    }

    if (expandedPostIndex === index) {
      onExpandedPostChange(null);
    } else if (expandedPostIndex !== null && expandedPostIndex > index) {
      onExpandedPostChange(expandedPostIndex - 1);
    }
  };

  // ── Render a single service category block ───────────────────────────────────
  const renderServiceSection = (serviceType: keyof ServiceInstancesMap, label: string) => {
    const isExpanded = expandedServices.has(serviceType);
    const total = calculateServiceTypeTotal(serviceType);
    
    return (
      <div className="border rounded-lg overflow-hidden">
        {/* Collapsible header */}
        <div 
          className={`flex justify-between items-center px-4 py-2.5 cursor-pointer transition-colors ${isExpanded ? 'bg-gray-100 dark:bg-gray-800' : 'bg-gray-50 dark:bg-gray-900 hover:bg-gray-100 dark:hover:bg-gray-800'}`}
          onClick={() => toggleServiceExpanded(serviceType)}
        >
          <div className="flex items-center gap-2">
            {isExpanded ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
            <h4 className="font-semibold text-sm">{label}</h4>
          </div>
          <span className={`font-bold text-sm ${total > 0 ? 'text-[#D71920]' : 'text-muted-foreground'}`}>₹{total.toLocaleString()}</span>
        </div>

        {/* Expanded content */}
        {isExpanded && (
          <div className="p-3 space-y-3 border-t">
            {(serviceInstances[serviceType] || []).map((instance, instIdx) => (
              <div key={instance.id} className="p-3 bg-white dark:bg-gray-800 rounded border">
                <div className="flex justify-between items-center mb-2">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-xs font-medium text-muted-foreground">Instance {instIdx + 1}</span>
                    <Select value={instance.shiftType} onValueChange={(value) => updateInstanceShiftType(serviceType, instance.id, value)}>
                      <SelectTrigger className="h-7 w-24 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="8H">8-Hour</SelectItem>
                        <SelectItem value="12H">12-Hour</SelectItem>
                      </SelectContent>
                    </Select>
                    {serviceType === 'manpower' && (
                      <Select
                        value={instance.manpowerRole || ''}
                        onValueChange={(value) => updateInstanceManpowerRole(instance.id, value)}
                      >
                        <SelectTrigger className="h-7 w-40 text-xs">
                          <SelectValue placeholder="Select role" />
                        </SelectTrigger>
                        <SelectContent>
                          {MANPOWER_ROLES.map((role) => {
                            const info = MANPOWER_ROLE_CATEGORY[role];
                            return (
                              <SelectItem key={role} value={role}>
                                <span>{role}</span>
                                <span className="ml-2 text-[10px] text-muted-foreground">({info.category})</span>
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">₹{calculateInstanceTotal(instance).toLocaleString()}</span>
                    {(serviceInstances[serviceType] || []).length > 1 && (
                      <Button type="button" variant="ghost" size="sm" className="text-red-500 hover:text-red-700 h-6 w-6 p-0" onClick={() => removeServiceInstance(serviceType, instance.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>

                {/* Shift rows */}
                <div className="space-y-1.5">
                  {/* Header */}
                  <div className="flex items-center gap-3 text-[10px] text-muted-foreground pl-6">
                    <span className="w-20" />
                    <span className="flex-1 text-center">Qty</span>
                    <span className="flex-2">Rate (₹/mo)</span>
                  </div>
                  {/* Day */}
                  <div className="flex items-center gap-3">
                    <Checkbox checked={instance.shifts.day.enabled} onCheckedChange={(checked) => toggleInstanceShift(serviceType, instance.id, 'day', checked === true)} className="h-3.5 w-3.5" />
                    <Label className="text-xs w-20">Day</Label>
                    <Input type="text" inputMode="numeric" value={instance.shifts.day.quantity || ''} onFocus={(e) => e.target.value === '0' && (e.target.value = '')} onChange={(e) => updateInstanceShiftQuantity(serviceType, instance.id, 'day', e.target.value.replace(/\D/g, ''))} onWheel={(e) => e.currentTarget.blur()} className="h-8 flex-1 text-xs text-center" disabled={!instance.shifts.day.enabled} />
                    <Input type="text" inputMode="decimal" value={instance.shifts.day.rate || ''} onFocus={(e) => e.target.value === '0' && (e.target.value = '')} onChange={(e) => updateInstanceShiftRate(serviceType, instance.id, 'day', e.target.value)} onWheel={(e) => e.currentTarget.blur()} placeholder="0.00" className="h-8 flex-2 text-xs" disabled={!instance.shifts.day.enabled} />
                  </div>
                  {/* Afternoon (only 8H) */}
                  {instance.shiftType === "8H" && (
                    <div className="flex items-center gap-3">
                      <Checkbox checked={instance.shifts.afternoon.enabled} onCheckedChange={(checked) => toggleInstanceShift(serviceType, instance.id, 'afternoon', checked === true)} className="h-3.5 w-3.5" />
                      <Label className="text-xs w-20">Afternoon</Label>
                      <Input type="text" inputMode="numeric" value={instance.shifts.afternoon.quantity || ''} onFocus={(e) => e.target.value === '0' && (e.target.value = '')} onChange={(e) => updateInstanceShiftQuantity(serviceType, instance.id, 'afternoon', e.target.value.replace(/\D/g, ''))} onWheel={(e) => e.currentTarget.blur()} className="h-8 flex-1 text-xs text-center" disabled={!instance.shifts.afternoon.enabled} />
                      <Input type="text" inputMode="decimal" value={instance.shifts.afternoon.rate || ''} onFocus={(e) => e.target.value === '0' && (e.target.value = '')} onChange={(e) => updateInstanceShiftRate(serviceType, instance.id, 'afternoon', e.target.value)} onWheel={(e) => e.currentTarget.blur()} placeholder="0.00" className="h-8 flex-2 text-xs" disabled={!instance.shifts.afternoon.enabled} />
                    </div>
                  )}
                  {/* Night */}
                  <div className="flex items-center gap-3">
                    <Checkbox checked={instance.shifts.night.enabled} onCheckedChange={(checked) => toggleInstanceShift(serviceType, instance.id, 'night', checked === true)} className="h-3.5 w-3.5" />
                    <Label className="text-xs w-20">Night</Label>
                    <Input type="text" inputMode="numeric" value={instance.shifts.night.quantity || ''} onFocus={(e) => e.target.value === '0' && (e.target.value = '')} onChange={(e) => updateInstanceShiftQuantity(serviceType, instance.id, 'night', e.target.value.replace(/\D/g, ''))} onWheel={(e) => e.currentTarget.blur()} className="h-8 flex-1 text-xs text-center" disabled={!instance.shifts.night.enabled} />
                    <Input type="text" inputMode="decimal" value={instance.shifts.night.rate || ''} onFocus={(e) => e.target.value === '0' && (e.target.value = '')} onChange={(e) => updateInstanceShiftRate(serviceType, instance.id, 'night', e.target.value)} onWheel={(e) => e.currentTarget.blur()} placeholder="0.00" className="h-8 flex-2 text-xs" disabled={!instance.shifts.night.enabled} />
                  </div>
                  {/* Service Days */}
                  <div className="pt-2 mt-1 border-t">
                    <Label className="text-[10px] text-muted-foreground mb-1.5 block">Service Days</Label>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {ALL_SERVICE_DAYS.map((d) => (
                        <label key={d} className="flex items-center gap-1 cursor-pointer select-none">
                          <Checkbox
                            className="h-3.5 w-3.5"
                            checked={instance.serviceDays?.[d] ?? true}
                            onCheckedChange={(checked) => toggleInstanceServiceDay(serviceType, instance.id, d, checked === true)}
                          />
                          <span className="text-xs font-medium capitalize">{d.charAt(0).toUpperCase() + d.slice(1)}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))}

            <Button type="button" variant="outline" size="sm" className="w-full border-dashed h-7 text-xs" onClick={() => addServiceInstance(serviceType)}>
              <Plus className="h-3 w-3 mr-1" /> Add {label} Instance
            </Button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center mb-2">
        <div>
          <h3 className="font-medium text-lg">Security Posts</h3>
          <p className="text-sm text-muted-foreground">Define posts with their locations and security services</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={addLocation}>
          <Plus className="h-4 w-4 mr-1" /> Add Post
        </Button>
      </div>

      {locations.length === 0 && (
        <div className="border-2 border-dashed border-gray-200 rounded-lg p-8 text-center">
          <p className="text-muted-foreground text-sm">No posts added yet.</p>
          <p className="text-muted-foreground text-xs mt-1">Click &quot;Add Post&quot; to define a security post location.</p>
        </div>
      )}

      {locations.map((location, index) => (
        <div key={index} className="border rounded-lg overflow-hidden mb-2">
          {/* Compact Post Header */}
          <div
            className={`flex items-center justify-between px-4 py-3 cursor-pointer transition-colors ${expandedPostIndex === index ? 'bg-red-50 border-b' : 'bg-gray-50 hover:bg-gray-100'}`}
            onClick={() => onExpandedPostChange(expandedPostIndex === index ? null : index)}
          >
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <span className="text-sm font-bold text-red-600 shrink-0">#{index + 1}</span>
              <span className="text-sm font-medium truncate">{location.name || 'Unnamed Post'}</span>
              {location.state && (
                <span className="text-xs text-muted-foreground hidden sm:inline">
                  • {location.district ? `${location.district}, ` : ''}{location.state}
                </span>
              )}
              {location.guards > 0 && (
                <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full shrink-0">
                  {location.guards} manpower
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button type="button" variant="ghost" size="sm" className="text-red-500 h-7 w-7 p-0 hover:text-red-700" onClick={(e) => { e.stopPropagation(); removeLocation(index); }}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
              {expandedPostIndex === index ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
            </div>
          </div>

          {/* Expanded Post Details */}
          {expandedPostIndex === index && (
            <div className="p-4">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Left: Form Fields */}
                <div className="space-y-3">
                  {/* Post Name + Address */}
                  <div className="space-y-1">
                    <Label className="text-xs">Post Name</Label>
                    <Input value={location.name || ""} onChange={(e) => handleLocationChange(index, 'name', e.target.value)} placeholder="Enter post name" className="h-9" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Address</Label>
                    <Input value={location.address || ""} onChange={(e) => handleLocationChange(index, 'address', e.target.value)} placeholder="Enter post address" className="h-9" />
                  </div>

                  {/* Pincode, District, State, Manpower */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Pincode</Label>
                      <Input
                        value={location.pincode || ""}
                        onChange={(e) => {
                          const val = e.target.value.replace(/\D/g, '').slice(0, 6);
                          handleLocationChange(index, 'pincode', val);
                          if (val.length === 6 && fetchPincodeDetails) fetchPincodeDetails(index, val);
                        }}
                        placeholder="6 digits"
                        maxLength={6}
                        className="h-9"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">District</Label>
                      <Input value={location.district || ""} onChange={(e) => handleLocationChange(index, 'district', e.target.value)} placeholder="From pincode" className="h-9" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">State</Label>
                      <Input value={location.state || ""} onChange={(e) => handleLocationChange(index, 'state', e.target.value)} placeholder="From pincode" className="h-9" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Total Manpower</Label>
                      <Input type="text" inputMode="numeric" value={location.guards || ''} onFocus={(e) => e.target.value === '0' && (e.target.value = '')} onChange={(e) => handleLocationChange(index, 'guards', e.target.value.replace(/\D/g, ''))} onWheel={(e) => e.currentTarget.blur()} placeholder="0" className="h-9" />
                    </div>
                  </div>

                  {/* Min wage checkbox */}
                  <div className="flex items-center space-x-2 pt-1">
                    <Checkbox
                      id={`minWage-${index}`}
                      checked={location.asPerStateMinWage || false}
                      onCheckedChange={(checked) => handleLocationChange(index, 'asPerStateMinWage', checked === true ? 'true' : 'false')}
                    />
                    <Label htmlFor={`minWage-${index}`} className="text-xs">As per State Minimum Wages</Label>
                  </div>
                </div>

                {/* Right: Map */}
                <div className="h-full min-h-[220px]">
                  <MapPinPicker
                    lat={location.lat ? parseFloat(location.lat) : undefined}
                    lng={location.lng ? parseFloat(location.lng) : undefined}
                    address={location.address || ''}
                    pincode={location.pincode || ''}
                    district={location.district || ''}
                    state={location.state || ''}
                    onChange={(lat, lng) => {
                      handleLocationChange(index, 'lat', lat.toString());
                      handleLocationChange(index, 'lng', lng.toString());
                    }}
                  />
                </div>
              </div>

              {location.asPerStateMinWage && (
                <div className="space-y-3 pt-2 pl-6 border-l-2 border-red-200">
                  <div className="space-y-1">
                    <Label className="text-xs font-medium">Profit / Agency Margin (%)</Label>
                    <Input
                      type="number"
                      min="3"
                      max="500"
                      value={location.profitMargin || ""}
                      onChange={(e) => {
                        let val = e.target.value;
                        if (val !== '' && parseInt(val, 10) > 500) val = '500';
                        handleLocationChange(index, 'profitMargin', val);
                      }}
                      placeholder="Min 3% — Max 500%"
                      className="h-9"
                    />
                  </div>

                  {location.profitMargin && parseInt(location.profitMargin) >= 3 && (
                    <div className="overflow-x-auto">
                      <p className="text-xs font-medium text-muted-foreground mb-2">Daily Billing Breakdown (as per latest Govt. notification)</p>
                      <table className="w-full text-xs border-collapse">
                        <thead>
                          <tr className="bg-gray-100 dark:bg-gray-800">
                            <th className="text-left p-2 border">Category</th>
                            <th className="text-right p-2 border">Daily Wage</th>
                            <th className="text-right p-2 border">Employer Statutory (PF+ESI)</th>
                            <th className="text-right p-2 border">Daily CTC</th>
                            <th className="text-right p-2 border">Agency Margin ({location.profitMargin}%)</th>
                            <th className="text-right p-2 border font-bold">Total Daily Billing</th>
                          </tr>
                        </thead>
                        <tbody>
                          {[
                            { category: 'Unarmed Guard (Semi-Skilled)',  dailyWage: 522 },
                            { category: 'Armed Guard (Skilled)',          dailyWage: 572 },
                            { category: 'Supervisor (Highly Skilled)',    dailyWage: 622 },
                            { category: 'Patrol Officer (Skilled)',       dailyWage: 572 },
                            { category: 'PSO (Highly Skilled)',           dailyWage: 622 },
                            { category: 'Bouncer (Skilled)',              dailyWage: 572 },
                            { category: 'Manpower (Unskilled)',           dailyWage: 472 },
                          ].map((row) => {
                            const margin = parseFloat(location.profitMargin) || 3;
                            const statutory = Math.round(row.dailyWage * 0.1611 * 100) / 100;
                            const dailyCTC = Math.round((row.dailyWage + statutory) * 100) / 100;
                            const agencyMargin = Math.round(dailyCTC * (margin / 100) * 100) / 100;
                            const totalBilling = Math.round((dailyCTC + agencyMargin) * 100) / 100;
                            return (
                              <tr key={row.category}>
                                <td className="p-2 border">{row.category}</td>
                                <td className="p-2 border text-right">₹{row.dailyWage.toFixed(2)}</td>
                                <td className="p-2 border text-right">₹{statutory.toFixed(2)}</td>
                                <td className="p-2 border text-right">₹{dailyCTC.toFixed(2)}</td>
                                <td className="p-2 border text-right">₹{agencyMargin.toFixed(2)}</td>
                                <td className="p-2 border text-right font-bold text-red-600">₹{totalBilling.toFixed(2)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                      <p className="text-[10px] text-muted-foreground mt-1 italic">* Statutory includes PF (13%) + ESI (3.25%) employer contribution. Rates as per latest state Govt. notification.</p>
                    </div>
                  )}
                </div>
              )}

              {/* Security Services - Nested Collapsible */}
              <div className="border-t pt-3 mt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full flex justify-between items-center h-9"
                  onClick={(e) => {
                    e.stopPropagation();
                    onServicesExpandedChange(servicesExpandedForPost === index ? null : index);
                  }}
                >
                  <span className="text-sm font-medium">Security Services for this Post</span>
                  {servicesExpandedForPost === index ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>

                {servicesExpandedForPost === index && (
                  <div className="mt-3 p-4 bg-white dark:bg-gray-800 rounded-md border">
                    <Label className="text-base font-medium mb-4 block">Service Details</Label>

                    {guardsExceedLimit() && (
                      <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
                        <svg className="h-5 w-5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                        <span className="text-sm font-medium">
                          Guards exceed limit! You&apos;ve assigned {calculateTotalGuardsUsed()} guards but the total limit is {getTotalGuardsLimit()}.
                        </span>
                      </div>
                    )}

                    <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-muted-foreground">Guards Assigned</span>
                        <span className={`font-semibold ${guardsExceedLimit() ? 'text-red-600' : 'text-green-600'}`}>
                          {calculateTotalGuardsUsed()} / {getTotalGuardsLimit() || '∞'}
                        </span>
                      </div>
                      {getTotalGuardsLimit() > 0 && (
                        <div className="mt-2 h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className={`h-full transition-all ${guardsExceedLimit() ? 'bg-red-500' : 'bg-green-500'}`}
                            style={{ width: `${Math.min((calculateTotalGuardsUsed() / getTotalGuardsLimit()) * 100, 100)}%` }}
                          />
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      {SERVICE_LABELS.map(({ key, label }) => (
                        <div key={key}>{renderServiceSection(key, label)}</div>
                      ))}

                      {/* Totals */}
                      <div className="border-t-2 pt-4 mt-6">
                        <div className="flex justify-between items-center py-2">
                          <span className="font-semibold text-lg">Subtotal</span>
                          <span className="font-bold text-xl">₹{calculateSubtotal().toLocaleString()}</span>
                        </div>
                        {!gstExempt && (
                          <div className="flex justify-between items-center py-2 text-muted-foreground">
                            <span>GST ({gstPercentage}%)</span>
                            <span>₹{(calculateSubtotal() * gstPercentage / 100).toFixed(2)}</span>
                          </div>
                        )}
                        <div className="flex justify-between items-center py-3 border-t-2 border-[#D71920] mt-2">
                          <span className="font-bold text-xl">Grand Total</span>
                          <span className="font-bold text-2xl text-[#D71920]">₹{calculateTotal().toLocaleString()}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
