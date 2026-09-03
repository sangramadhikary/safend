import { describe, it, expect, beforeEach, vi } from 'vitest';

// Track whether the PDF renderer was ever invoked. The oversized-payload guard
// must short-circuit before any rendering happens, so for a rejected payload
// this mock's `pdf` factory must never be called. `vi.hoisted` lets the mock be
// referenced inside the hoisted `vi.mock` factory below.
const { pdfMock } = vi.hoisted(() => ({
  pdfMock: vi.fn(() => ({
    toBlob: async () => ({
      arrayBuffer: async () => new ArrayBuffer(8),
    }),
  })),
}));

// Mock the heavy React-PDF renderer. `StyleSheet.create` runs at module load,
// so it must be provided; the element factories are inert string tags since we
// never actually render in these tests.
vi.mock('@react-pdf/renderer', () => ({
  Document: 'Document',
  Page: 'Page',
  Text: 'Text',
  View: 'View',
  Image: 'Image',
  StyleSheet: { create: (styles: unknown) => styles },
  Font: { register: vi.fn(), registerHyphenationCallback: vi.fn() },
  pdf: pdfMock,
}));

import { NextRequest } from 'next/server';
import { POST } from '../route';

const MAX_SERVICE_LINE_ENTRIES = 500;

// Build a quotation payload whose `serviceInstances` carries exactly `count`
// service-line entries (the arrays that drive PDF rendering cost).
function payloadWithServiceLines(count: number) {
  const instances = Array.from({ length: count }, () => ({
    shiftType: '8H',
    shifts: { day: { enabled: true, quantity: 1, rate: 100 } },
  }));
  return {
    quotationId: 'Q-TEST',
    serviceInstances: { unarmedGuards: instances },
  };
}

// Each request uses a unique client IP so the in-memory rate limiter (10/min
// per IP) never interferes across test cases.
let ipCounter = 0;
function jsonRequest(body: unknown): NextRequest {
  ipCounter += 1;
  return new NextRequest('http://localhost/api/quotation-pdf', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': `10.0.0.${ipCounter}`,
    },
    body: JSON.stringify(body),
  });
}

describe('quotation-pdf oversized-payload guard (Req 13.6)', () => {
  beforeEach(() => {
    pdfMock.mockClear();
  });

  it('returns HTTP 413 and renders no PDF when service-line entries exceed the cap', async () => {
    const res = await POST(jsonRequest(payloadWithServiceLines(MAX_SERVICE_LINE_ENTRIES + 1)));

    expect(res.status).toBe(413);
    // No PDF was rendered.
    expect(pdfMock).not.toHaveBeenCalled();

    const json = await res.json();
    expect(json.error).toMatch(/too many service-line entries/i);
  });

  it('rejects a payload far above the cap with 413 and no rendering', async () => {
    const res = await POST(jsonRequest(payloadWithServiceLines(5000)));

    expect(res.status).toBe(413);
    expect(pdfMock).not.toHaveBeenCalled();
  });

  it('counts posts and locations toward the cap (combined arrays over the limit -> 413)', async () => {
    const body = {
      quotationId: 'Q-COMBINED',
      serviceInstances: { unarmedGuards: Array.from({ length: 300 }, () => ({ shiftType: '8H', shifts: {} })) },
      posts: Array.from({ length: 150 }, () => ({})),
      locations: Array.from({ length: 60 }, () => ({})),
    };

    const res = await POST(jsonRequest(body));

    expect(res.status).toBe(413);
    expect(pdfMock).not.toHaveBeenCalled();
  });

  it('allows a payload at the cap to proceed to rendering (no 413)', async () => {
    const res = await POST(jsonRequest(payloadWithServiceLines(MAX_SERVICE_LINE_ENTRIES)));

    expect(res.status).not.toBe(413);
    // The guard let it through, so the renderer was invoked.
    expect(pdfMock).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
  });
});
