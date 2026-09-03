import type { NextRequest } from 'next/server';
import { proxyTraccarReport } from '@/services/traccar/traccarProxy';

/**
 * GET /api/traccar/route-positions?deviceId=1&deviceId=2&from=...&to=...
 *
 * Every GPS point for the given devices in a time range, used to draw movement
 * paths and to derive per-point telemetry (speed, battery, accuracy).
 */
export async function GET(request: NextRequest) {
  return proxyTraccarReport(request, 'route');
}
