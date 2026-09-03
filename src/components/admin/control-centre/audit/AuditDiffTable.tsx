'use client';

/**
 * Before/after change renderer.
 *
 * This is the component the whole rewrite exists to make possible. Previously the
 * Details column held an info icon whose tooltip printed
 * `JSON.stringify(details, null, 2)` — a raw blob, inside a hover tooltip, which
 * could not be selected, copied, searched, or printed, and which vanished the
 * moment the pointer moved.
 *
 * Changes are now rendered as a proper table: one row per field, old value beside
 * new value, colour-coded by whether the field was added, removed, or modified.
 * Numeric fields additionally show the delta, because "18000 → 21000" is read far
 * more often as "+3,000" than as two separate figures.
 */

import { ArrowRight, Minus, Plus, PencilLine } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { FieldChange } from '@/lib/audit/diff';

/** Render a value with type-appropriate formatting. */
function ValueCell({ value, tone }: { value: unknown; tone: 'before' | 'after' }) {
  const base = 'rounded px-1.5 py-0.5 font-mono text-[11px] break-all';

  if (value === null || value === undefined || value === '') {
    return (
      <span className={cn(base, 'italic text-muted-foreground')} aria-label="empty">
        empty
      </span>
    );
  }

  if (typeof value === 'boolean') {
    return (
      <span
        className={cn(
          base,
          value
            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
            : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
        )}
      >
        {String(value)}
      </span>
    );
  }

  const toneClass =
    tone === 'before'
      ? 'bg-red-50 text-red-800 dark:bg-red-950/30 dark:text-red-300'
      : 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300';

  if (typeof value === 'number') {
    return <span className={cn(base, toneClass, 'tabular-nums')}>{value.toLocaleString('en-IN')}</span>;
  }

  return <span className={cn(base, toneClass)}>{String(value)}</span>;
}

/** Icon and colour per change kind. */
const KIND_META: Record<FieldChange['kind'], { icon: typeof Plus; label: string; className: string }> = {
  added: {
    icon: Plus,
    label: 'Added',
    className: 'text-emerald-600 dark:text-emerald-400',
  },
  removed: {
    icon: Minus,
    label: 'Cleared',
    className: 'text-red-600 dark:text-red-400',
  },
  modified: {
    icon: PencilLine,
    label: 'Changed',
    className: 'text-blue-600 dark:text-blue-400',
  },
};

/**
 * Compute the numeric delta for a change, when both sides are numbers.
 *
 * Returns `null` for non-numeric changes so the caller can omit the column
 * entirely rather than rendering a meaningless dash.
 */
function numericDelta(change: FieldChange): { delta: number; pct: number | null } | null {
  const before = typeof change.before === 'number' ? change.before : Number(change.before);
  const after = typeof change.after === 'number' ? change.after : Number(change.after);

  if (!Number.isFinite(before) || !Number.isFinite(after)) return null;
  if (change.before === null || change.after === null) return null;

  const delta = after - before;
  if (delta === 0) return null;

  return { delta, pct: before !== 0 ? (delta / Math.abs(before)) * 100 : null };
}

interface AuditDiffTableProps {
  changes: readonly FieldChange[];
  /** Render without interactive affordances, for the print view. */
  print?: boolean;
  className?: string;
}

export function AuditDiffTable({ changes, print = false, className }: AuditDiffTableProps) {
  if (changes.length === 0) {
    return (
      <p className="py-3 text-xs text-muted-foreground">
        No field-level changes were recorded for this entry.
      </p>
    );
  }

  return (
    <div className={cn('overflow-hidden rounded-md border', className)}>
      <table className="w-full text-left text-xs">
        <thead className="bg-muted/50">
          <tr>
            <th scope="col" className="w-[34%] px-3 py-2 font-medium">Field</th>
            <th scope="col" className="w-[28%] px-3 py-2 font-medium">Before</th>
            <th scope="col" className="w-[28%] px-3 py-2 font-medium">After</th>
            <th scope="col" className="w-[10%] px-3 py-2 text-right font-medium">Δ</th>
          </tr>
        </thead>
        <tbody>
          {changes.map((change, index) => {
            const meta = KIND_META[change.kind];
            const Icon = meta.icon;
            const delta = numericDelta(change);

            return (
              <tr
                key={`${change.path}-${index}`}
                className={cn(
                  'border-t align-top',
                  !print && 'hover:bg-muted/30'
                )}
              >
                <th scope="row" className="px-3 py-2 text-left font-normal">
                  <span className="flex items-start gap-1.5">
                    <Icon
                      className={cn('mt-0.5 h-3 w-3 shrink-0', meta.className)}
                      aria-hidden="true"
                    />
                    <span className="min-w-0">
                      <span className="block font-medium">{change.label}</span>
                      <span className="block font-mono text-[10px] text-muted-foreground">
                        {change.path}
                      </span>
                    </span>
                    <span className="sr-only">{meta.label}</span>
                  </span>
                </th>

                <td className="px-3 py-2">
                  <ValueCell value={change.before} tone="before" />
                </td>

                <td className="px-3 py-2">
                  <span className="flex items-center gap-1.5">
                    {!print && (
                      <ArrowRight
                        className="h-3 w-3 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
                    )}
                    <ValueCell value={change.after} tone="after" />
                  </span>
                </td>

                <td className="px-3 py-2 text-right">
                  {delta ? (
                    <span
                      className={cn(
                        'font-mono text-[11px] font-semibold tabular-nums',
                        delta.delta > 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-red-600 dark:text-red-400'
                      )}
                    >
                      {delta.delta > 0 ? '+' : ''}
                      {delta.delta.toLocaleString('en-IN')}
                      {delta.pct !== null && Math.abs(delta.pct) < 1000 && (
                        <span className="ml-1 font-normal text-muted-foreground">
                          ({delta.pct > 0 ? '+' : ''}
                          {delta.pct.toFixed(1)}%)
                        </span>
                      )}
                    </span>
                  ) : (
                    <span className="text-muted-foreground" aria-hidden="true">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Compact inline summary of a change set, for the collapsed table row. */
export function AuditChangeSummary({ changes }: { changes: readonly FieldChange[] }) {
  if (changes.length === 0) return null;

  const shown = changes.slice(0, 2);
  const remaining = changes.length - shown.length;

  return (
    <span className="flex flex-wrap items-center gap-1">
      {shown.map((change, i) => (
        <Badge
          key={`${change.path}-${i}`}
          variant="outline"
          className="max-w-[220px] gap-1 px-1.5 py-0 text-[10px] font-normal"
        >
          <span className="truncate font-medium">{change.label}</span>
          <span className="text-muted-foreground" aria-hidden="true">→</span>
          <span className="truncate font-mono">
            {change.after === null || change.after === undefined
              ? 'empty'
              : String(change.after)}
          </span>
        </Badge>
      ))}
      {remaining > 0 && (
        <Badge variant="secondary" className="px-1.5 py-0 text-[10px] font-normal">
          +{remaining}
        </Badge>
      )}
    </span>
  );
}
