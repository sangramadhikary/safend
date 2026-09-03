import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { TRACCAR_URL, TRACCAR_AUTH } from '@/services/traccar/traccarConfig';
import { requireTraccarAccess } from '@/services/traccar/traccarProxy';

// Server-side Supabase client (service role for DB writes)
function getServerSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, serviceKey);
}

/**
 * Extract a fingerprint string from a Traccar position's attributes.
 * Combines protocol + network info to create a unique phone identifier.
 */
function extractFingerprint(position: any): string {
  const parts = [
    position.protocol || 'unknown',
    position.attributes?.ip || '',
    position.network?.radioType || '',
    position.network?.carrier || '',
    position.attributes?.batteryLevel || '',
    position.attributes?.distance || '',
  ];
  return parts.filter(Boolean).join('|');
}

/**
 * GET /api/traccar/verify-binding?deviceUniqueId=od05at8841-a3f2c1
 * Check if a device's current connection matches its stored binding.
 */
export async function GET(request: NextRequest) {
  const denied = await requireTraccarAccess(request, 'read');
  if (denied) return denied;

  try {
    const { searchParams } = new URL(request.url);
    const deviceUniqueId = searchParams.get('deviceUniqueId');

    if (!deviceUniqueId) {
      return NextResponse.json(
        { error: 'Missing required param: deviceUniqueId' },
        { status: 400 }
      );
    }

    const supabase = getServerSupabase();

    // 1. Get the binding from DB
    const { data: binding, error: dbError } = await supabase
      .from('device_bindings')
      .select('*')
      .eq('device_unique_id', deviceUniqueId)
      .single();

    if (dbError || !binding) {
      return NextResponse.json({
        bound: false,
        message: 'No binding found for this device',
        deviceUniqueId,
      });
    }

    // 2. Get device's latest position from Traccar
    // First, find the device ID by uniqueId
    const devicesRes = await fetch(`${TRACCAR_URL}/api/devices?uniqueId=${deviceUniqueId}`, {
      headers: {
        'Authorization': `Basic ${TRACCAR_AUTH}`,
        'Accept': 'application/json',
      },
    });

    if (!devicesRes.ok) {
      return NextResponse.json(
        { error: 'Failed to fetch device from Traccar' },
        { status: 502 }
      );
    }

    const devices = await devicesRes.json();
    if (!devices.length) {
      return NextResponse.json({
        bound: binding.is_bound,
        verified: false,
        message: 'Device not found in Traccar',
      });
    }

    const device = devices[0];

    // 3. Get latest position
    const posRes = await fetch(`${TRACCAR_URL}/api/positions?deviceId=${device.id}`, {
      headers: {
        'Authorization': `Basic ${TRACCAR_AUTH}`,
        'Accept': 'application/json',
      },
    });

    if (!posRes.ok) {
      return NextResponse.json({
        bound: binding.is_bound,
        verified: false,
        message: 'Could not fetch position data',
      });
    }

    const positions = await posRes.json();
    if (!positions.length) {
      return NextResponse.json({
        bound: binding.is_bound,
        verified: false,
        message: 'No position data available',
      });
    }

    const latestPosition = positions[0];
    const currentFingerprint = extractFingerprint(latestPosition);

    // 4. Compare fingerprints
    if (!binding.phone_fingerprint) {
      // First time — store the fingerprint
      await supabase
        .from('device_bindings')
        .update({
          phone_fingerprint: currentFingerprint,
          first_seen_at: latestPosition.fixTime || new Date().toISOString(),
          first_ip: latestPosition.attributes?.ip || null,
        })
        .eq('device_unique_id', deviceUniqueId);

      return NextResponse.json({
        bound: binding.is_bound,
        verified: true,
        message: 'Fingerprint captured (first connection)',
        fingerprint: currentFingerprint,
      });
    }

    // Compare stored vs current
    const isMatch = binding.phone_fingerprint === currentFingerprint;

    if (!isMatch && binding.is_bound) {
      // Binding violation detected
      await supabase
        .from('device_bindings')
        .update({
          binding_violated: true,
          violation_count: (binding.violation_count || 0) + 1,
          last_violation_at: new Date().toISOString(),
        })
        .eq('device_unique_id', deviceUniqueId);

      return NextResponse.json({
        bound: true,
        verified: false,
        violation: true,
        message: 'Binding violation: device fingerprint does not match',
        storedFingerprint: binding.phone_fingerprint,
        currentFingerprint,
        violationCount: (binding.violation_count || 0) + 1,
      });
    }

    return NextResponse.json({
      bound: binding.is_bound,
      verified: isMatch,
      message: isMatch ? 'Binding verified successfully' : 'Fingerprint mismatch (device not yet bound)',
      employeeName: binding.employee_name,
      deviceUniqueId,
    });
  } catch (error: any) {
    console.error('[Verify Binding API] Error:', error.message);
    return NextResponse.json(
      { error: 'Failed to verify binding', details: error.message },
      { status: 500 }
    );
  }
}

/**
 * POST /api/traccar/verify-binding
 * Create or update a device binding (admin action).
 * Body: { deviceUniqueId, vehicleId?, employeeName?, employeeId?, boundBy }
 */
export async function POST(request: NextRequest) {
  const denied = await requireTraccarAccess(request, 'write');
  if (denied) return denied;

  try {
    const body = await request.json();
    const { deviceUniqueId, vehicleId, employeeName, employeeId, boundBy } = body;

    if (!deviceUniqueId) {
      return NextResponse.json(
        { error: 'Missing required field: deviceUniqueId' },
        { status: 400 }
      );
    }

    const supabase = getServerSupabase();

    // Upsert binding record
    const { data, error } = await supabase
      .from('device_bindings')
      .upsert(
        {
          device_unique_id: deviceUniqueId,
          vehicle_id: vehicleId || null,
          employee_name: employeeName || null,
          employee_id: employeeId || null,
          is_bound: true,
          bound_at: new Date().toISOString(),
          bound_by: boundBy || 'system',
        },
        { onConflict: 'device_unique_id' }
      )
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { error: 'Failed to create/update binding', details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Device binding created/updated',
      binding: data,
    });
  } catch (error: any) {
    console.error('[Verify Binding API] POST Error:', error.message);
    return NextResponse.json(
      { error: 'Failed to process binding request', details: error.message },
      { status: 500 }
    );
  }
}
