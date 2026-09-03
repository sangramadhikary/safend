import { NextResponse, type NextRequest } from 'next/server';
import {
  requireTraccarAccess,
  traccarGet,
  traccarFailed,
  traccarErrorResponse,
} from '@/services/traccar/traccarProxy';

/**
 * GET /api/traccar/positions[?deviceId=1]
 *
 * Latest known position per device, including the live telemetry Traccar keeps
 * on each fix: battery level, charging flag, motion state, total odometer,
 * accuracy, heading and altitude. This is the feed behind the live map, so it
 * is never cached.
 */
export async function GET(request: NextRequest) {
  const denied = await requireTraccarAccess(request, 'read');
  if (denied) return denied;

  const deviceId = request.nextUrl.searchParams.get('deviceId');

  try {
    const result = await traccarGet('/api/positions', deviceId ? { deviceId } : undefined);
    if (traccarFailed(result)) {
      return traccarErrorResponse(result, `Traccar API error: ${result.status}`);
    }

    return NextResponse.json(result.data, {
      headers: { 'Cache-Control': 'private, no-store', Vary: 'Authorization, Cookie' },
    });
  } catch (error: any) {
    console.error('[Traccar Positions API] Error:', error?.message || error);
    return NextResponse.json(
      { error: 'Failed to fetch positions from Traccar', details: error?.message },
      { status: 500 }
    );
  }
}
