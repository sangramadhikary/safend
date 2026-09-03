'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Button } from '@/components/ui/button';
import { Loader2, Printer, RefreshCw, QrCode, AlertTriangle } from 'lucide-react';

/**
 * QrPostCodes — Per-post QR code generation UI (Requirement 16).
 *
 * Requests a scannable attendance code for a single post from
 * `POST /api/attendance/qr` and renders it with `qrcode.react` into a
 * printable view containing the QR image, the post name, and the post code.
 *
 *  - R16.4: renders the QR image + post name + post code and offers a print
 *    control that prints a print-scoped view (just the code + labels, not the
 *    surrounding app chrome).
 *  - R16.3: generation never shows a partial code — while loading or on error
 *    the QR is not rendered. Failures surface an error message with a retry
 *    control that re-requests the code.
 *
 * The server is the sole authority on the encoded content; this component only
 * renders what `POST /api/attendance/qr` returns and never fabricates a code
 * locally.
 */

interface QrPostCodesProps {
  /** The `operational_posts.id` to generate an attendance QR code for. */
  postId: string;
  /** Optional pixel size for the rendered QR image. Defaults to 240. */
  size?: number;
}

/** Shape returned by `POST /api/attendance/qr` on success. */
interface QrResponse {
  code: string;
  post: {
    id: string;
    post_name: string | null;
    post_code: string | null;
  };
}

type FetchState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: QrResponse }
  | { status: 'error'; message: string };

export function QrPostCodes({ postId, size = 240 }: QrPostCodesProps) {
  const [state, setState] = useState<FetchState>({ status: 'idle' });
  const printRef = useRef<HTMLDivElement>(null);

  const fetchCode = useCallback(async () => {
    if (!postId) {
      setState({ status: 'error', message: 'No post selected.' });
      return;
    }

    setState({ status: 'loading' });

    try {
      const res = await fetch('/api/attendance/qr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post_id: postId }),
      });

      if (!res.ok) {
        // Read the server-provided reason without ever rendering a code (R16.3).
        let message = 'Failed to generate QR code. Please try again.';
        try {
          const body = await res.json();
          if (body?.error && typeof body.error === 'string') {
            message = res.status === 404 ? 'Post not found.' : body.error;
          }
        } catch {
          // Non-JSON error body — keep the default message.
        }
        setState({ status: 'error', message });
        return;
      }

      const data = (await res.json()) as QrResponse;

      // Guard against a partial/empty payload — never render an incomplete code.
      if (!data?.code || typeof data.code !== 'string') {
        setState({ status: 'error', message: 'Failed to generate QR code. Please try again.' });
        return;
      }

      setState({ status: 'success', data });
    } catch {
      setState({ status: 'error', message: 'Could not reach the server. Please try again.' });
    }
  }, [postId]);

  useEffect(() => {
    fetchCode();
  }, [fetchCode]);

  /**
   * Print a print-scoped view: serialize the printable region into a new
   * window so only the QR image and its labels print, not the app chrome.
   */
  const handlePrint = useCallback(() => {
    if (state.status !== 'success' || !printRef.current) return;

    const markup = printRef.current.innerHTML;
    const printWindow = window.open('', '_blank', 'width=480,height=640');
    if (!printWindow) return;

    printWindow.document.write(`<!DOCTYPE html>
<html>
  <head>
    <title>Attendance QR — ${escapeHtml(state.data.post.post_name ?? state.data.post.post_code ?? 'Post')}</title>
    <style>
      * { box-sizing: border-box; }
      body {
        margin: 0;
        padding: 32px;
        font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .qr-print {
        text-align: center;
      }
      .qr-print svg { width: 320px; height: 320px; }
      .qr-print .post-name { font-size: 20px; font-weight: 700; margin-top: 16px; }
      .qr-print .post-code { font-size: 14px; color: #555; margin-top: 4px; letter-spacing: 0.05em; }
      @media print { body { padding: 0; } }
    </style>
  </head>
  <body>
    <div class="qr-print">${markup}</div>
    <script>
      window.onload = function () {
        window.focus();
        window.print();
        window.onafterprint = function () { window.close(); };
      };
    </script>
  </body>
</html>`);
    printWindow.document.close();
  }, [state]);

  // ── Loading ──────────────────────────────────────────────────────────────
  if (state.status === 'loading' || state.status === 'idle') {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-lg border bg-card p-8 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
        <p className="text-sm">Generating QR code…</p>
      </div>
    );
  }

  // ── Error + retry (R16.3) ──────────────────────────────────────────────────
  if (state.status === 'error') {
    return (
      <div
        role="alert"
        className="flex flex-col items-center justify-center gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-8 text-center"
      >
        <AlertTriangle className="h-6 w-6 text-destructive" aria-hidden="true" />
        <p className="text-sm text-destructive">{state.message}</p>
        <Button variant="outline" size="sm" onClick={fetchCode}>
          <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
          Retry
        </Button>
      </div>
    );
  }

  // ── Success: printable view (R16.4) ────────────────────────────────────────
  const { code, post } = state.data;

  return (
    <div className="flex flex-col items-center gap-4 rounded-lg border bg-card p-6">
      <div ref={printRef} className="flex flex-col items-center text-center">
        <QRCodeSVG
          value={code}
          size={size}
          level="M"
          marginSize={2}
          title={post.post_name ?? post.post_code ?? 'Attendance QR'}
        />
        {post.post_name && <div className="post-name mt-4 text-lg font-semibold">{post.post_name}</div>}
        {post.post_code && (
          <div className="post-code mt-1 text-sm tracking-wide text-muted-foreground">{post.post_code}</div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Button size="sm" onClick={handlePrint}>
          <Printer className="mr-2 h-4 w-4" aria-hidden="true" />
          Print
        </Button>
        <Button variant="outline" size="sm" onClick={fetchCode}>
          <QrCode className="mr-2 h-4 w-4" aria-hidden="true" />
          Regenerate
        </Button>
      </div>
    </div>
  );
}

/** Minimal HTML escaper for the print window <title>. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export default QrPostCodes;
