import type { TraccarDevice } from '@/services/traccar/traccarTypes';

/** Palette used to keep a device the same colour across map, tables and charts. */
export const DEVICE_COLORS = [
  '#D71920', '#2563EB', '#16A34A', '#D97706', '#7C3AED',
  '#0891B2', '#DB2777', '#4F46E5', '#CA8A04', '#0D9488',
] as const;

/**
 * Stable colour per device.
 *
 * Keyed off the device id sorted ascending rather than the fetch order, so a
 * device keeps its colour even when the server returns the list differently or
 * the user changes the selection.
 */
export function buildDeviceColors(devices: TraccarDevice[]): Record<number, string> {
  const ids = devices.map((device) => device.id).sort((a, b) => a - b);
  const colors: Record<number, string> = {};
  ids.forEach((id, index) => {
    colors[id] = DEVICE_COLORS[index % DEVICE_COLORS.length];
  });
  return colors;
}

/** Escape one CSV field: quote it and double any embedded quotes. */
function csvField(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Build a CSV document from column definitions and rows. */
export function toCsv<T>(
  rows: T[],
  columns: Array<{ header: string; value: (row: T) => unknown }>
): string {
  const head = columns.map((column) => csvField(column.header)).join(',');
  const body = rows.map((row) => columns.map((column) => csvField(column.value(row))).join(','));
  return [head, ...body].join('\r\n');
}

/** Trigger a client-side download of a CSV string. */
export function downloadCsv(filename: string, csv: string): void {
  // Prepend a BOM so Excel opens UTF-8 (₹, names) correctly.
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/** Google Maps deep link for a coordinate, handy for dispatching someone. */
export function mapsLink(latitude: number, longitude: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
}

/** Readable label for a Traccar event type. */
export function eventLabel(type: string): string {
  const labels: Record<string, string> = {
    deviceOnline: 'Came online',
    deviceOffline: 'Went offline',
    deviceUnknown: 'Status unknown',
    deviceMoving: 'Started moving',
    deviceStopped: 'Stopped',
    deviceOverspeed: 'Overspeed',
    deviceFuelDrop: 'Fuel drop',
    deviceInactive: 'Inactive',
    geofenceEnter: 'Entered geofence',
    geofenceExit: 'Left geofence',
    alarm: 'Alarm',
    ignitionOn: 'Ignition on',
    ignitionOff: 'Ignition off',
    maintenance: 'Maintenance due',
    textMessage: 'Message',
    commandResult: 'Command result',
    driverChanged: 'Driver changed',
  };
  if (labels[type]) return labels[type];
  // Fall back to splitting the camelCase type Traccar sends.
  return type.replace(/([A-Z])/g, ' $1').replace(/^./, (char) => char.toUpperCase()).trim();
}

/** Tone classes for an event badge, grouped by severity. */
export function eventTone(type: string): string {
  if (type === 'deviceOverspeed' || type === 'alarm' || type === 'deviceFuelDrop') {
    return 'bg-red-50 text-red-700 border-red-200';
  }
  if (type === 'deviceMoving' || type === 'ignitionOn' || type === 'deviceOnline') {
    return 'bg-green-50 text-green-700 border-green-200';
  }
  if (type === 'deviceStopped' || type === 'ignitionOff' || type === 'deviceOffline') {
    return 'bg-slate-50 text-slate-600 border-slate-200';
  }
  if (type.startsWith('geofence')) {
    return 'bg-indigo-50 text-indigo-700 border-indigo-200';
  }
  return 'bg-amber-50 text-amber-700 border-amber-200';
}

/** Parse the `CIRCLE (lat lon, radius)` WKT Traccar stores for a geofence. */
export function parseCircleArea(
  area: string | undefined
): { latitude: number; longitude: number; radius: number } | null {
  if (!area) return null;
  const match = /CIRCLE\s*\(\s*(-?[\d.]+)\s+(-?[\d.]+)\s*,\s*([\d.]+)\s*\)/i.exec(area);
  if (!match) return null;
  return {
    latitude: Number(match[1]),
    longitude: Number(match[2]),
    radius: Number(match[3]),
  };
}

/** Filter state shared by the console shell and every panel inside it. */
export interface TrackingScope {
  /** All devices known to the GPS server. */
  devices: TraccarDevice[];
  /** Devices currently selected in the filter. */
  selected: TraccarDevice[];
  /** Ids of the selected devices, for report queries. */
  selectedIds: number[];
  /** Inclusive IST day range under review. */
  range: import('@/services/traccar/traccarTime').DayRange;
  /** Stable colour per device id. */
  colors: Record<number, string>;
  /** Live poll interval in ms; 0 means polling is off. */
  refreshMs: number;
}

/** Look up a device by id within a scope. */
export function findDevice(scope: TrackingScope, deviceId: number): TraccarDevice | undefined {
  return scope.devices.find((device) => device.id === deviceId);
}

/** Display name for a device id, falling back to the id itself. */
export function deviceNameById(scope: TrackingScope, deviceId: number, fallback?: string): string {
  const device = findDevice(scope, deviceId);
  if (device) return device.attributes?.employeeName?.trim() || device.name;
  return fallback || `Device ${deviceId}`;
}
