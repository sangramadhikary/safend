import { NextResponse, type NextRequest } from 'next/server';
import {
  requireTraccarAccess,
  traccarGet,
  traccarSend,
  traccarFailed,
  traccarErrorResponse,
} from '@/services/traccar/traccarProxy';

/**
 * Geofence management. Reading is open to ERP staff; creating and removing a
 * fence changes tracking behaviour and needs a write role.
 */

/**
 * Attach a geofence to every registered device.
 *
 * Traccar only evaluates a geofence for devices it is linked to, so a fence
 * created without permissions is inert: no enter/exit events and no geofenceIds
 * on incoming positions. Best-effort — a link failure must not undo a geofence
 * that was created successfully.
 *
 * @returns how many devices were linked
 */
async function linkGeofenceToAllDevices(geofenceId: number): Promise<number> {
  const devices = await traccarGet<Array<{ id: number }>>('/api/devices');
  if (traccarFailed(devices)) return 0;

  const results = await Promise.all(
    devices.data.map((device) =>
      traccarSend('POST', '/api/permissions', { deviceId: device.id, geofenceId })
    )
  );

  return results.filter((result) => !traccarFailed(result)).length;
}

/**
 * GET /api/traccar/geofence
 * List all geofences.
 */
export async function GET(request: NextRequest) {
  const denied = await requireTraccarAccess(request, 'read');
  if (denied) return denied;

  try {
    const result = await traccarGet('/api/geofences');
    if (traccarFailed(result)) {
      return traccarErrorResponse(result, `Traccar API error: ${result.status}`);
    }
    return NextResponse.json(result.data, {
      headers: { 'Cache-Control': 'private, no-store', Vary: 'Authorization, Cookie' },
    });
  } catch (error: any) {
    console.error('[Traccar Geofence API] GET Error:', error?.message || error);
    return NextResponse.json(
      { error: 'Failed to fetch geofences from Traccar', details: error?.message },
      { status: 500 }
    );
  }
}

/**
 * POST /api/traccar/geofence
 * Create a circular geofence.
 * Body: { name, latitude, longitude, radiusMeters, description? }
 */
export async function POST(request: NextRequest) {
  const denied = await requireTraccarAccess(request, 'write');
  if (denied) return denied;

  try {
    const body = await request.json();
    const { name, latitude, longitude, radiusMeters, description } = body;

    if (!name || latitude == null || longitude == null || !radiusMeters) {
      return NextResponse.json(
        { error: 'Missing required fields: name, latitude, longitude, radiusMeters' },
        { status: 400 }
      );
    }

    const lat = Number(latitude);
    const lon = Number(longitude);
    const radius = Number(radiusMeters);
    if (!Number.isFinite(lat) || Math.abs(lat) > 90) {
      return NextResponse.json({ error: 'latitude must be between -90 and 90' }, { status: 400 });
    }
    if (!Number.isFinite(lon) || Math.abs(lon) > 180) {
      return NextResponse.json({ error: 'longitude must be between -180 and 180' }, { status: 400 });
    }
    if (!Number.isFinite(radius) || radius <= 0 || radius > 100_000) {
      return NextResponse.json(
        { error: 'radiusMeters must be between 1 and 100000' },
        { status: 400 }
      );
    }

    // Traccar describes geofence areas in WKT: CIRCLE (lat lon, radius_metres)
    const payload = {
      name,
      description: description || '',
      area: `CIRCLE (${lat} ${lon}, ${radius})`,
      attributes: { radiusMeters: radius, latitude: lat, longitude: lon },
    };

    const result = await traccarSend('POST', '/api/geofences', payload);
    if (traccarFailed(result)) {
      return traccarErrorResponse(result, `Traccar API error: ${result.status}`);
    }

    const geofence = result.data as { id?: number };
    const linked = geofence?.id ? await linkGeofenceToAllDevices(geofence.id) : 0;

    return NextResponse.json({
      success: true,
      message: `Geofence "${name}" created`,
      geofence: result.data,
      linkedDevices: linked,
    });
  } catch (error: any) {
    console.error('[Traccar Geofence API] POST Error:', error?.message || error);
    return NextResponse.json(
      { error: 'Failed to create geofence in Traccar', details: error?.message },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/traccar/geofence?id=1
 * Remove a geofence.
 */
export async function DELETE(request: NextRequest) {
  const denied = await requireTraccarAccess(request, 'write');
  if (denied) return denied;

  const id = request.nextUrl.searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  try {
    const result = await traccarSend('DELETE', `/api/geofences/${encodeURIComponent(id)}`);
    if (traccarFailed(result)) {
      return traccarErrorResponse(result, `Traccar API error: ${result.status}`);
    }
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[Traccar Geofence API] DELETE Error:', error?.message || error);
    return NextResponse.json(
      { error: 'Failed to delete geofence in Traccar', details: error?.message },
      { status: 500 }
    );
  }
}
