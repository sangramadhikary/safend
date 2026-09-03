import type { NextRequest } from 'next/server';
import { proxyTraccarReport } from '@/services/traccar/traccarProxy';

/**
 * GET /api/traccar/events?deviceId=1&from=...&to=...[&type=deviceMoving]
 *
 * Device event log: motion start/stop, geofence enter/exit, alarms and status
 * changes. Omit `type` for every event in the window.
 */
export async function GET(request: NextRequest) {
  return proxyTraccarReport(request, 'events');
}
