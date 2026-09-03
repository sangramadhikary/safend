import type { TraccarDevice, TraccarPosition } from './traccarTypes';

/**
 * Display helpers for Traccar values.
 *
 * Traccar reports speeds in knots, distances in metres and durations in
 * milliseconds. Everything shown to the user is metric and India-localised.
 */

const KNOTS_TO_KMPH = 1.852;
const IST_TIME_ZONE = 'Asia/Kolkata';

/** Knots to km/h. */
export function knotsToKmph(knots: number): number {
  return (Number(knots) || 0) * KNOTS_TO_KMPH;
}

/** Metres to kilometres. */
export function metresToKm(metres: number): number {
  return (Number(metres) || 0) / 1000;
}

/** `37.8 km` */
export function formatKm(metres: number, digits = 1): string {
  return `${metresToKm(metres).toLocaleString('en-IN', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })} km`;
}

/** `52 km/h` */
export function formatSpeed(knots: number, digits = 0): string {
  return `${knotsToKmph(knots).toLocaleString('en-IN', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })} km/h`;
}

/** `2h 14m`, `14m`, `45s` */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round((Number(ms) || 0) / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;

  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${seconds}s`;
}

/** `₹1,240` */
export function formatCurrency(amount: number): string {
  return `₹${Math.round(Number(amount) || 0).toLocaleString('en-IN')}`;
}

/** `07:23 pm` in IST. */
export function formatIstTime(iso: string | null | undefined, withSeconds = false): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString('en-IN', {
    timeZone: IST_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    ...(withSeconds ? { second: '2-digit' } : {}),
  });
}

/** `01 Aug, 07:23 pm` in IST. */
export function formatIstDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-IN', {
    timeZone: IST_TIME_ZONE,
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** `01 Aug 2026` in IST. */
export function formatIstDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-IN', {
    timeZone: IST_TIME_ZONE,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

/** `just now`, `4 min ago`, `3 h ago`, `2 d ago` */
export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return 'never';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 'never';

  const seconds = Math.round((Date.now() - then) / 1000);
  if (seconds < 45) return 'just now';
  if (seconds < 3600) return `${Math.round(seconds / 60)} min ago`;
  if (seconds < 86_400) return `${Math.round(seconds / 3600)} h ago`;
  return `${Math.round(seconds / 86_400)} d ago`;
}

/** Colour band for a speed in km/h, used on the route polyline and badges. */
export function speedColor(kmph: number): string {
  if (kmph < 5) return '#94A3B8'; // idle
  if (kmph < 20) return '#16A34A'; // walking / slow
  if (kmph < 40) return '#65A30D';
  if (kmph < 60) return '#D97706';
  if (kmph < 80) return '#EA580C';
  return '#DC2626'; // over 80
}

/** Tailwind text tone for a battery level. */
export function batteryTone(level: number | undefined): string {
  if (level === undefined) return 'text-muted-foreground';
  if (level <= 15) return 'text-red-600';
  if (level <= 35) return 'text-amber-600';
  return 'text-green-600';
}

/** Human label for a device: the employee name when we have one. */
export function deviceLabel(device: TraccarDevice): string {
  return device.attributes?.employeeName?.trim() || device.name || device.uniqueId;
}

/** Secondary line for a device: department and vehicle, when known. */
export function deviceSubLabel(device: TraccarDevice): string {
  const parts = [
    device.attributes?.department,
    device.attributes?.vehicleNumber,
    device.attributes?.vehicleModel,
  ].filter((part): part is string => Boolean(part && String(part).trim()));
  return parts.join(' · ');
}

/** Per-km reimbursement rate stored on the device, or 0. */
export function deviceRatePerKm(device: TraccarDevice | undefined): number {
  const rate = Number(device?.attributes?.ratePerKm);
  return Number.isFinite(rate) && rate > 0 ? rate : 0;
}

/**
 * Whether a device counts as reporting right now.
 *
 * Traccar marks a device `online` only while its socket is connected, which the
 * Traccar Client app on a phone does not hold open. A recent fix is the more
 * useful signal, so treat anything seen within the window as live.
 */
export function isRecentlyActive(lastUpdate: string | null | undefined, windowMinutes = 15): boolean {
  if (!lastUpdate) return false;
  const seen = new Date(lastUpdate).getTime();
  if (Number.isNaN(seen)) return false;
  return Date.now() - seen <= windowMinutes * 60 * 1000;
}

/** Compass label for a heading in degrees. */
export function courseToCompass(course: number): string {
  const points = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const index = Math.round(((Number(course) || 0) % 360) / 45) % 8;
  return points[index];
}

/** `20.4004, 85.8898` */
export function formatCoords(position: Pick<TraccarPosition, 'latitude' | 'longitude'>): string {
  return `${position.latitude.toFixed(5)}, ${position.longitude.toFixed(5)}`;
}

/** Great-circle distance between two points, in kilometres. */
export function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Total path length of a position series, in kilometres. */
export function pathLengthKm(points: Array<Pick<TraccarPosition, 'latitude' | 'longitude'>>): number {
  let km = 0;
  for (let i = 1; i < points.length; i++) {
    km += haversineKm(
      points[i - 1].latitude,
      points[i - 1].longitude,
      points[i].latitude,
      points[i].longitude
    );
  }
  return km;
}
