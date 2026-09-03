'use client';

/**
 * ClientService — the customer master.
 *
 * Every client carries a permanent Customer ID (SF<seq>-YYMMDD, e.g. SF01-260801)
 * minted by the database, and that ID is what work orders, agreements and invoices hang
 * off. Before this existed a "client" was only a name string repeated across
 * records; `clients.name_key` (the normalised name) is what reconciles those
 * legacy records with a real customer row.
 *
 * Schema: supabase/migrations/20260731000000_create_clients_customer_ids.sql
 */

import { supabaseClient } from '@/integrations/supabase/client';
import { clientKeyOf } from '@/utils/clientKey';

export type ClientType = 'regular' | 'occasional';

export interface Client {
  /** Row uuid — what work_orders.client_id points at */
  id: string;
  /** Permanent human-facing identity, e.g. SF01-260801 */
  customerId: string;
  /** Normalised name used to fold differently-spelled records together */
  nameKey: string;
  name: string;
  companyName?: string;
  clientType: ClientType;
  gstin?: string;
  contactPerson?: string;
  contactEmail?: string;
  contactPhone?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

/** Fields a caller may supply when resolving or creating a customer. */
export interface ClientProfileInput {
  name: string;
  companyName?: string;
  clientType?: ClientType;
  gstin?: string;
  contactPerson?: string;
  contactEmail?: string;
  contactPhone?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
}

const mapRowToClient = (row: any): Client => ({
  id: row.id,
  customerId: row.customer_id,
  nameKey: row.name_key,
  name: row.name,
  companyName: row.company_name || '',
  clientType: (row.client_type as ClientType) || 'regular',
  gstin: row.gstin || '',
  contactPerson: row.contact_person || '',
  contactEmail: row.contact_email || '',
  contactPhone: row.contact_phone || '',
  address: row.address || '',
  city: row.city || '',
  state: row.state || '',
  pincode: row.pincode || '',
  notes: row.notes || '',
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const SELECT_COLUMNS =
  'id, customer_id, name_key, name, company_name, client_type, gstin, ' +
  'contact_person, contact_email, contact_phone, address, city, state, ' +
  'pincode, notes, created_at, updated_at';

/** Every customer, newest first. */
export const getClients = async () => {
  try {
    const { data, error } = await supabaseClient
      .from('clients')
      .select(SELECT_COLUMNS)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[ClientService] getClients:', error.message);
      return { success: false, error: error.message, data: [] as Client[] };
    }
    return { success: true, data: (data || []).map(mapRowToClient) };
  } catch (error) {
    return { success: false, error: (error as Error).message, data: [] as Client[] };
  }
};

/** Look a customer up by any spelling of its name. */
export const getClientByName = async (name: string): Promise<Client | null> => {
  const nameKey = clientKeyOf(name);
  if (!nameKey) return null;

  const { data, error } = await supabaseClient
    .from('clients')
    .select(SELECT_COLUMNS)
    .eq('name_key', nameKey)
    .maybeSingle();

  if (error) {
    console.error('[ClientService] getClientByName:', error.message);
    return null;
  }
  return data ? mapRowToClient(data) : null;
};

export const getClientById = async (id: string): Promise<Client | null> => {
  if (!id?.trim()) return null;

  const { data, error } = await supabaseClient
    .from('clients')
    .select(SELECT_COLUMNS)
    .eq('id', id)
    .maybeSingle();

  if (error) {
    console.error('[ClientService] getClientById:', error.message);
    return null;
  }
  return data ? mapRowToClient(data) : null;
};

/** Only writes keys the caller actually provided, so blanks never clobber data. */
const profileToRow = (profile: Partial<ClientProfileInput>) => {
  const row: Record<string, any> = {};
  const put = (column: string, value?: string) => {
    if (value !== undefined && String(value).trim() !== '') row[column] = value;
  };
  put('name', profile.name);
  put('company_name', profile.companyName);
  put('gstin', profile.gstin);
  put('contact_person', profile.contactPerson);
  put('contact_email', profile.contactEmail);
  put('contact_phone', profile.contactPhone);
  put('address', profile.address);
  put('city', profile.city);
  put('state', profile.state);
  put('pincode', profile.pincode);
  if (profile.clientType) row.client_type = profile.clientType;
  return row;
};

/**
 * Resolve the customer for a name, creating it (and its Customer ID) if this is
 * the first time we've seen them.
 *
 * Existing customers are enriched, never overwritten: only fields that are
 * currently blank get filled in from `profile`, so a work order raised with a
 * stale phone number can't wipe a corrected one.
 *
 * The insert races against a UNIQUE(name_key) constraint rather than a
 * read-then-write check, so two simultaneous saves can't mint two Customer IDs
 * for the same client — the loser re-reads the winner's row.
 */
export const ensureClient = async (
  profile: ClientProfileInput
): Promise<{ success: boolean; data?: Client; error?: string }> => {
  const nameKey = clientKeyOf(profile.name);
  if (!nameKey) return { success: false, error: 'A client name is required' };

  try {
    const existing = await getClientByName(profile.name);

    if (existing) {
      // Fill only the gaps
      const incoming = profileToRow(profile);
      const patch: Record<string, any> = {};
      const current = existing as unknown as Record<string, any>;
      const columnToField: Record<string, keyof Client> = {
        company_name: 'companyName',
        gstin: 'gstin',
        contact_person: 'contactPerson',
        contact_email: 'contactEmail',
        contact_phone: 'contactPhone',
        address: 'address',
        city: 'city',
        state: 'state',
        pincode: 'pincode',
      };
      for (const [column, field] of Object.entries(columnToField)) {
        if (incoming[column] && !current[field]) patch[column] = incoming[column];
      }
      // An occasional client that now has a work order becomes a regular client
      if (profile.clientType === 'regular' && existing.clientType !== 'regular') {
        patch.client_type = 'regular';
      }

      if (Object.keys(patch).length === 0) return { success: true, data: existing };

      const { data, error } = await supabaseClient
        .from('clients')
        .update(patch)
        .eq('id', existing.id)
        .select(SELECT_COLUMNS)
        .single();

      if (error) {
        // Enrichment is best-effort — the customer identity still resolved
        console.error('[ClientService] ensureClient enrich:', error.message);
        return { success: true, data: existing };
      }
      return { success: true, data: mapRowToClient(data) };
    }

    const insertRow = {
      ...profileToRow(profile),
      name: profile.name.trim(),
      name_key: nameKey,
      client_type: profile.clientType || 'regular',
      created_by: typeof window !== 'undefined' ? localStorage.getItem('userName') || 'Admin' : 'Admin',
    };

    const { data, error } = await supabaseClient
      .from('clients')
      .insert(insertRow)
      .select(SELECT_COLUMNS)
      .single();

    if (error) {
      // 23505 = unique violation: someone else created this customer first
      if ((error as any).code === '23505') {
        const winner = await getClientByName(profile.name);
        if (winner) return { success: true, data: winner };
      }
      console.error('[ClientService] ensureClient insert:', error.message);
      return { success: false, error: error.message };
    }

    return { success: true, data: mapRowToClient(data) };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
};

export const updateClient = async (id: string, profile: Partial<ClientProfileInput>) => {
  try {
    const row = profileToRow(profile);
    if (profile.name) row.name_key = clientKeyOf(profile.name);
    if (Object.keys(row).length === 0) return { success: true };

    const { error } = await supabaseClient.from('clients').update(row).eq('id', id);
    if (error) {
      console.error('[ClientService] updateClient:', error.message);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
};
