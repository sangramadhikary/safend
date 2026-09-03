/**
 * Field-level diff engine for the audit trail.
 *
 * This is the module that answers "what exactly did she change?".
 *
 * Previously an "Employee Updated" audit row recorded only the employee's name,
 * so the trail could tell you that Ankita edited a record at 18:13 but not which
 * field she touched or what the value was before. That makes the log useless for
 * its actual purpose — you cannot review a change you cannot see.
 *
 * `computeFieldDiff` takes the entity state before and after a mutation and
 * produces three things:
 *
 *   1. `changedFields` — a flat list of dotted paths that actually changed. This
 *      is denormalized into a Postgres `text[]` column with a GIN index, which
 *      is what makes "show me everyone who has ever modified a salary field"
 *      answerable as an indexed query rather than a full scan over JSONB.
 *   2. `before` / `after` — the old and new values for ONLY the changed paths.
 *      Storing full entity snapshots would bloat the table by orders of
 *      magnitude on wide records (an employee row has 60+ columns) while adding
 *      nothing: the unchanged columns are, by definition, already known.
 *   3. `changes` — a per-field breakdown the UI renders directly as a diff view.
 *
 * All comparison is value-based, order-insensitive for object keys, and
 * order-SENSITIVE for arrays (reordering a rota IS a meaningful change).
 *
 * The module is pure and dependency-free so it can be unit-tested in isolation.
 */

import { isNoiseField, redactValue, truncateValue } from './redaction';

/** A single field-level change. */
export interface FieldChange {
  /** Dotted path to the field, e.g. `address.city` or `deductions.0.amount`. */
  path: string;
  /** Human-readable label derived from the path, e.g. `Address › City`. */
  label: string;
  /** Value before the change, redacted per the field rules. */
  before: unknown;
  /** Value after the change, redacted per the field rules. */
  after: unknown;
  /** How the field changed. */
  kind: 'added' | 'removed' | 'modified';
}

/** The result of diffing two entity states. */
export interface FieldDiff {
  /** Dotted paths that changed. Persisted to `audit_log.changed_fields`. */
  changedFields: string[];
  /** Prior values for changed paths only. Persisted to `audit_log.before_data`. */
  before: Record<string, unknown>;
  /** New values for changed paths only. Persisted to `audit_log.after_data`. */
  after: Record<string, unknown>;
  /** Per-field breakdown for UI rendering. */
  changes: FieldChange[];
  /** True when nothing of substance changed (only noise fields differed). */
  isEmpty: boolean;
}

/** Options controlling diff behavior. */
export interface DiffOptions {
  /**
   * Field paths to exclude in addition to the built-in noise list. Accepts exact
   * dotted paths or leaf key names.
   */
  ignore?: readonly string[];
  /** Maximum recursion depth. Guards against cyclic or pathological structures. */
  maxDepth?: number;
  /** Maximum number of changed fields to record. Protects against runaway diffs. */
  maxFields?: number;
}

const DEFAULT_MAX_DEPTH = 6;
const DEFAULT_MAX_FIELDS = 200;

/** True for values that should be compared directly rather than walked into. */
function isPrimitive(value: unknown): boolean {
  return (
    value === null ||
    value === undefined ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint' ||
    value instanceof Date
  );
}

/** True for plain objects that should be walked key-by-key. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false;
  if (Array.isArray(value)) return false;
  if (value instanceof Date) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Normalize a value for comparison.
 *
 * Dates compare by their instant rather than by identity, and `null` and
 * `undefined` are treated as the same absence — a field moving between the two
 * is a storage-layer artifact, not a change a user made.
 */
function normalize(value: unknown): unknown {
  if (value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  return value;
}

/** Deep value equality, order-sensitive for arrays. */
function deepEqual(a: unknown, b: unknown): boolean {
  const na = normalize(a);
  const nb = normalize(b);

  if (na === nb) return true;
  if (na === null || nb === null) return false;

  if (Array.isArray(na) && Array.isArray(nb)) {
    if (na.length !== nb.length) return false;
    return na.every((item, i) => deepEqual(item, nb[i]));
  }

  if (isPlainObject(na) && isPlainObject(nb)) {
    const keysA = Object.keys(na);
    const keysB = Object.keys(nb);
    if (keysA.length !== keysB.length) return false;
    return keysA.every((k) => Object.prototype.hasOwnProperty.call(nb, k) && deepEqual(na[k], nb[k]));
  }

  // Numeric strings and numbers are frequently interchanged by form inputs and
  // Postgres numeric columns. Treating "1000" and 1000 as a change would fill
  // the trail with edits nobody made.
  if (
    (typeof na === 'number' && typeof nb === 'string') ||
    (typeof na === 'string' && typeof nb === 'number')
  ) {
    return String(na) === String(nb);
  }

  return false;
}

/** Convert a dotted path into a readable label: `address.city` -> `Address › City`. */
export function pathToLabel(path: string): string {
  return path
    .split('.')
    .map((segment) => {
      // Array indices read better as positions than as bare numbers.
      if (/^\d+$/.test(segment)) return `#${Number(segment) + 1}`;
      return segment
        .replace(/[_-]+/g, ' ')
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replace(/\b\w/g, (c) => c.toUpperCase());
    })
    .join(' › ');
}

/**
 * Summarize a non-primitive value for display when it is added or removed
 * wholesale, so the UI has something meaningful to show without rendering an
 * entire nested object into a table cell.
 */
function summarize(value: unknown): unknown {
  if (isPrimitive(value)) return normalize(value);
  if (Array.isArray(value)) return `[${value.length} item${value.length === 1 ? '' : 's'}]`;
  if (isPlainObject(value)) {
    const keys = Object.keys(value);
    return `{${keys.length} field${keys.length === 1 ? '' : 's'}: ${keys.slice(0, 5).join(', ')}${keys.length > 5 ? ', …' : ''}}`;
  }
  return truncateValue(String(value));
}

/**
 * Compute the field-level difference between two entity states.
 *
 * Pass `before` as `null`/`undefined` for a creation (everything is `added`) and
 * `after` as `null`/`undefined` for a deletion (everything is `removed`).
 */
export function computeFieldDiff(
  before: unknown,
  after: unknown,
  options: DiffOptions = {}
): FieldDiff {
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
  const maxFields = options.maxFields ?? DEFAULT_MAX_FIELDS;
  const ignore = new Set((options.ignore ?? []).map((k) => k.toLowerCase()));

  const changes: FieldChange[] = [];
  let truncated = false;

  const shouldIgnore = (path: string): boolean => {
    if (isNoiseField(path)) return true;
    if (ignore.has(path.toLowerCase())) return true;
    const leaf = path.split('.').pop()?.toLowerCase() ?? '';
    return ignore.has(leaf);
  };

  const record = (path: string, a: unknown, b: unknown, kind: FieldChange['kind']): void => {
    if (changes.length >= maxFields) {
      truncated = true;
      return;
    }
    changes.push({
      path,
      label: pathToLabel(path),
      before: redactValue(path, isPrimitive(a) ? normalize(a) : summarize(a)),
      after: redactValue(path, isPrimitive(b) ? normalize(b) : summarize(b)),
      kind,
    });
  };

  const walk = (a: unknown, b: unknown, path: string, depth: number): void => {
    if (changes.length >= maxFields) {
      truncated = true;
      return;
    }
    if (path && shouldIgnore(path)) return;
    if (deepEqual(a, b)) return;

    const aMissing = a === null || a === undefined;
    const bMissing = b === null || b === undefined;

    // Wholesale addition or removal — record at this level and stop descending.
    if (aMissing && !bMissing) {
      record(path, null, b, 'added');
      return;
    }
    if (!aMissing && bMissing) {
      record(path, a, null, 'removed');
      return;
    }

    // Depth limit reached, or the two sides are structurally different kinds:
    // record the whole subtree as one modification rather than a misleading
    // field-by-field diff between incomparable shapes.
    const bothObjects = isPlainObject(a) && isPlainObject(b);
    const bothArrays = Array.isArray(a) && Array.isArray(b);

    if (depth >= maxDepth || (!bothObjects && !bothArrays)) {
      record(path, a, b, 'modified');
      return;
    }

    if (bothArrays) {
      const arrA = a as unknown[];
      const arrB = b as unknown[];
      const len = Math.max(arrA.length, arrB.length);
      for (let i = 0; i < len; i += 1) {
        walk(arrA[i], arrB[i], path ? `${path}.${i}` : String(i), depth + 1);
      }
      return;
    }

    const objA = a as Record<string, unknown>;
    const objB = b as Record<string, unknown>;
    const keys = new Set([...Object.keys(objA), ...Object.keys(objB)]);
    for (const key of keys) {
      walk(objA[key], objB[key], path ? `${path}.${key}` : key, depth + 1);
    }
  };

  walk(before, after, '', 0);

  const beforeMap: Record<string, unknown> = {};
  const afterMap: Record<string, unknown> = {};
  for (const change of changes) {
    beforeMap[change.path] = change.before;
    afterMap[change.path] = change.after;
  }

  if (truncated) {
    beforeMap.__truncated = true;
    afterMap.__truncated = true;
  }

  return {
    changedFields: changes.map((c) => c.path),
    before: beforeMap,
    after: afterMap,
    changes,
    isEmpty: changes.length === 0,
  };
}

/**
 * Build a one-line human summary of a diff, for the collapsed table row.
 *
 * Example: `salary 18000 → 21000, designation "Guard" → "Head Guard" (+2 more)`
 */
export function summarizeDiff(diff: FieldDiff, maxFields = 2): string {
  if (diff.isEmpty) return 'No field changes';

  const shown = diff.changes.slice(0, maxFields).map((c) => {
    const fmt = (v: unknown): string => {
      if (v === null || v === undefined) return '∅';
      if (typeof v === 'string') return `"${v}"`;
      return String(v);
    };
    if (c.kind === 'added') return `${c.label} set to ${fmt(c.after)}`;
    if (c.kind === 'removed') return `${c.label} cleared (was ${fmt(c.before)})`;
    return `${c.label} ${fmt(c.before)} → ${fmt(c.after)}`;
  });

  const remaining = diff.changes.length - shown.length;
  return remaining > 0 ? `${shown.join(', ')} (+${remaining} more)` : shown.join(', ');
}
