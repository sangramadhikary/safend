import type { NextRequest } from 'next/server';
import { proxyTraccarReport } from '@/services/traccar/traccarProxy';

/**
 * GET /api/traccar/summary?deviceId=1&from=...&to=...[&daily=true]
 *
 * Aggregated distance, speeds, odometer and engine hours per device. Pass
 * `daily=true` to get one row per device per day, which powers the trend charts.
 */
export async function GET(request: NextRequest) {
  return proxyTraccarReport(request, 'summary');
}
