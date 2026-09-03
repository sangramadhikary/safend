/**
 * Tests for the field-level diff engine.
 *
 * This module is what makes the audit trail answer "what exactly changed?", so
 * its edge cases matter more than its happy path. The cases below encode the
 * decisions that were deliberate rather than incidental:
 *
 *   - numeric strings and numbers are the SAME value (form inputs and Postgres
 *     numeric columns disagree constantly, and treating "1000" vs 1000 as an edit
 *     would fill the trail with changes nobody made),
 *   - `null` and `undefined` are the SAME absence (a storage-layer artifact),
 *   - array order IS significant (reordering a rota is a real change),
 *   - noise columns are excluded (or every diff reports `updated_at`),
 *   - credentials are masked but monetary values are not.
 */

import { describe, it, expect } from 'vitest';
import { computeFieldDiff, pathToLabel, summarizeDiff } from '../diff';
import { REDACTED } from '../redaction';

describe('computeFieldDiff — basic behaviour', () => {
  it('reports only the fields that changed', () => {
    const diff = computeFieldDiff(
      { name: 'Ankita', designation: 'Guard', salary: 18000 },
      { name: 'Ankita', designation: 'Head Guard', salary: 21000 }
    );

    expect(diff.changedFields.sort()).toEqual(['designation', 'salary']);
    expect(diff.isEmpty).toBe(false);
    expect(diff.before).toMatchObject({ designation: 'Guard', salary: 18000 });
    expect(diff.after).toMatchObject({ designation: 'Head Guard', salary: 21000 });
  });

  it('returns an empty diff for identical objects', () => {
    const diff = computeFieldDiff({ a: 1, b: 'x' }, { a: 1, b: 'x' });
    expect(diff.isEmpty).toBe(true);
    expect(diff.changedFields).toEqual([]);
  });

  it('classifies additions, removals and modifications', () => {
    const diff = computeFieldDiff(
      { kept: 1, removed: 'gone', changed: 'old' },
      { kept: 1, changed: 'new', added: 'fresh' }
    );

    const byPath = Object.fromEntries(diff.changes.map((c) => [c.path, c.kind]));
    expect(byPath.removed).toBe('removed');
    expect(byPath.added).toBe('added');
    expect(byPath.changed).toBe('modified');
    expect(byPath.kept).toBeUndefined();
  });

  it('walks nested objects and reports dotted paths', () => {
    const diff = computeFieldDiff(
      { address: { city: 'Cuttack', pincode: '753001' } },
      { address: { city: 'Bhubaneswar', pincode: '753001' } }
    );

    expect(diff.changedFields).toEqual(['address.city']);
    expect(diff.changes[0].label).toBe('Address › City');
  });
});

describe('computeFieldDiff — value equivalence', () => {
  it('treats a numeric string and a number as unchanged', () => {
    // Form inputs submit strings; Postgres numeric columns return numbers. If
    // these compared unequal, simply re-saving a record would report an edit.
    const diff = computeFieldDiff({ salary: 18000 }, { salary: '18000' });
    expect(diff.isEmpty).toBe(true);
  });

  it('treats null and undefined as the same absence', () => {
    const diff = computeFieldDiff({ notes: null }, { notes: undefined });
    expect(diff.isEmpty).toBe(true);
  });

  it('still reports a real change from empty to a value', () => {
    const diff = computeFieldDiff({ notes: null }, { notes: 'Follow up Monday' });
    expect(diff.changedFields).toEqual(['notes']);
    expect(diff.changes[0].kind).toBe('added');
  });

  it('compares Date values by instant, not identity', () => {
    const diff = computeFieldDiff(
      { joinedAt: new Date('2026-01-01T00:00:00Z') },
      { joinedAt: new Date('2026-01-01T00:00:00Z') }
    );
    expect(diff.isEmpty).toBe(true);
  });
});

describe('computeFieldDiff — arrays', () => {
  it('treats reordering as a change', () => {
    // A rota with the same people in a different order is a different rota.
    const diff = computeFieldDiff(
      { shift: ['Ankita', 'Rakesh'] },
      { shift: ['Rakesh', 'Ankita'] }
    );
    expect(diff.isEmpty).toBe(false);
  });

  it('reports the index of a changed element', () => {
    const diff = computeFieldDiff(
      { roles: ['sales', 'hr'] },
      { roles: ['sales', 'accounts'] }
    );
    expect(diff.changedFields).toEqual(['roles.1']);
    // Indices read as positions rather than raw offsets.
    expect(diff.changes[0].label).toBe('Roles › #2');
  });

  it('reports an appended element as an addition', () => {
    const diff = computeFieldDiff({ roles: ['sales'] }, { roles: ['sales', 'admin'] });
    expect(diff.changedFields).toEqual(['roles.1']);
    expect(diff.changes[0].kind).toBe('added');
    expect(diff.changes[0].after).toBe('admin');
  });
});

describe('computeFieldDiff — noise and exclusions', () => {
  it('ignores timestamp columns that change on every write', () => {
    const diff = computeFieldDiff(
      { name: 'Ankita', updated_at: '2026-01-01T00:00:00Z' },
      { name: 'Ankita', updated_at: '2026-08-02T10:00:00Z' }
    );
    expect(diff.isEmpty).toBe(true);
  });

  it('honours caller-supplied ignore paths', () => {
    const diff = computeFieldDiff(
      { name: 'A', internalRev: 1 },
      { name: 'B', internalRev: 2 },
      { ignore: ['internalRev'] }
    );
    expect(diff.changedFields).toEqual(['name']);
  });

  it('matches ignore entries against the leaf key of a nested path', () => {
    const diff = computeFieldDiff(
      { meta: { etag: 'aaa' }, name: 'A' },
      { meta: { etag: 'bbb' }, name: 'A' }
    );
    // `etag` is a built-in noise key and is filtered at any depth.
    expect(diff.isEmpty).toBe(true);
  });
});

describe('computeFieldDiff — redaction', () => {
  it('masks credential fields entirely', () => {
    const diff = computeFieldDiff(
      { passwordHash: 'old-hash' },
      { passwordHash: 'new-hash' }
    );
    expect(diff.changes[0].before).toBe(REDACTED);
    expect(diff.changes[0].after).toBe(REDACTED);
  });

  it('partially masks government identifiers, keeping the last four characters', () => {
    const diff = computeFieldDiff(
      { aadharNumber: '123456789012' },
      { aadharNumber: '999988887777' }
    );
    // The tail is retained so two records remain distinguishable.
    expect(String(diff.changes[0].after)).toMatch(/7777$/);
    expect(String(diff.changes[0].after)).not.toContain('9999');
  });

  it('does NOT mask monetary values', () => {
    // Salary and amounts are exactly what an auditor needs to see; access is
    // controlled by RLS on the table, not by masking the values.
    const diff = computeFieldDiff({ salary: 18000 }, { salary: 21000 });
    expect(diff.changes[0].before).toBe(18000);
    expect(diff.changes[0].after).toBe(21000);
  });
});

describe('computeFieldDiff — creation and deletion', () => {
  it('enumerates every field when diffing against an empty object', () => {
    // `logChange` normalizes an absent side to `{}` precisely so that a deletion
    // lists what was lost rather than producing one opaque root-level summary.
    const diff = computeFieldDiff({ name: 'Ankita', salary: 18000 }, {});
    expect(diff.changedFields.sort()).toEqual(['name', 'salary']);
    expect(diff.changes.every((c) => c.kind === 'removed')).toBe(true);
  });

  it('records a single root-level change when diffing against null', () => {
    // Documents the behaviour that motivated the normalization in `logChange`.
    const diff = computeFieldDiff({ name: 'Ankita', salary: 18000 }, null);
    expect(diff.changes).toHaveLength(1);
    expect(diff.changes[0].kind).toBe('removed');
  });
});

describe('computeFieldDiff — bounds', () => {
  it('caps the number of recorded fields and flags truncation', () => {
    const before: Record<string, number> = {};
    const after: Record<string, number> = {};
    for (let i = 0; i < 50; i += 1) {
      before[`f${i}`] = i;
      after[`f${i}`] = i + 1;
    }

    const diff = computeFieldDiff(before, after, { maxFields: 10 });
    expect(diff.changes).toHaveLength(10);
    expect(diff.before.__truncated).toBe(true);
  });

  it('does not recurse past the depth limit', () => {
    const deep = (depth: number, leaf: string): any =>
      depth === 0 ? { leaf } : { nested: deep(depth - 1, leaf) };

    const diff = computeFieldDiff(deep(10, 'a'), deep(10, 'b'), { maxDepth: 3 });
    // Collapses to a single change at the depth limit rather than walking forever.
    expect(diff.changes).toHaveLength(1);
    expect(diff.changes[0].path.split('.').length).toBeLessThanOrEqual(4);
  });
});

describe('pathToLabel', () => {
  it('humanizes snake_case, camelCase and array indices', () => {
    expect(pathToLabel('basic_salary')).toBe('Basic Salary');
    expect(pathToLabel('emergencyContactPhone')).toBe('Emergency Contact Phone');
    expect(pathToLabel('deductions.0.amount')).toBe('Deductions › #1 › Amount');
  });
});

describe('summarizeDiff', () => {
  it('renders a one-line summary with an overflow count', () => {
    const diff = computeFieldDiff(
      { a: 1, b: 2, c: 3, d: 4 },
      { a: 9, b: 8, c: 7, d: 6 }
    );
    const summary = summarizeDiff(diff, 2);
    expect(summary).toContain('→');
    expect(summary).toContain('+2 more');
  });

  it('reports an empty diff plainly', () => {
    const diff = computeFieldDiff({ a: 1 }, { a: 1 });
    expect(summarizeDiff(diff)).toBe('No field changes');
  });
});
