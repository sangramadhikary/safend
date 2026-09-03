'use client';

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * EmployeePicker — one searchable staff picker for Deployments and Attendance
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Replaces three different affordances that all answered the same question
 * ("which guard goes here?") with three different levels of competence:
 *
 *   - Deployments had a good searchable popover with photos and recent-duty hints.
 *   - Attendance's half-day dialog had a bare `<Select>` that rendered "No
 *     candidates available" whenever designation matching failed.
 *   - Attendance's "Replace & Mark Present" had no picker at all. It silently
 *     auto-selected `candidates[0]` — the operator never saw, let alone chose,
 *     who was recorded as standing at the post.
 *
 * The last one was the most serious: attendance is a payroll and liability
 * record, and it was being written with an arbitrary employee the user never
 * confirmed. Every path now goes through a deliberate, visible choice.
 *
 * The list shows *all* active staff, tiered and annotated, rather than filtering
 * down to a possibly-empty set. Unsuitability is communicated (ranking, badges,
 * conflict warnings) instead of being enforced by omission, because at 22:00 with
 * an unstaffed post the operator — not the matcher — should make the call.
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Search, AlertTriangle, Info, IndianRupee, UserX, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { HREmployee } from '@/services/supabase/HREmployeeService';
import {
  type Candidate,
  filterCandidates,
  calcAge,
  initialsOf,
  genderSymbol,
  getServiceLabel,
  resolveServiceTypeKey,
} from './rotaShared';

/**
 * Cap on rendered rows.
 *
 * A staff list of several hundred renders fine; several thousand does not, and a
 * picker is not a browsing surface — search is the intended path to a specific
 * person. Capping keeps the popover instant and tells the user when the view is
 * truncated instead of quietly dropping people.
 */
const MAX_VISIBLE = 80;

export type RecentWorkMap = Record<string, { postName: string; date: string }[]>;

// ─────────────────────────────────────────────────────────────────────────────
// Avatar
// ─────────────────────────────────────────────────────────────────────────────

export function EmployeeAvatar({
  employee,
  size = 'md',
  className,
}: {
  employee: Pick<HREmployee, 'name' | 'photoUrl'>;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const dims = size === 'sm' ? 'w-6 h-6 text-[10px]' : size === 'lg' ? 'w-11 h-11 text-base' : 'w-9 h-9 text-xs';
  return (
    <div
      className={cn(
        'rounded-full bg-gray-200 dark:bg-gray-700 shrink-0 overflow-hidden flex items-center justify-center font-semibold text-gray-600 dark:text-gray-300',
        dims,
        className
      )}
    >
      {employee.photoUrl ? (
        <img src={employee.photoUrl} alt="" className="w-full h-full object-cover" />
      ) : (
        initialsOf(employee.name)
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Row model
// ─────────────────────────────────────────────────────────────────────────────

type Row =
  | { kind: 'header'; label: string; hint?: string; key: string }
  | { kind: 'candidate'; candidate: Candidate; key: string };

const TIER_HEADERS: Record<Candidate['tier'], { label: string; hint: string }> = {
  exact: { label: 'Qualified', hint: 'Designation matches this post requirement' },
  unrecognised: { label: 'Designation not recognised', hint: 'HR designation does not map to a known service type' },
  other: { label: 'Other designations', hint: 'Qualified for a different service type' },
};

function buildRows(candidates: Candidate[], serviceTypeKey: string): Row[] {
  const rows: Row[] = [];
  let lastTier: Candidate['tier'] | null = null;
  // Headers only earn their space when the list is actually mixed; a list that is
  // entirely "Qualified" does not need to be told so.
  const tiersPresent = new Set(candidates.map((c) => c.tier));
  const showHeaders = tiersPresent.size > 1;

  for (const candidate of candidates) {
    if (showHeaders && candidate.tier !== lastTier) {
      const meta = TIER_HEADERS[candidate.tier];
      rows.push({ kind: 'header', label: meta.label, hint: meta.hint, key: `h-${candidate.tier}` });
      lastTier = candidate.tier;
    }
    rows.push({ kind: 'candidate', candidate, key: candidate.employee.id || candidate.employee.employeeId });
  }
  void serviceTypeKey;
  return rows;
}

// ─────────────────────────────────────────────────────────────────────────────
// The list
// ─────────────────────────────────────────────────────────────────────────────

export interface EmployeePickerListProps {
  candidates: Candidate[];
  serviceTypeKey: string;
  onSelect: (employee: HREmployee) => void;
  onShowDetail?: (employee: HREmployee) => void;
  recentWork?: RecentWorkMap;
  /** Currently chosen employee id, rendered with a check. */
  selectedId?: string | null;
  autoFocus?: boolean;
  /** Height of the scrollable region. */
  maxHeight?: number;
  emptyMessage?: string;
  className?: string;
}

/**
 * Searchable, keyboard-navigable staff list.
 *
 * Split out from the popover so dialogs (half-day, replace, fill vacancy) embed
 * the same list rather than reimplementing a lesser one.
 */
export function EmployeePickerList({
  candidates,
  serviceTypeKey,
  onSelect,
  onShowDetail,
  recentWork,
  selectedId,
  autoFocus = true,
  maxHeight = 340,
  emptyMessage = 'No active employees found',
  className,
}: EmployeePickerListProps) {
  const [search, setSearch] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => filterCandidates(candidates, search), [candidates, search]);
  const truncated = filtered.length > MAX_VISIBLE;
  const visible = useMemo(() => (truncated ? filtered.slice(0, MAX_VISIBLE) : filtered), [filtered, truncated]);
  const rows = useMemo(() => buildRows(visible, serviceTypeKey), [visible, serviceTypeKey]);

  /** Indices into `rows` that are selectable, so arrow keys skip headers. */
  const selectableIndices = useMemo(
    () => rows.map((r, i) => (r.kind === 'candidate' ? i : -1)).filter((i) => i >= 0),
    [rows]
  );

  useEffect(() => { setActiveIndex(0); }, [search, candidates]);
  useEffect(() => { if (autoFocus) inputRef.current?.focus(); }, [autoFocus]);

  // Keep the highlighted row in view during keyboard traversal.
  useEffect(() => {
    const rowIdx = selectableIndices[activeIndex];
    if (rowIdx === undefined) return;
    scrollRef.current?.querySelector<HTMLElement>(`[data-row-index="${rowIdx}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, selectableIndices]);

  const commit = useCallback((candidate: Candidate) => {
    onSelect(candidate.employee);
  }, [onSelect]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, selectableIndices.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const rowIdx = selectableIndices[activeIndex];
      const row = rowIdx !== undefined ? rows[rowIdx] : undefined;
      if (row?.kind === 'candidate') commit(row.candidate);
    }
  };

  const exactCount = useMemo(() => candidates.filter((c) => c.tier === 'exact').length, [candidates]);

  return (
    <div className={cn('flex flex-col min-h-0', className)}>
      <div className="p-2 border-b bg-white/70 dark:bg-gray-900/50">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            ref={inputRef}
            placeholder="Search name, ID, phone, designation..."
            className="h-8 pl-7 text-xs"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={handleKeyDown}
            aria-label="Search employees"
          />
        </div>
        <div className="flex items-center justify-between mt-1.5 px-0.5">
          <span className="text-[10px] text-muted-foreground">
            {exactCount} qualified · {candidates.length} active total
          </span>
          <span className="text-[10px] text-muted-foreground hidden sm:inline">↑↓ navigate · ↵ select</span>
        </div>
      </div>

      <div ref={scrollRef} className="overflow-y-auto p-1" style={{ maxHeight }} role="listbox" aria-label="Employees">
        {rows.length === 0 ? (
          <div className="p-6 text-center">
            <UserX className="h-5 w-5 mx-auto mb-2 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">{search ? 'No match for this search' : emptyMessage}</p>
            {search && (
              <button className="mt-1.5 text-[11px] text-[#D71920] hover:underline" onClick={() => setSearch('')}>
                Clear search
              </button>
            )}
          </div>
        ) : (
          rows.map((row, rowIdx) => {
            if (row.kind === 'header') {
              return (
                <div
                  key={row.key}
                  className="px-2 pt-2.5 pb-1 flex items-center gap-1.5 sticky top-0 bg-white/95 dark:bg-gray-900/95 backdrop-blur-xs z-10"
                >
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{row.label}</span>
                  {row.hint && (
                    <span className="text-[10px] text-muted-foreground/70 truncate hidden sm:inline">· {row.hint}</span>
                  )}
                </div>
              );
            }

            const { candidate } = row;
            const emp = candidate.employee;
            const age = calcAge(emp.dateOfBirth);
            const recent = recentWork?.[emp.id || ''] || [];
            const isActive = selectableIndices[activeIndex] === rowIdx;
            const isSelected = selectedId != null && emp.id === selectedId;
            const resolvedKey = resolveServiceTypeKey(emp.designation);

            return (
              <div
                key={row.key}
                data-row-index={rowIdx}
                role="option"
                aria-selected={isSelected}
                className={cn(
                  'group flex items-start rounded-md transition-colors',
                  isActive ? 'bg-[#D71920]/10 ring-1 ring-[#D71920]/25' : 'hover:bg-gray-100 dark:hover:bg-gray-800'
                )}
                onMouseEnter={() => {
                  const idx = selectableIndices.indexOf(rowIdx);
                  if (idx >= 0) setActiveIndex(idx);
                }}
              >
                <button
                  type="button"
                  className="flex-1 min-w-0 text-left px-2 py-2 flex items-start gap-2.5"
                  onClick={() => commit(candidate)}
                >
                  <EmployeeAvatar employee={emp} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium text-xs truncate text-foreground">{emp.name}</span>
                      {genderSymbol(emp.gender) && (
                        <span className="text-[10px] text-muted-foreground shrink-0">{genderSymbol(emp.gender)}</span>
                      )}
                      {isSelected && <Check className="h-3 w-3 text-green-600 shrink-0" />}
                    </div>

                    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mt-0.5 flex-wrap">
                      <span className="font-mono">{emp.employeeId}</span>
                      {age != null && <span>· {age}yr</span>}
                      {emp.height && <span>· {emp.height}cm</span>}
                      {emp.weight && <span>· {emp.weight}kg</span>}
                    </div>

                    {/* Why this person is ranked where they are. */}
                    {candidate.tier !== 'exact' && (
                      <div className="mt-1">
                        <Badge
                          variant="outline"
                          className={cn(
                            'text-[9px] px-1.5 py-0 font-normal',
                            candidate.tier === 'unrecognised'
                              ? 'border-amber-300 text-amber-700 dark:text-amber-300'
                              : 'border-blue-300 text-blue-700 dark:text-blue-300'
                          )}
                        >
                          {candidate.tier === 'unrecognised'
                            ? `Designation: ${emp.designation || 'not set'}`
                            : `${resolvedKey ? getServiceLabel(resolvedKey) : emp.designation}`}
                        </Badge>
                      </div>
                    )}

                    {candidate.conflict && (
                      <div className="flex items-center gap-1 text-[10px] text-red-600 dark:text-red-400 mt-1">
                        <AlertTriangle className="h-3 w-3 shrink-0" />
                        <span className="truncate">Already on {candidate.conflict.shiftKey} at {candidate.conflict.postName}</span>
                      </div>
                    )}

                    {candidate.missingSalary && (
                      <div className="flex items-center gap-1 text-[10px] text-orange-600 dark:text-orange-400 mt-0.5">
                        <IndianRupee className="h-3 w-3 shrink-0" />
                        <span>No salary configured</span>
                      </div>
                    )}

                    {recent.length > 0 && (
                      <div className="text-[10px] text-blue-600 dark:text-blue-400 mt-0.5 truncate">
                        Last: {recent[0].postName} ({new Date(recent[0].date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })})
                      </div>
                    )}
                  </div>
                </button>

                {onShowDetail && (
                  <button
                    type="button"
                    className="shrink-0 self-center px-2 py-2 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                    onClick={(e) => { e.stopPropagation(); onShowDetail(emp); }}
                    title={`View details for ${emp.name}`}
                    aria-label={`View details for ${emp.name}`}
                  >
                    <Info className="h-3.5 w-3.5 text-muted-foreground hover:text-[#D71920]" />
                  </button>
                )}
              </div>
            );
          })
        )}

        {truncated && (
          <div className="px-2 py-2 text-center text-[10px] text-muted-foreground border-t mt-1">
            Showing first {MAX_VISIBLE} of {filtered.length}. Refine your search to narrow the list.
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Popover wrapper
// ─────────────────────────────────────────────────────────────────────────────

export interface EmployeePickerPopoverProps extends Omit<EmployeePickerListProps, 'autoFocus'> {
  children: React.ReactNode;
  align?: 'start' | 'center' | 'end';
  side?: 'top' | 'right' | 'bottom' | 'left';
  width?: number;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function EmployeePickerPopover({
  children,
  align = 'start',
  side,
  width = 400,
  open: controlledOpen,
  onOpenChange,
  onSelect,
  onShowDetail,
  ...listProps
}: EmployeePickerPopoverProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : uncontrolledOpen;
  const setOpen = useCallback((v: boolean) => {
    if (!isControlled) setUncontrolledOpen(v);
    onOpenChange?.(v);
  }, [isControlled, onOpenChange]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="p-0 overflow-hidden" style={{ width }} align={align} side={side}>
        <EmployeePickerList
          {...listProps}
          onSelect={(emp) => { onSelect(emp); setOpen(false); }}
          onShowDetail={onShowDetail ? (emp) => { onShowDetail(emp); setOpen(false); } : undefined}
        />
      </PopoverContent>
    </Popover>
  );
}
