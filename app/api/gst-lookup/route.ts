import { NextRequest, NextResponse } from 'next/server';
import { rateLimit, getClientIp } from '@/lib/rateLimit';
import { isValidGSTIN } from '@/lib/security/lookups';

/**
 * GST Lookup API Route
 * Fetches GSTIN details from the Jamku free public GST API.
 * Endpoint: https://gst.jamku.app/api/gstin/{GSTIN}
 */

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

  try {
    const response = await fetch(
      `https://gst.jamku.app/api/gstin/${gstin}`,
      {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
        signal: AbortSignal.timeout(10000), // 10 second timeout
      }
    );

    if (!response.ok) {
      return NextResponse.json(
        { error: 'GST number not found or service unavailable.' },
        { status: response.status === 404 ? 404 : 502 }
      );
    }

    const json = await response.json();

    if (!json.success || !json.data) {
      return NextResponse.json(
        { error: 'GST number not found.' },
        { status: 404 }
      );
    }

    const data = json.data;

    const result = {
      gstin: data.gstin || gstin,
      legalName: data.lgnm || '',
      tradeName: data.tradeName || '',
      status: data.sts || '',
      registrationDate: data.rgdt || '',
      taxpayerType: data.dty || '',
      address: data.adr || '',
      stateCode: gstin.substring(0, 2),
      pincode: data.pincode || '',
      companyType: data.ctb || '',
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
