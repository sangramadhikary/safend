'use client';

/**
 * Rented Properties — Supabase service
 *
 * Staff accommodation locations rented by the company.  These are shown as
 * orange house pins on the fleet tracking map so management can see at a glance
 * which quarters are near each post / device.
 */

import { supabaseClient } from '@/integrations/supabase/client';
import { applyBranchScope } from '@/utils/branchScope';

// ── Public interface ──────────────────────────────────────────────────────────

export interface RentedProperty {
  id: string;
  name: string;
  address: string;
  city?: string;
  state?: string;
  pincode?: string;
  latitude?: number;
  longitude?: number;
  rentAmount?: number;
  landlordName?: string;
  landlordPhone?: string;
  capacity?: number;
  branchId?: string;
  status: 'active' | 'inactive' | 'expired';
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

// ── Row mapper ────────────────────────────────────────────────────────────────

function mapRow(row: Record<string, unknown>): RentedProperty {
  return {
    id:            String(row.id ?? ''),
    name:          String(row.name ?? ''),
    address:       String(row.address ?? ''),
    city:          row.city   != null ? String(row.city)   : undefined,
    state:         row.state  != null ? String(row.state)  : undefined,
    pincode:       row.pincode != null ? String(row.pincode) : undefined,
    latitude:      row.latitude  != null ? Number(row.latitude)  : undefined,
    longitude:     row.longitude != null ? Number(row.longitude) : undefined,
    rentAmount:    row.rent_amount != null ? Number(row.rent_amount) : undefined,
    landlordName:  row.landlord_name  != null ? String(row.landlord_name)  : undefined,
    landlordPhone: row.landlord_phone != null ? String(row.landlord_phone) : undefined,
    capacity:      row.capacity != null ? Number(row.capacity) : undefined,
    branchId:      row.branch_id != null ? String(row.branch_id) : undefined,
    status:        (row.status as RentedProperty['status']) ?? 'active',
    notes:         row.notes != null ? String(row.notes) : undefined,
    createdAt:     row.created_at != null ? String(row.created_at) : undefined,
    updatedAt:     row.updated_at != null ? String(row.updated_at) : undefined,
  };
}

// ── Queries ───────────────────────────────────────────────────────────────────

/**
 * Fetch all active rented properties that have a valid lat/lng, scoped to the
 * current branch so the map only shows relevant locations.
 */
export async function getActiveRentedProperties(): Promise<RentedProperty[]> {
  // Typed as the loose filter-builder shape rather than the fully-parameterised
  // query type. Re-casting the doubly-.not()-chained builder back onto itself
  // made TS expand the generic recursively (TS2589: excessively deep). The rows
  // are validated through mapRow below, so the builder's element type is not
  // relied on here.
  let query: any = supabaseClient
    .from('rented_properties')
    .select('*')
    .eq('status', 'active')
    .not('latitude', 'is', null)
    .not('longitude', 'is', null)
    .order('name');

  query = applyBranchScope(query);

  const { data, error } = await query;
  if (error) {
    console.error('[RentedPropertyService] getActiveRentedProperties:', error.message);
    return [];
  }
  return (data ?? []).map(mapRow);
}

/**
 * Fetch all rented properties (including inactive/expired), for the admin table.
 */
export async function getAllRentedProperties(): Promise<RentedProperty[]> {
  let query = supabaseClient
    .from('rented_properties')
    .select('*')
    .order('name');

  query = applyBranchScope(query) as typeof query;

  const { data, error } = await query;
  if (error) {
    console.error('[RentedPropertyService] getAllRentedProperties:', error.message);
    return [];
  }
  return (data ?? []).map(mapRow);
}

export async function createRentedProperty(
  property: Omit<RentedProperty, 'id' | 'createdAt' | 'updatedAt'>
): Promise<{ success: boolean; id?: string; error?: string }> {
  const { data, error } = await supabaseClient
    .from('rented_properties')
    .insert({
      name:           property.name,
      address:        property.address,
      city:           property.city,
      state:          property.state,
      pincode:        property.pincode,
      latitude:       property.latitude,
      longitude:      property.longitude,
      rent_amount:    property.rentAmount,
      landlord_name:  property.landlordName,
      landlord_phone: property.landlordPhone,
      capacity:       property.capacity ?? 1,
      branch_id:      property.branchId,
      status:         property.status ?? 'active',
      notes:          property.notes,
    })
    .select('id')
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, id: data.id };
}

export async function updateRentedProperty(
  id: string,
  patch: Partial<Omit<RentedProperty, 'id' | 'createdAt' | 'updatedAt'>>
): Promise<{ success: boolean; error?: string }> {
  const row: Record<string, unknown> = {};
  if (patch.name          !== undefined) row.name           = patch.name;
  if (patch.address       !== undefined) row.address        = patch.address;
  if (patch.city          !== undefined) row.city           = patch.city;
  if (patch.state         !== undefined) row.state          = patch.state;
  if (patch.pincode       !== undefined) row.pincode        = patch.pincode;
  if (patch.latitude      !== undefined) row.latitude       = patch.latitude;
  if (patch.longitude     !== undefined) row.longitude      = patch.longitude;
  if (patch.rentAmount    !== undefined) row.rent_amount    = patch.rentAmount;
  if (patch.landlordName  !== undefined) row.landlord_name  = patch.landlordName;
  if (patch.landlordPhone !== undefined) row.landlord_phone = patch.landlordPhone;
  if (patch.capacity      !== undefined) row.capacity       = patch.capacity;
  if (patch.branchId      !== undefined) row.branch_id      = patch.branchId;
  if (patch.status        !== undefined) row.status         = patch.status;
  if (patch.notes         !== undefined) row.notes          = patch.notes;

  const { error } = await supabaseClient
    .from('rented_properties')
    .update(row)
    .eq('id', id);

  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function deleteRentedProperty(
  id: string
): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabaseClient
    .from('rented_properties')
    .delete()
    .eq('id', id);

  if (error) return { success: false, error: error.message };
  return { success: true };
}
