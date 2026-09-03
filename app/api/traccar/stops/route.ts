import type { NextRequest } from 'next/server';
import { proxyTraccarReport } from '@/services/traccar/traccarProxy';

/**
 * GET /api/traccar/stops?deviceId=1&from=...&to=...
 *
 * Halts detected between trips, with address and dwell duration. Used to spot
 * long idle periods during a patrol.
 */
export async function GET(request: NextRequest) {
  return proxyTraccarReport(request, 'stops');
}
