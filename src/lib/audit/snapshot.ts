/**
 * Visual snapshot capture for the audit trail.
 *
 * WHAT THIS CAN AND CANNOT DO — read before relying on it
 * ------------------------------------------------------
 * This module renders the application's OWN DOM to a PNG. It does NOT and cannot
 * capture the user's screen.
 *
 * A true screen capture in a web application requires `getDisplayMedia()`, which
 * by design:
 *   - prompts the user for permission on every single session,
 *   - shows a persistent, non-suppressible "sharing your screen" indicator, and
 *   - lets the user pick what to share, or refuse entirely.
 *
 * That is a deliberate browser security boundary, not an obstacle to engineer
 * around, so silent screen capture is not achievable here by any means. What IS
 * achievable without any prompt is rendering our own page — which is the useful
 * part for auditing anyway, since the question being asked is "what did our
 * application show her when she confirmed this", not "what else was on her
 * desktop".
 *
 * Consequences to be aware of:
 *   - Other browser tabs, other applications, and the OS are never captured.
 *   - Cross-origin images render blank unless CORS-enabled. Same-origin assets
 *     are fine.
 *   - html2canvas reimplements CSS layout, so exotic styling can render
 *     imperfectly. `ui_state` (see ./ui-state.ts) is captured alongside every
 *     image precisely so the evidential record does not depend on pixel fidelity.
 *
 * PRIVACY POSTURE
 * ---------------
 * Snapshots are personal data: they contain whatever was on screen, about both
 * the operator and the employees whose records were open. Accordingly:
 *   - Capture is opt-in per action via the catalog's `snapshot` flag, which is
 *     false for the overwhelming majority. Routine page views are never captured.
 *   - It can be disabled globally at runtime.
 *   - Any subtree marked `data-audit-no-capture` is blanked before rendering.
 *   - A brief visible indicator is shown while capturing, so the behaviour is
 *     never covert.
 *   - Images live in a private bucket and expire after 90 days, well before the
 *     textual trail's 730.
 *
 * Deploying this requires a corresponding notice in staff employment terms.
 */

import { NO_CAPTURE_ATTR, resolveCaptureRoot } from './ui-state';

/** Longest edge of the produced image, in CSS pixels. */
const MAX_DIMENSION = 1600;

/** JPEG-style quality for the WebP encode. */
const IMAGE_QUALITY = 0.72;

/** Hard ceiling on the encoded image, matching the storage bucket limit. */
const MAX_BYTES = 5 * 1024 * 1024;

/** How long the "capturing" indicator stays on screen, in ms. */
const INDICATOR_MS = 900;

/** Runtime kill switch, independent of the per-action catalog flag. */
let captureEnabled = true;

/** Enable or disable all visual capture at runtime. */
export function setSnapshotCaptureEnabled(enabled: boolean): void {
  captureEnabled = enabled;
}

/** Whether visual capture is currently permitted. */
export function isSnapshotCaptureEnabled(): boolean {
  return captureEnabled;
}

/**
 * Briefly show a non-blocking indicator that a snapshot was taken.
 *
 * Present so capture is observable by the person being recorded. Covert
 * screen-content capture of staff is the thing this module is explicitly not
 * doing, and an indicator is what makes that visible rather than merely stated.
 */
function showCaptureIndicator(): void {
  if (typeof document === 'undefined') return;
  try {
    const el = document.createElement('div');
    el.setAttribute(NO_CAPTURE_ATTR, 'true');
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.textContent = 'Audit snapshot recorded';
    el.style.cssText = [
      'position:fixed', 'bottom:16px', 'left:16px', 'z-index:2147483647',
      'padding:6px 12px', 'border-radius:6px',
      'background:rgba(15,23,42,0.92)', 'color:#f8fafc',
      'font:500 12px/1.4 system-ui,-apple-system,sans-serif',
      'pointer-events:none', 'box-shadow:0 2px 8px rgba(0,0,0,0.25)',
      'transition:opacity 200ms ease', 'opacity:1',
    ].join(';');
    document.body.appendChild(el);
    window.setTimeout(() => {
      el.style.opacity = '0';
      window.setTimeout(() => el.remove(), 220);
    }, INDICATOR_MS);
  } catch {
    // Indicator failure must not prevent the capture itself.
  }
}

/** Result of a successful capture. */
export interface CapturedSnapshot {
  blob: Blob;
  width: number;
  height: number;
  mimeType: string;
  byteSize: number;
}

/**
 * Render the current view to an image.
 *
 * Returns `null` rather than throwing on any failure — a snapshot is
 * supplementary evidence, and losing it must never surface as an error in the
 * user's actual operation.
 */
export async function captureSnapshotImage(
  root?: HTMLElement | null
): Promise<CapturedSnapshot | null> {
  if (typeof window === 'undefined' || typeof document === 'undefined') return null;
  if (!captureEnabled) return null;

  try {
    const target = resolveCaptureRoot(root);
    if (!target) return null;

    // Loaded on demand: html2canvas is ~200 KB and is needed only on the small
    // subset of actions flagged for capture, so it must not sit in the main
    // bundle that every page pays for.
    const { default: html2canvas } = await import('html2canvas');

    // Scale down oversized pages rather than producing a huge image.
    const rect = target.getBoundingClientRect();
    const longest = Math.max(rect.width, rect.height, 1);
    const scale = Math.min(1, MAX_DIMENSION / longest);

    const canvas = await html2canvas(target, {
      scale,
      useCORS: true,
      // Cross-origin assets that refuse CORS would otherwise abort the whole
      // render; tainting the canvas instead lets the rest of the page capture.
      allowTaint: false,
      backgroundColor: window.getComputedStyle(document.body).backgroundColor || '#ffffff',
      logging: false,
      // Skip both the excluded subtrees and any element that is itself an
      // artifact of capture (the indicator, toasts).
      ignoreElements: (el) =>
        el.hasAttribute?.(NO_CAPTURE_ATTR) ||
        el.getAttribute?.('role') === 'status' ||
        el.tagName === 'SCRIPT' ||
        el.tagName === 'STYLE',
      // Blank out opted-out subtrees in the cloned document, so their content is
      // never rasterized even if the ignore predicate is bypassed by nesting.
      onclone: (doc) => {
        doc.querySelectorAll(`[${NO_CAPTURE_ATTR}]`).forEach((el) => {
          if (el instanceof HTMLElement) {
            el.style.filter = 'blur(10px)';
            el.textContent = '';
          }
        });
      },
    });

    // WebP at moderate quality is roughly a third the size of PNG for screen
    // content, and every browser this application supports can decode it.
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), 'image/webp', IMAGE_QUALITY);
    });

    if (!blob || blob.size === 0 || blob.size > MAX_BYTES) return null;

    showCaptureIndicator();

    return {
      blob,
      width: canvas.width,
      height: canvas.height,
      mimeType: blob.type || 'image/webp',
      byteSize: blob.size,
    };
  } catch {
    return null;
  }
}

/**
 * Capture and upload a snapshot, returning its storage path.
 *
 * The upload is a separate round trip from the audit write so a multi-hundred-
 * kilobyte binary never delays recording the event itself. The path is attached
 * to the audit entry afterwards.
 */
export async function captureAndUploadSnapshot(
  context: { action: string; target: string },
  root?: HTMLElement | null
): Promise<string | null> {
  const captured = await captureSnapshotImage(root);
  if (!captured) return null;

  try {
    const form = new FormData();
    form.append('image', captured.blob, 'snapshot.webp');
    form.append('action', context.action);
    form.append('target', context.target);
    form.append('width', String(captured.width));
    form.append('height', String(captured.height));

    const res = await fetch('/api/audit/snapshot', {
      method: 'POST',
      body: form,
      credentials: 'same-origin',
    });

    if (!res.ok) return null;
    const data = (await res.json()) as { path?: string };
    return data.path ?? null;
  } catch {
    return null;
  }
}
