import type { NextRequest } from 'next/server';
import { proxyTraccarReport } from '@/services/traccar/traccarProxy';

/**
 * GET /api/traccar/trips?deviceId=1&from=...&to=...
 *
 * Discrete journeys with start/end address, coordinates, duration and speeds.
 */
export async function GET(request: NextRequest) {
  return proxyTraccarReport(request, 'trips');
}
