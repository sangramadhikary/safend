import { NextRequest, NextResponse } from 'next/server';
import { rateLimit, getClientIp } from '@/lib/rateLimit';
import { isValidGSTIN } from '@/lib/security/lookups';

/**
 * GST Lookup API Route
 *
 * Returns GSTIN profile plus a structured list of the taxpayer's places of
 * business (principal + additional), so the UI can let the user pick which
 * registered address to bill.
 *
 * Provider selection:
 *   - If GST_APPYFLOW_KEY is set, we call Appyflow (https://appyflow.in/api/verifyGST),
 *     which returns `pradr` (principal place of business) and `adadr[]`
 *     (additional places of business) as structured address objects.
 *   - Otherwise we fall back to the free Jamku API
 *     (https://gst.jamku.app/api/gstin/{GSTIN}), which only exposes a single
 *     flattened `adr` string (principal place only).
 *
 * Response shape (stable regardless of provider):
 *   {
 *     success: true,
 *     data: {
 *       gstin, legalName, tradeName, status, registrationDate,
 *       taxpayerType, companyType, stateCode,
 *       address,            // convenience: first/principal address string
 *       pincode,            // convenience: first/principal pincode
 *       addresses: [        // structured places of business
 *         { type: 'principal' | 'additional', nature, address, city, district, state, pincode }
 *       ]
 *     }
 *   }
 */

const STATE_CODE_MAP: Record<string, string> = {
  '01': 'Jammu & Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab',
  '04': 'Chandigarh', '05': 'Uttarakhand', '06': 'Haryana',
  '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh',
  '10': 'Bihar', '11': 'Sikkim', '12': 'Arunachal Pradesh',
  '13': 'Nagaland', '14': 'Manipur', '15': 'Mizoram',
  '16': 'Tripura', '17': 'Meghalaya', '18': 'Assam',
  '19': 'West Bengal', '20': 'Jharkhand', '21': 'Odisha',
  '22': 'Chhattisgarh', '23': 'Madhya Pradesh', '24': 'Gujarat',
  '26': 'Dadra & Nagar Haveli', '27': 'Maharashtra', '29': 'Karnataka',
  '30': 'Goa', '31': 'Lakshadweep', '32': 'Kerala',
  '33': 'Tamil Nadu', '34': 'Puducherry', '35': 'Andaman & Nicobar',
  '36': 'Telangana', '37': 'Andhra Pradesh',
};

interface PlaceOfBusiness {
  type: 'principal' | 'additional';
  nature: string;
  address: string;
  city: string;
  district: string;
  state: string;
  pincode: string;
}

/** Build a single readable address line from a GST `addr` object. */
function formatAddrObject(addr: any): { line: string; city: string; district: string; state: string; pincode: string } {
  if (!addr || typeof addr !== 'object') {
    return { line: '', city: '', district: '', state: '', pincode: '' };
  }
  // Field order mirrors the GST portal address sequence.
  const parts = [
    addr.flno,   // floor no
    addr.bno,    // building no
    addr.bnm,    // building name
    addr.st,     // street
    addr.loc,    // locality
    addr.landMark || addr.lm,
    addr.city,
    addr.dst,    // district
  ]
    .map((p: any) => (typeof p === 'string' ? p.trim() : ''))
    .filter(Boolean);

  const line = parts.join(', ').replace(/\s*,\s*,+/g, ', ').replace(/(^,\s*|\s*,$)/g, '').trim();
  return {
    line,
    city: (addr.city || addr.dst || '').trim(),
    district: (addr.dst || '').trim(),
    state: (addr.stcd || '').trim(),
    pincode: (addr.pncd || '').trim(),
  };
}

/** Appyflow provider — returns structured principal + additional places. */
async function lookupViaAppyflow(gstin: string, key: string): Promise<PlaceOfBusiness[] | null> {
  const url = `https://appyflow.in/api/verifyGST?gstNo=${encodeURIComponent(gstin)}&key_secret=${encodeURIComponent(key)}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) return null;
  const json = await response.json();
  if (json?.error || !json?.taxpayerInfo) return null;

  const info = json.taxpayerInfo;
  const places: PlaceOfBusiness[] = [];

  if (info.pradr?.addr) {
    const f = formatAddrObject(info.pradr.addr);
    if (f.line) {
      places.push({
        type: 'principal',
        nature: info.pradr.ntr || '',
        address: f.line,
        city: f.city,
        district: f.district,
        state: f.state || STATE_CODE_MAP[gstin.substring(0, 2)] || '',
        pincode: f.pincode,
      });
    }
  }

  if (Array.isArray(info.adadr)) {
    for (const a of info.adadr) {
      const f = formatAddrObject(a?.addr);
      if (!f.line) continue;
      places.push({
        type: 'additional',
        nature: a?.ntr || '',
        address: f.line,
        city: f.city,
        district: f.district,
        state: f.state || STATE_CODE_MAP[gstin.substring(0, 2)] || '',
        pincode: f.pincode,
      });
    }
  }

  return places.length > 0 ? places : null;
}

/** Jamku provider (free) — single flattened principal address only. */
async function lookupViaJamku(gstin: string): Promise<{ base: any; places: PlaceOfBusiness[] } | null> {
  const response = await fetch(`https://gst.jamku.app/api/gstin/${gstin}`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    return null;
  }

  const json = await response.json();
  if (!json.success || !json.data) return null;

  const data = json.data;
  const stateName = STATE_CODE_MAP[gstin.substring(0, 2)] || '';
  const places: PlaceOfBusiness[] = data.adr
    ? [{
        type: 'principal',
        nature: '',
        address: String(data.adr),
        city: '',
        district: '',
        state: stateName,
        pincode: data.pincode || '',
      }]
    : [];

  return { base: data, places };
}

export async function GET(request: NextRequest) {
  // Rate limit: unauthenticated outbound proxy — cap to prevent amplification abuse.
  const ip = getClientIp(request);
  const { limited, retryAfter } = rateLimit(`gst:${ip}`, { limit: 20, windowMs: 60_000 });
  if (limited) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } }
    );
  }

  const { searchParams } = new URL(request.url);
  const gstin = searchParams.get('gstin')?.trim().toUpperCase();

  if (!gstin) {
    return NextResponse.json(
      { error: 'GSTIN parameter is required' },
      { status: 400 }
    );
  }

  if (!isValidGSTIN(gstin)) {
    return NextResponse.json(
      { error: 'Invalid GSTIN format. Expected format: 22AAAAA0000A1Z5' },
      { status: 400 }
    );
  }

  const appyflowKey = process.env.GST_APPYFLOW_KEY?.trim();

  try {
    // Jamku is always used for the profile fields (name/status/type). When an
    // Appyflow key is configured we additionally pull structured places of
    // business, since Jamku does not expose pradr/adadr.
    const jamku = await lookupViaJamku(gstin);

    if (!jamku) {
      return NextResponse.json(
        { error: 'GST number not found or service unavailable.' },
        { status: 404 }
      );
    }

    const data = jamku.base;
    let places = jamku.places;

    if (appyflowKey) {
      try {
        const appyflowPlaces = await lookupViaAppyflow(gstin, appyflowKey);
        if (appyflowPlaces && appyflowPlaces.length > 0) {
          places = appyflowPlaces;
        }
      } catch (e: any) {
        // Non-fatal: fall back to the Jamku single-address result.
        console.warn('[gst-lookup] Appyflow lookup failed, using Jamku fallback:', e?.message ?? e);
      }
    }

    const principal = places[0];

    const result = {
      gstin: data.gstin || gstin,
      legalName: data.lgnm || '',
      tradeName: data.tradeName || '',
      status: data.sts || '',
      registrationDate: data.rgdt || '',
      taxpayerType: data.dty || '',
      companyType: data.ctb || '',
      stateCode: gstin.substring(0, 2),
      // Convenience fields (principal place) preserved for backward compatibility.
      address: principal?.address || data.adr || '',
      pincode: principal?.pincode || data.pincode || '',
      // Structured places of business for the "Place of Business" selector.
      addresses: places,
    };

    return NextResponse.json({ success: true, data: result });
  } catch (error: any) {
    console.error('[gst-lookup] Error:', error?.message ?? error);

    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
      return NextResponse.json(
        { error: 'GST lookup timed out. Please try again.' },
        { status: 504 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to fetch GST details. Please try again later.' },
      { status: 500 }
    );
  }
}
