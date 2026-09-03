import { NextResponse, type NextRequest } from 'next/server';
import {
  requireTraccarAccess,
  traccarGet,
  traccarFailed,
  traccarErrorResponse,
} from '@/services/traccar/traccarProxy';

/**
 * GET /api/traccar/devices
 *
 * All registered trackers with their status, last contact time and the
 * attributes we store against them (employee, department, vehicle, rate/km).
 */
export async function GET(request: NextRequest) {
  const denied = await requireTraccarAccess(request, 'read');
  if (denied) return denied;

  try {
    const result = await traccarGet('/api/devices');
    if (traccarFailed(result)) {
      return traccarErrorResponse(result, `Traccar API error: ${result.status}`);
    }

    return NextResponse.json(result.data, {
      headers: { 'Cache-Control': 'private, no-store', Vary: 'Authorization, Cookie' },
    });
  } catch (error: any) {
    console.error('[Traccar Devices API] Error:', error?.message || error);
    return NextResponse.json(
      { error: 'Failed to fetch devices from Traccar', details: error?.message },
      { status: 500 }
    );
  }
}
