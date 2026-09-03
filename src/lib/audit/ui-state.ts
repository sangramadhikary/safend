/**
 * Structured capture of what was on screen when an action occurred.
 *
 * This is the counterpart to the PNG snapshot, and for most purposes the more
 * useful of the two. An image tells a reviewer what the screen looked like; this
 * tells them what the screen *contained*, in a form that can be queried,
 * filtered, diffed, and printed as text.
 *
 * Concretely, `ui_state` answers questions an image cannot:
 *
 *   - "Which records were visible when she ran that bulk delete?" — searchable.
 *   - "What did she type into the amount field before submitting?" — a value, not
 *     pixels to squint at.
 *   - "Was the branch filter set to Kolkata at the time?" — a key/value pair.
 *
 * It also degrades gracefully. A PNG breaks when the CSS changes, weighs 200 KB,
 * and is unreadable once downscaled; this object is a few hundred bytes and stays
 * valid across redesigns.
 *
 * EVERY value passes through the shared redaction rules before leaving the
 * browser. Password inputs are skipped outright rather than redacted, so a
 * credential is never placed into a payload at all, even transiently.
 */

import { classifyField, redactValue, truncateValue } from './redaction';
import type { UiStateSnapshot } from './types';

/** Attribute that marks a subtree as excluded from all audit capture. */
export const NO_CAPTURE_ATTR = 'data-audit-no-capture';

/** Attribute that marks the element to use as the capture root. */
export const CAPTURE_ROOT_ATTR = 'data-audit-capture-root';

/** Maximum form fields recorded, to bound payload size. */
const MAX_FORM_FIELDS = 40;

/** Maximum filter chips recorded. */
const MAX_FILTERS = 20;

/** True when an element sits inside a subtree opted out of capture. */
function isExcluded(el: Element): boolean {
  return el.closest(`[${NO_CAPTURE_ATTR}]`) !== null;
}

/** True when an element is actually rendered and visible to the user. */
function isVisible(el: Element): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.hidden) return false;
  const style = window.getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
    return false;
  }
  // offsetParent is null for display:none ancestors; position:fixed is the one
  // legitimate exception, so it is checked separately.
  return el.offsetParent !== null || style.position === 'fixed';
}

/**
 * Derive a stable name for a form control.
 *
 * Tries the accessible name first (label text, aria-label) because that is what
 * the user actually saw, then falls back to the technical name/id. A reviewer
 * reading the trail needs "Basic Salary", not "input_47".
 */
function fieldName(el: HTMLElement): string {
  const aria = el.getAttribute('aria-label');
  if (aria) return aria.trim();

  const labelledBy = el.getAttribute('aria-labelledby');
  if (labelledBy) {
    const label = document.getElementById(labelledBy)?.textContent?.trim();
    if (label) return label;
  }

  const id = el.getAttribute('id');
  if (id) {
    const label = document.querySelector(`label[for="${CSS.escape(id)}"]`)?.textContent?.trim();
    if (label) return label;
  }

  const wrapping = el.closest('label')?.textContent?.trim();
  if (wrapping) return wrapping;

  return (
    el.getAttribute('name') ??
    el.getAttribute('placeholder') ??
    id ??
    el.tagName.toLowerCase()
  );
}

/**
 * Read the value of a single control, or `undefined` to skip it.
 *
 * Password, and any field classified as a full-mask credential, return
 * `undefined` — the field is omitted from the snapshot entirely. Recording
 * `"[redacted]"` for a password would confirm the field was filled without
 * adding audit value; omitting it keeps the credential out of the payload.
 */
function readControl(el: Element): { name: string; value: unknown } | undefined {
  if (!(el instanceof HTMLElement)) return undefined;
  if (isExcluded(el) || !isVisible(el)) return undefined;

  const tag = el.tagName.toLowerCase();

  if (tag === 'input') {
    const input = el as HTMLInputElement;
    const type = (input.type || 'text').toLowerCase();

    // Never capture credentials or file paths.
    if (type === 'password' || type === 'hidden' || type === 'file') return undefined;

    const name = fieldName(input);
    if (classifyField(name) === 'full') return undefined;

    if (type === 'checkbox' || type === 'radio') {
      if (!input.checked) return undefined;
      return { name, value: input.value || true };
    }

    if (!input.value) return undefined;
    return { name, value: input.value };
  }

  if (tag === 'textarea') {
    const ta = el as HTMLTextAreaElement;
    if (!ta.value) return undefined;
    const name = fieldName(ta);
    if (classifyField(name) === 'full') return undefined;
    return { name, value: ta.value };
  }

  if (tag === 'select') {
    const sel = el as HTMLSelectElement;
    const name = fieldName(sel);
    if (classifyField(name) === 'full') return undefined;
    const selected = Array.from(sel.selectedOptions).map((o) => o.textContent?.trim() ?? o.value);
    if (selected.length === 0) return undefined;
    return { name, value: selected.length === 1 ? selected[0] : selected };
  }

  return undefined;
}

/**
 * Collect visible form values within a root element.
 *
 * Radix/shadcn `Select` renders a button rather than a native `<select>`, so
 * elements carrying an explicit combobox role are read from their visible text.
 * Without this, every dropdown in the application would be invisible to capture.
 */
function collectFormValues(root: ParentNode): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  let count = 0;

  const natives = root.querySelectorAll('input, textarea, select');
  for (const el of Array.from(natives)) {
    if (count >= MAX_FORM_FIELDS) break;
    const read = readControl(el);
    if (!read) continue;
    out[read.name] = redactValue(read.name, read.value);
    count += 1;
  }

  const comboboxes = root.querySelectorAll('[role="combobox"], [data-slot="select-trigger"]');
  for (const el of Array.from(comboboxes)) {
    if (count >= MAX_FORM_FIELDS) break;
    if (!(el instanceof HTMLElement) || isExcluded(el) || !isVisible(el)) continue;
    const name = fieldName(el);
    const text = el.textContent?.trim();
    if (!text || out[name] !== undefined) continue;
    out[name] = redactValue(name, truncateValue(text, 120));
    count += 1;
  }

  return out;
}

/** Collect the filter/search state visible on screen. */
function collectActiveFilters(root: ParentNode): Record<string, string> {
  const out: Record<string, string> = {};
  let count = 0;

  // Explicit opt-in markers take priority: a component can declare exactly what
  // its filter state is rather than relying on DOM inference.
  const declared = root.querySelectorAll('[data-audit-filter]');
  for (const el of Array.from(declared)) {
    if (count >= MAX_FILTERS) break;
    const key = el.getAttribute('data-audit-filter');
    const value = el.getAttribute('data-audit-filter-value') ?? el.textContent?.trim();
    if (!key || !value) continue;
    out[key] = truncateValue(value, 120);
    count += 1;
  }

  return out;
}

/** Find the deepest heading that is actually visible, preferring h1. */
function findHeading(root: ParentNode): string | undefined {
  for (const selector of ['h1', 'h2', '[role="heading"]']) {
    const candidates = root.querySelectorAll(selector);
    for (const el of Array.from(candidates)) {
      if (isExcluded(el) || !isVisible(el)) continue;
      const text = el.textContent?.trim();
      if (text) return truncateValue(text, 200);
    }
  }
  return undefined;
}

/** Read the label of the currently selected tab, if the page uses tabs. */
function findActiveTab(root: ParentNode): string | undefined {
  const selected = root.querySelector('[role="tab"][aria-selected="true"], [role="tab"][data-state="active"]');
  const text = selected?.textContent?.trim();
  return text ? truncateValue(text, 120) : undefined;
}

/** Count data rows in the primary visible table. */
function countVisibleRows(root: ParentNode): number | undefined {
  const table = root.querySelector('table tbody');
  if (!table) return undefined;
  const rows = Array.from(table.querySelectorAll(':scope > tr')).filter((r) => isVisible(r));
  return rows.length;
}

/** Resolve the element to treat as the capture root. */
export function resolveCaptureRoot(explicit?: HTMLElement | null): HTMLElement {
  if (explicit) return explicit;
  const marked = document.querySelector<HTMLElement>(`[${CAPTURE_ROOT_ATTR}]`);
  if (marked) return marked;
  // Prefer <main> over <body>: it excludes the persistent chrome (sidebar, top
  // bar) that is identical in every snapshot and only wastes space.
  return document.querySelector('main') ?? document.body;
}

/**
 * Capture the structured on-screen state.
 *
 * Returns `undefined` outside a browser rather than throwing, so it can be
 * called unconditionally from shared code paths.
 *
 * @param trigger - the element the user activated, used to record which control
 *                  initiated the action (e.g. `Confirm Delete`).
 * @param root    - optional explicit capture root.
 */
export function captureUiState(
  trigger?: HTMLElement | null,
  root?: HTMLElement | null
): UiStateSnapshot | undefined {
  if (typeof window === 'undefined' || typeof document === 'undefined') return undefined;

  try {
    const el = resolveCaptureRoot(root);

    const snapshot: UiStateSnapshot = {
      title: truncateValue(document.title, 200),
      heading: findHeading(el),
      activeTab: findActiveTab(el),
      visibleRowCount: countVisibleRows(el),
      activeFilters: collectActiveFilters(el),
      formValues: collectFormValues(el),
      triggerLabel: trigger
        ? truncateValue(
            trigger.getAttribute('aria-label') ?? trigger.textContent?.trim() ?? trigger.tagName,
            120
          )
        : undefined,
      scrollY: Math.round(window.scrollY),
    };

    // Drop empty collections so the stored JSON stays compact and the UI does not
    // render empty sections for pages that have no forms or filters.
    if (Object.keys(snapshot.activeFilters ?? {}).length === 0) delete snapshot.activeFilters;
    if (Object.keys(snapshot.formValues ?? {}).length === 0) delete snapshot.formValues;

    return snapshot;
  } catch {
    // Capture is best-effort instrumentation. It must never break the operation
    // the user is actually performing.
    return undefined;
  }
}
