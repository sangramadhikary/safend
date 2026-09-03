import { NextRequest, NextResponse } from 'next/server';
import { rateLimit, getClientIp } from '@/lib/rateLimit';
import { isValidPincode } from '@/lib/security/lookups';

/**
 * Pincode Lookup API Route
 * Fetches district and state from Indian PIN code using the public postal API.
 * Endpoint: https://api.postalpincode.in/pincode/{PIN}
 */

export async function GET(request: NextRequest) {
  // Rate limit: unauthenticated outbound proxy — cap to prevent amplification abuse.
  const ip = getClientIp(request);
  const { limited, retryAfter } = rateLimit(`pincode:${ip}`, { limit: 20, windowMs: 60_000 });
  if (limited) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } }
    );
  }

  const { searchParams } = new URL(request.url);
  const pincode = searchParams.get('pincode')?.trim();

  if (!pincode) {
    return NextResponse.json(
      { error: 'Pincode parameter is required' },
      { status: 400 }
    );
  }

  // Validate: Indian pin codes are 6 digits
  if (!isValidPincode(pincode)) {
    return NextResponse.json(
      { error: 'Invalid pincode. Must be 6 digits.' },
      { status: 400 }
    );
  }

  try {
    const response = await fetch(
      `https://api.postalpincode.in/pincode/${pincode}`,
      {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(8000),
      }
    );

    if (!response.ok) {
      return NextResponse.json(
        { error: 'Pincode lookup service unavailable.' },
        { status: 502 }
      );
    }

    const data = await response.json();

    if (!data || !Array.isArray(data) || data[0]?.Status === 'Error' || !data[0]?.PostOffice?.length) {
      return NextResponse.json(
        { error: 'No results found for this pincode.' },
        { status: 404 }
      );
    }

    const postOffice = data[0].PostOffice[0];

    return NextResponse.json({
      success: true,
      data: {
        district: postOffice.District || '',
        state: postOffice.State || '',
        country: postOffice.Country || 'India',
      },
    });
  } catch (error: any) {
    console.error('[pincode-lookup] Error:', error?.message ?? error);

    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
      return NextResponse.json(
        { error: 'Pincode lookup timed out. Please try again.' },
        { status: 504 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to fetch pincode details.' },
      { status: 500 }
    );
  }
}
