/**
 * Time helpers for Traccar report queries.
 *
 * Pure functions with no environment access, so this module is safe to import
 * from both client components and route handlers.
 *
 * Traccar report endpoints (/api/reports/route, /summary, /trips) expect an
 * ISO-8601 instant. We query whole business days in IST, which means the
 * timestamps carry a `+05:30` offset. That `+` is the source of a subtle bug:
 * in a query string `+` means "space", so an un-encoded offset arrives at the
 * server as `2026-08-01T00:00:00.000 05:30` and Traccar rejects it with a
 * Jersey QueryParamException (HTTP 404). Always build query strings with
 * URLSearchParams so the offset is encoded as `%2B`.
 */

const IST_OFFSET = '+05:30';
const IST_TIME_ZONE = 'Asia/Kolkata';

/** Matches an ISO timestamp whose `+HH:MM` offset was decoded into a space. */
const SPACE_OFFSET_PATTERN =
  /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?) (\d{2}:\d{2})$/;

/** Today's date as `YYYY-MM-DD` in IST, independent of the browser time zone. */
export function todayInIST(): string {
  // `en-CA` formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: IST_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/**
 * Full-day IST window for a `YYYY-MM-DD` date, as Traccar-compatible instants.
 */
export function istDayRange(date: string): { from: string; to: string } {
  return {
    from: `${date}T00:00:00.000${IST_OFFSET}`,
    to: `${date}T23:59:59.999${IST_OFFSET}`,
  };
}

/**
 * Repair a timestamp whose `+` offset was decoded as a space.
 *
 * `URLSearchParams.get()` turns `...000+05:30` into `...000 05:30`. A space is
 * never valid in an ISO-8601 instant, so seeing one at the offset position
 * unambiguously means the `+` was not percent-encoded by the caller. Returning
 * the value untouched in every other case keeps `...Z` and `-05:30` forms as-is.
 */
export function normalizeTraccarTimestamp(value: string): string {
  return value.replace(SPACE_OFFSET_PATTERN, '$1+$2');
}

// ─── Date-range selection ─────────────────────────────────────────────────────

/** Selectable ranges in the tracking console. */
export type RangePreset = 'today' | 'yesterday' | 'last7' | 'last30' | 'thisMonth' | 'custom';

export const RANGE_PRESETS: ReadonlyArray<{ value: RangePreset; label: string }> = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'last7', label: 'Last 7 days' },
  { value: 'last30', label: 'Last 30 days' },
  { value: 'thisMonth', label: 'This month' },
  { value: 'custom', label: 'Custom' },
];

/** A closed range of IST calendar days, both ends inclusive. */
export interface DayRange {
  /** `YYYY-MM-DD` */
  startDate: string;
  /** `YYYY-MM-DD` */
  endDate: string;
}

/** Shift a `YYYY-MM-DD` date by whole days, staying in that calendar space. */
export function shiftDate(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  // Anchor at UTC noon so daylight-saving and offset maths cannot roll the day.
  const anchor = new Date(Date.UTC(year, month - 1, day, 12));
  anchor.setUTCDate(anchor.getUTCDate() + days);
  return anchor.toISOString().slice(0, 10);
}

/** Inclusive list of `YYYY-MM-DD` dates in a range, capped for safety. */
export function eachDate(range: DayRange, maxDays = 366): string[] {
  const dates: string[] = [];
  let cursor = range.startDate;
  while (cursor <= range.endDate && dates.length < maxDays) {
    dates.push(cursor);
    cursor = shiftDate(cursor, 1);
  }
  return dates;
}

/** Number of inclusive days in a range. */
export function dayCount(range: DayRange): number {
  return eachDate(range).length;
}

/** Resolve a preset into concrete IST dates. `custom` echoes the fallback. */
export function resolveRange(preset: RangePreset, fallback?: DayRange): DayRange {
  const today = todayInIST();

  switch (preset) {
    case 'today':
      return { startDate: today, endDate: today };
    case 'yesterday': {
      const yesterday = shiftDate(today, -1);
      return { startDate: yesterday, endDate: yesterday };
    }
    case 'last7':
      return { startDate: shiftDate(today, -6), endDate: today };
    case 'last30':
      return { startDate: shiftDate(today, -29), endDate: today };
    case 'thisMonth':
      return { startDate: `${today.slice(0, 7)}-01`, endDate: today };
    case 'custom':
    default:
      return fallback ?? { startDate: today, endDate: today };
  }
}

/** Traccar-compatible instants spanning a whole range of IST days. */
export function istRangeInstants(range: DayRange): { from: string; to: string } {
  return {
    from: `${range.startDate}T00:00:00.000${IST_OFFSET}`,
    to: `${range.endDate}T23:59:59.999${IST_OFFSET}`,
  };
}

// ─── IST bucketing (for grouping report rows) ────────────────────────────────

const IST_DATE_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: IST_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const IST_HOUR_FORMATTER = new Intl.DateTimeFormat('en-GB', {
  timeZone: IST_TIME_ZONE,
  hour: '2-digit',
  hour12: false,
});

/** The IST calendar date (`YYYY-MM-DD`) an instant falls on. */
export function istDateOf(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return IST_DATE_FORMATTER.format(date);
}

/** The IST hour (0-23) an instant falls in. */
export function istHourOf(iso: string | null | undefined): number {
  if (!iso) return -1;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return -1;
  const hour = Number(IST_HOUR_FORMATTER.format(date).replace(/\D/g, ''));
  return Number.isFinite(hour) ? hour % 24 : -1;
}
