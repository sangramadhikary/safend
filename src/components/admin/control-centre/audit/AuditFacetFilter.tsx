'use client';

/**
 * Multi-select facet filter.
 *
 * Replaces the single-select dropdowns the audit log previously used. Those
 * allowed exactly one module and one date range, so a question as ordinary as
 * "show me deletions in HR and Accounts" could not be expressed — the operator
 * had to run two separate queries and compare them by eye.
 *
 * Each option carries its own result count, taken from the server-computed
 * facets, so the operator can see how many records a filter will return before
 * applying it and can tell an empty result from an unused dimension.
 */

import { useMemo, useState } from 'react';
import { Check, ChevronsUpDown, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export interface FacetOption {
  value: string;
  label: string;
  /** Secondary line, e.g. an email beneath a display name. */
  hint?: string;
  /** Matching record count from the server facets. */
  count?: number;
  /** Optional leading swatch, used for severity and category colours. */
  dotClass?: string;
}

interface AuditFacetFilterProps {
  label: string;
  options: readonly FacetOption[];
  selected: readonly string[];
  onChange: (next: string[]) => void;
  /** Show a search box inside the popover. Worth it above ~10 options. */
  searchable?: boolean;
  icon?: React.ReactNode;
  className?: string;
  /** Width of the trigger button. */
  width?: string;
}

export function AuditFacetFilter({
  label,
  options,
  selected,
  onChange,
  searchable = false,
  icon,
  className,
  width = 'w-[150px]',
}: AuditFacetFilterProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const visible = useMemo(() => {
    if (!search.trim()) return options;
    const term = search.toLowerCase();
    return options.filter(
      (o) => o.label.toLowerCase().includes(term) || o.hint?.toLowerCase().includes(term)
    );
  }, [options, search]);

  const toggle = (value: string) => {
    const next = new Set(selectedSet);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    onChange([...next]);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn('h-9 justify-between gap-1.5 font-normal', width, className)}
          // Announce the applied state to assistive technology, which cannot infer
          // it from the badge's visual treatment alone.
          aria-label={
            selected.length > 0
              ? `${label}: ${selected.length} selected. Change filter.`
              : `${label}: no filter applied. Change filter.`
          }
        >
          <span className="flex min-w-0 items-center gap-1.5">
            {icon}
            <span className="truncate text-xs">{label}</span>
          </span>
          {selected.length > 0 ? (
            <Badge
              variant="secondary"
              className="ml-1 h-5 shrink-0 rounded px-1.5 text-[10px] font-semibold tabular-nums"
            >
              {selected.length}
            </Badge>
          ) : (
            <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-[260px] p-0" align="start">
        {searchable && (
          <div className="relative border-b p-2">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Filter ${label.toLowerCase()}…`}
              className="h-8 pl-7 text-xs"
              aria-label={`Search ${label} options`}
            />
          </div>
        )}

        <ScrollArea className="max-h-[280px]">
          <div className="p-1" role="group" aria-label={`${label} options`}>
            {visible.length === 0 ? (
              <p className="px-2 py-6 text-center text-xs text-muted-foreground">No matches</p>
            ) : (
              visible.map((option) => {
                const isSelected = selectedSet.has(option.value);
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="checkbox"
                    aria-checked={isSelected}
                    onClick={() => toggle(option.value)}
                    className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs hover:bg-accent focus:bg-accent focus:outline-hidden"
                  >
                    <span
                      className={cn(
                        'flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border',
                        isSelected
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-muted-foreground/40'
                      )}
                      aria-hidden="true"
                    >
                      {isSelected && <Check className="h-2.5 w-2.5" />}
                    </span>

                    {option.dotClass && (
                      <span
                        className={cn('h-2 w-2 shrink-0 rounded-full', option.dotClass)}
                        aria-hidden="true"
                      />
                    )}

                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{option.label}</span>
                      {option.hint && (
                        <span className="block truncate text-[10px] text-muted-foreground">
                          {option.hint}
                        </span>
                      )}
                    </span>

                    {option.count !== undefined && (
                      <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                        {option.count.toLocaleString('en-IN')}
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </ScrollArea>

        {selected.length > 0 && (
          <>
            <Separator />
            <div className="p-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-full justify-center gap-1.5 text-xs"
                onClick={() => onChange([])}
              >
                <X className="h-3 w-3" />
                Clear {selected.length} selected
              </Button>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
