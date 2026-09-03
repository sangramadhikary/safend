/**
 * Pricing model for the public pricing page.
 *
 * The numbers here are the single source of truth for the marketing pricing
 * page and mirror the billing logic used by the sales quotation tools:
 *   - src/modules/sales/components/QuotationForm.tsx
 *   - app/api/quotation-pdf/route.ts
 *
 * Rates are built up from the statutory minimum wage (per Govt. notification),
 * the mandatory employer contributions (PF / ESI / Bonus), and a flat service
 * charge. Pricing is quoted per guard for a single 8-hour duty (one shift).
 *
 * State-wise minimum wages (daily rate per 8-hour shift):
 *   Odisha      – Effective 1 Apr 2026: 472 / 522 / 572 / 622
 *   Telangana   – Effective 1 Jun 2026: 615 / 654 / 712 / 769 (Zone-I)
 *   West Bengal – Effective 1 Jul 2026: 406 / 446 / 491 / 541 (Zone A)
 */

// ── Statutory constants (kept in sync with app/api/quotation-pdf/route.ts) ──
export const PF_RATE = 0.13; // 13% (12% PF + 1% admin)
export const ESI_RATE = 0.0325; // 3.25%
export const BONUS_RATE = 0.0833; // 8.33%
export const WORKING_DAYS = 26; // standard working days per month

/** Flat service charge applied on top of the fully-loaded wage. */
export const SERVICE_CHARGE_RATE = 0.1; // 10%

// ── State configuration ─────────────────────────────────────────────────────

export interface StateConfig {
  id: string;
  name: string;
  /** Zone / area qualifier shown to user. */
  zone: string;
  /** Effective date of the current minimum wage revision. */
  effectiveDate: string;
  /** Daily minimum wage per skill tier (indexed same as TIER_META). */
  dailyWages: {
    unarmedGuards: number;
    armedGuards: number;
    supervisors: number;
    patrolOfficers: number;
  };
}

/**
 * State-wise minimum daily wages sourced from latest Govt. notifications.
 *
 * Sources:
 *   Odisha – ETHRWorld / Govt. notification, effective 1 Apr 2026
 *   Telangana – The South First / New Indian Express, effective 1 Jun 2026 (Zone-I)
 *   West Bengal – UNI India / Times of India, effective 1 Jul 2026 (Zone A)
 */
export const STATES: StateConfig[] = [
  {
    id: 'odisha',
    name: 'Odisha',
    zone: 'State-wide',
    effectiveDate: '1 April 2026',
    dailyWages: {
      unarmedGuards: 472,
      armedGuards: 522,
      supervisors: 572,
      patrolOfficers: 622,
    },
  },
  {
    id: 'telangana',
    name: 'Telangana',
    zone: 'Zone-I (Municipal Corporations)',
    effectiveDate: '1 June 2026',
    dailyWages: {
      unarmedGuards: 615,
      armedGuards: 654,
      supervisors: 712,
      patrolOfficers: 769,
    },
  },
  {
    id: 'west-bengal',
    name: 'West Bengal',
    zone: 'Zone A',
    effectiveDate: '1 July 2026',
    dailyWages: {
      unarmedGuards: 406,
      armedGuards: 446,
      supervisors: 491,
      patrolOfficers: 541,
    },
  },
];

// ── Tier metadata (common across states) ────────────────────────────────────

export interface TierMeta {
  id: 'unarmedGuards' | 'armedGuards' | 'supervisors' | 'patrolOfficers';
  serviceName: string;
  category: string;
  blurb: string;
  icon: string;
  /** Additional per-duty charges (e.g. gun charges for armed guards). */
  additionalCharges?: number;
  /** Label for the additional charge line item. */
  additionalChargesLabel?: string;
}

export const TIER_META: TierMeta[] = [
  {
    id: 'unarmedGuards',
    serviceName: 'Unarmed Security Guards',
    category: 'Unskilled',
    blurb: 'Gate, front-desk and patrol guards for offices, retail, and residential sites.',
    icon: 'Shield',
  },
  {
    id: 'armedGuards',
    serviceName: 'Armed Security Personnel',
    category: 'Semi-Skilled',
    blurb: 'Licensed armed officers for cash movement, banks, and high-value sites.',
    icon: 'ShieldAlert',
    additionalCharges: 180,
    additionalChargesLabel: 'Gun charges',
  },
  {
    id: 'supervisors',
    serviceName: 'Security Supervisors',
    category: 'Skilled',
    blurb: 'On-site supervisors who run the shift, the roster, and your point of contact.',
    icon: 'Users',
  },
  {
    id: 'patrolOfficers',
    serviceName: 'Patrol & Personal Security Officers',
    category: 'Highly Skilled',
    blurb: 'Close-protection officers and mobile patrol units for the highest-risk needs.',
    icon: 'UserCheck',
  },
];

// ── Pricing computation ─────────────────────────────────────────────────────

export interface TierPricing {
  dailyWage: number;
  pf: number;
  esi: number;
  bonus: number;
  totalStatutory: number;
  dailyCTC: number;
  serviceCharge: number;
  additionalCharges: number;
  per8hTotal: number;
  monthly8h: number;
}

/** Compute the full wage + service-charge breakdown for a given daily wage. */
export function computeTierPricing(dailyWage: number, additionalCharges = 0): TierPricing {
  const pf = Math.round(dailyWage * PF_RATE);
  const esi = Math.round(dailyWage * ESI_RATE);
  const bonus = Math.round(dailyWage * BONUS_RATE);
  const totalStatutory = pf + esi + bonus;
  const dailyCTC = dailyWage + totalStatutory;
  const serviceCharge = Math.round(dailyCTC * SERVICE_CHARGE_RATE);
  const per8hTotal = dailyCTC + serviceCharge + additionalCharges;
  const monthly8h = per8hTotal * WORKING_DAYS;

  return {
    dailyWage,
    pf,
    esi,
    bonus,
    totalStatutory,
    dailyCTC,
    serviceCharge,
    additionalCharges,
    per8hTotal,
    monthly8h,
  };
}

/** Build full tier data (meta + pricing) for a given state. */
export function buildTiersForState(state: StateConfig) {
  return TIER_META.map((meta) => ({
    ...meta,
    pricing: computeTierPricing(state.dailyWages[meta.id], meta.additionalCharges ?? 0),
  }));
}

/** Format a number as Indian-rupee currency without decimals. */
export function formatINR(value: number): string {
  return `₹${value.toLocaleString('en-IN')}`;
}
