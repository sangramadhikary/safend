/**
 * Shapes returned by the Traccar API, as observed on the live server.
 *
 * Units follow Traccar's own conventions and are converted for display by
 * `traccarFormat.ts`:
 *   - speeds are in KNOTS
 *   - distances and odometers are in METRES
 *   - durations are in MILLISECONDS
 *   - engine hours are in MILLISECONDS
 */

/** Attributes we write onto a device when a vehicle is registered. */
export interface TraccarDeviceAttributes {
  employeeName?: string;
  employeeId?: string;
  department?: string;
  vehicleNumber?: string;
  vehicleModel?: string;
  ratePerKm?: number;
  [key: string]: unknown;
}

export interface TraccarDevice {
  id: number;
  name: string;
  uniqueId: string;
  status: 'online' | 'offline' | 'unknown' | string;
  lastUpdate: string | null;
  positionId?: number;
  groupId?: number;
  phone?: string | null;
  model?: string | null;
  contact?: string | null;
  category?: string | null;
  disabled?: boolean;
  expirationTime?: string | null;
  attributes?: TraccarDeviceAttributes;
}

/** Per-fix telemetry Traccar records alongside the coordinates. */
export interface TraccarPositionAttributes {
  batteryLevel?: number;
  charge?: boolean;
  motion?: boolean;
  /** Metres covered since the previous fix. */
  distance?: number;
  /** Cumulative metres for the device. */
  totalDistance?: number;
  ignition?: boolean;
  sat?: number;
  [key: string]: unknown;
}

export interface TraccarPosition {
  id: number;
  deviceId: number;
  protocol?: string;
  serverTime: string;
  deviceTime: string;
  fixTime: string;
  valid: boolean;
  latitude: number;
  longitude: number;
  altitude: number;
  /** Knots. */
  speed: number;
  /** Heading in degrees, 0 = north. */
  course: number;
  address: string | null;
  /** Horizontal accuracy in metres. */
  accuracy: number;
  network: unknown;
  geofenceIds: number[] | null;
  attributes?: TraccarPositionAttributes;
}

/** One row per device, or per device per day when `daily=true`. */
export interface TraccarSummary {
  deviceId: number;
  deviceName: string;
  /** Metres. */
  distance: number;
  /** Knots. */
  averageSpeed: number;
  /** Knots. */
  maxSpeed: number;
  /** Litres. */
  spentFuel: number;
  startOdometer: number;
  endOdometer: number;
  startTime: string;
  endTime: string;
  startHours: number;
  endHours: number;
  /** Milliseconds. */
  engineHours: number;
}

export interface TraccarTrip {
  deviceId: number;
  deviceName: string;
  /** Metres. */
  distance: number;
  /** Knots. */
  averageSpeed: number;
  /** Knots. */
  maxSpeed: number;
  spentFuel: number;
  startOdometer: number;
  endOdometer: number;
  startTime: string;
  endTime: string;
  startPositionId: number;
  endPositionId: number;
  startLat: number;
  startLon: number;
  endLat: number;
  endLon: number;
  startAddress: string | null;
  endAddress: string | null;
  /** Milliseconds. */
  duration: number;
  driverUniqueId: string | null;
  driverName: string | null;
}

export interface TraccarStop {
  deviceId: number;
  deviceName: string;
  distance: number;
  averageSpeed: number;
  maxSpeed: number;
  spentFuel: number;
  startOdometer: number;
  endOdometer: number;
  startTime: string;
  endTime: string;
  positionId: number;
  latitude: number;
  longitude: number;
  address: string | null;
  /** Milliseconds parked. */
  duration: number;
  engineHours: number;
}

export interface TraccarEvent {
  id: number;
  deviceId: number;
  type: string;
  eventTime: string;
  positionId: number;
  geofenceId: number;
  maintenanceId: number;
  attributes?: Record<string, unknown>;
}

export interface TraccarGeofence {
  id: number;
  name: string;
  description?: string;
  /** WKT, e.g. `CIRCLE (20.29 85.82, 250)`. */
  area: string;
  calendarId?: number;
  attributes?: Record<string, unknown>;
}
