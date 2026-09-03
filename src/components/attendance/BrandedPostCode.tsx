'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Button } from '@/components/ui/button';
import { Loader2, Printer, RefreshCw, AlertTriangle } from 'lucide-react';
import { getSupabaseClient } from '@/integrations/supabase/client';

/**
 * BrandedPostCode — Safend-branded attendance code card.
 *
 * Renders a HMAC-signed QR code inside a horizontally stretched poster design
 * that doesn't look like a typical QR code. The QR is embedded within branded
 * artwork: company colours, logo, post name — appearing as a security
 * certificate rather than a scannable code.
 *
 * Visual design:
 * - Landscape/stretched card (wider than tall)
 * - Left: Safend branding + post info
 * - Right: QR code with custom colours + logo overlay
 * - Overall: looks like a site certificate, not a "scan me" code
 */

interface BrandedPostCodeProps {
  postId: string;
  postName?: string;
  postCode?: string;
  clientName?: string;
}

interface QrResponse {
  code: string;
  post: { id: string; post_name: string | null; post_code: string | null };
}

type FetchState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: QrResponse }
  | { status: 'error'; message: string };

export function BrandedPostCode({ postId, postName, postCode, clientName }: BrandedPostCodeProps) {
  const [state, setState] = useState<FetchState>({ status: 'idle' });
  const printRef = useRef<HTMLDivElement>(null);

  const fetchCode = useCallback(async () => {
    if (!postId) { setState({ status: 'error', message: 'No post selected.' }); return; }
    setState({ status: 'loading' });
    try {
      // Get the current session token for authorization
      const client = getSupabaseClient();
      const { data: { session } } = await client.auth.getSession();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }

      const res = await fetch('/api/attendance/qr', {
        method: 'POST',
        headers,
        body: JSON.stringify({ post_id: postId }),
      });
      if (!res.ok) {
        let message = 'Failed to generate code.';
        try { const b = await res.json(); if (b?.error) message = b.error; } catch {}
        setState({ status: 'error', message });
        return;
      }
      const data = (await res.json()) as QrResponse;
      if (!data?.code) { setState({ status: 'error', message: 'Empty response.' }); return; }
      setState({ status: 'success', data });
    } catch {
      setState({ status: 'error', message: 'Network error. Try again.' });
    }
  }, [postId]);

  useEffect(() => { fetchCode(); }, [fetchCode]);

  const handlePrint = useCallback(() => {
    if (state.status !== 'success' || !printRef.current) return;
    const markup = printRef.current.outerHTML;
    const w = window.open('', '_blank', 'width=800,height=600');
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html><head>
      <title>Safend Post Code</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { display: flex; align-items: center; justify-content: center; min-height: 100vh; background: white; font-family: system-ui, sans-serif; }
        @page { size: A5 landscape; margin: 0; }
        @media print { body { background: white; } }
      </style>
    </head><body>${markup}<script>window.onload=()=>{window.focus();window.print();window.onafterprint=()=>window.close()}<\/script></body></html>`);
    w.document.close();
  }, [state]);

  if (state.status === 'loading' || state.status === 'idle') {
    return (
      <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm">Generating secure code…</span>
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <AlertTriangle className="h-5 w-5 text-destructive" />
        <p className="text-sm text-destructive">{state.message}</p>
        <Button variant="outline" size="sm" onClick={fetchCode}>
          <RefreshCw className="mr-2 h-3.5 w-3.5" /> Retry
        </Button>
      </div>
    );
  }

  const { code, post } = state.data;
  const displayName = postName || post.post_name || 'Security Post';
  const displayCode = postCode || post.post_code || '';

  // Expiry: 7th of the next month from now
  const now = new Date();
  const expiryDate = new Date(now.getFullYear(), now.getMonth() + 1, 7);
  const expiryStr = expiryDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  return (
    <div className="space-y-4">
      {/* The branded certificate — half A4 portrait */}
      <div ref={printRef} style={{ width: '100%', maxWidth: 595, margin: '0 auto' }}>
        <div style={{
          width: '100%',
          height: 421,
          border: '2px solid #e5e0dd',
          borderRadius: 8,
          overflow: 'hidden',
          background: 'white',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
        }}>
          {/* Top red bar */}
          <div style={{ height: 5, background: '#D71920', width: '100%', flexShrink: 0 }} />

          {/* Header */}
          <div style={{ padding: '20px 28px 16px', borderBottom: '1px solid #f0eded', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <img src="/logo.png" alt="Safend" style={{ height: 36, width: 'auto', objectFit: 'contain' }} />
              <div style={{ textAlign: 'right' }}>
                <p style={{ fontSize: 8, color: '#999', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Security Post Certificate</p>
                <p style={{ fontSize: 9, color: '#666', marginTop: 2, fontFamily: 'monospace' }}>{displayCode}</p>
                {clientName && <p style={{ fontSize: 9, color: '#444', marginTop: 3, fontWeight: 600 }}>{clientName}</p>}
              </div>
            </div>
          </div>

          {/* Main body */}
          <div style={{ flex: 1, padding: '20px 28px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', overflow: 'hidden' }}>
            {/* Post name */}
            <div>
              <p style={{ fontSize: 9, color: '#999', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600, marginBottom: 4 }}>
                Deployed Security Post
              </p>
              <p style={{ fontSize: 22, fontWeight: 800, color: '#111', lineHeight: 1.2 }}>
                {displayName}
              </p>
              <div style={{ width: 40, height: 3, background: '#D71920', borderRadius: 2, marginTop: 10 }} />
            </div>

            {/* Info row + QR — side by side */}
            <div style={{ display: 'flex', alignItems: 'stretch', gap: 16, marginTop: 16 }}>
              {/* Left: info cards stacked */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ padding: '10px 12px', background: '#fafafa', borderRadius: 6, border: '1px solid #f0eded' }}>
                  <p style={{ fontSize: 8, color: '#999', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>Post ID</p>
                  <p style={{ fontSize: 11, fontWeight: 600, color: '#333', fontFamily: 'monospace' }}>{displayCode || post.id.slice(0, 13)}</p>
                </div>
                <div style={{ padding: '10px 12px', background: '#fafafa', borderRadius: 6, border: '1px solid #f0eded' }}>
                  <p style={{ fontSize: 8, color: '#999', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>Issued On</p>
                  <p style={{ fontSize: 11, fontWeight: 600, color: '#333' }}>{new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                </div>
                <div style={{ padding: '10px 12px', background: '#fafafa', borderRadius: 6, border: '1px solid #f0eded' }}>
                  <p style={{ fontSize: 8, color: '#999', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>Valid Until</p>
                  <p style={{ fontSize: 11, fontWeight: 600, color: '#D71920' }}>{expiryStr}</p>
                </div>
                <div style={{ padding: '10px 12px', background: '#fafafa', borderRadius: 6, border: '1px solid #f0eded' }}>
                  <p style={{ fontSize: 8, color: '#777', lineHeight: 1.4 }}>
                    This verification point is secured by Safend. Authorized personnel use the Safend Ops app to record attendance.
                  </p>
                </div>
              </div>

              {/* Right: QR code */}
              <div style={{
                flexShrink: 0,
                width: 140,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 12,
                background: '#fafafa',
                borderRadius: 8,
                border: '1px solid #f0eded',
              }}>
                <QRCodeSVG
                  value={code}
                  size={116}
                  level="M"
                  marginSize={1}
                  bgColor="#fafafa"
                  fgColor="#1a1a2e"
                />
              </div>
            </div>
          </div>

          {/* Footer */}
          <div style={{
            padding: '10px 28px',
            borderTop: '1px solid #f0eded',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: '#fafafa',
            flexShrink: 0,
          }}>
            <p style={{ fontSize: 7, color: '#888' }}>
              Support: ops@safends.com
            </p>
            <p style={{ fontSize: 7, color: '#bbb' }}>
              © 2026 Safend Secure Solutions Pvt. Ltd.
            </p>
          </div>

          {/* Bottom bar */}
          <div style={{ height: 4, background: '#D71920', width: '100%', flexShrink: 0 }} />
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center justify-center gap-2">
        <Button size="sm" onClick={handlePrint}>
          <Printer className="mr-2 h-4 w-4" /> Print Certificate
        </Button>
        <Button variant="outline" size="sm" onClick={fetchCode}>
          <RefreshCw className="mr-2 h-4 w-4" /> Regenerate
        </Button>
      </div>

      <p className="text-[11px] text-center text-muted-foreground">
        HMAC-signed • Expires 7th of every month • Server-verified only
      </p>
    </div>
  );
}
