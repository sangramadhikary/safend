import { NextResponse, type NextRequest } from 'next/server';
import {
  requireTraccarAccess,
  traccarSend,
  traccarFailed,
  traccarErrorResponse,
} from '@/services/traccar/traccarProxy';

/**
 * Device administration on the Traccar server.
 *
 * These handlers change tracking configuration, so they require a role from the
 * write set rather than any staff role.
 */

interface DevicePayloadInput {
  name?: unknown;
  uniqueId?: unknown;
  phone?: unknown;
  model?: unknown;
  contact?: unknown;
  category?: unknown;
  groupId?: unknown;
  disabled?: unknown;
  attributes?: unknown;
}

/** Build the device object Traccar expects, dropping unset optional fields. */
function buildDevicePayload(body: DevicePayloadInput, id?: number | string) {
  const payload: Record<string, unknown> = {
    name: body.name,
    uniqueId: body.uniqueId,
    category: (body.category as string) || 'person',
  };

  if (id !== undefined) payload.id = id;
  if (body.phone) payload.phone = body.phone;
  if (body.model) payload.model = body.model;
  if (body.contact) payload.contact = body.contact;
  if (body.groupId) payload.groupId = body.groupId;
  if (typeof body.disabled === 'boolean') payload.disabled = body.disabled;
  if (body.attributes && typeof body.attributes === 'object') payload.attributes = body.attributes;

  return payload;
}

/**
 * POST /api/traccar/devices/manage
 * Create a device: { name, uniqueId, phone?, model?, contact?, category?, groupId?, disabled?, attributes? }
 */
export async function POST(request: NextRequest) {
  const denied = await requireTraccarAccess(request, 'write');
  if (denied) return denied;

  try {
    const body = (await request.json()) as DevicePayloadInput;
    if (!body.name || !body.uniqueId) {
      return NextResponse.json({ error: 'name and uniqueId are required' }, { status: 400 });
    }

    const result = await traccarSend('POST', '/api/devices', buildDevicePayload(body));
    if (traccarFailed(result)) {
      return traccarErrorResponse(result, `Traccar API error: ${result.status}`);
    }
    return NextResponse.json(result.data);
  } catch (error: any) {
    console.error('[Traccar Create Device] Error:', error?.message || error);
    return NextResponse.json(
      { error: 'Failed to create device in Traccar', details: error?.message },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/traccar/devices/manage
 * Update a device. Send the full object: Traccar replaces the record.
 */
export async function PUT(request: NextRequest) {
  const denied = await requireTraccarAccess(request, 'write');
  if (denied) return denied;

  try {
    const body = (await request.json()) as DevicePayloadInput & { id?: unknown };
    if (!body.id || !body.name || !body.uniqueId) {
      return NextResponse.json({ error: 'id, name, and uniqueId are required' }, { status: 400 });
    }

    const result = await traccarSend(
      'PUT',
      `/api/devices/${encodeURIComponent(String(body.id))}`,
      buildDevicePayload(body, body.id as number | string)
    );
    if (traccarFailed(result)) {
      return traccarErrorResponse(result, `Traccar API error: ${result.status}`);
    }
    return NextResponse.json(result.data);
  } catch (error: any) {
    console.error('[Traccar Update Device] Error:', error?.message || error);
    return NextResponse.json(
      { error: 'Failed to update device in Traccar', details: error?.message },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/traccar/devices/manage?id=1
 * Remove a device and its history from Traccar. Not reversible.
 */
export async function DELETE(request: NextRequest) {
  const denied = await requireTraccarAccess(request, 'write');
  if (denied) return denied;

  const id = request.nextUrl.searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  try {
    const result = await traccarSend('DELETE', `/api/devices/${encodeURIComponent(id)}`);
    if (traccarFailed(result)) {
      return traccarErrorResponse(result, `Traccar API error: ${result.status}`);
    }
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[Traccar Delete Device] Error:', error?.message || error);
    return NextResponse.json(
      { error: 'Failed to delete device from Traccar', details: error?.message },
      { status: 500 }
    );
  }
}
