'use client';

/**
 * Activity & Audit Log — administrator view.
 *
 * WHAT THIS REPLACES
 * ------------------
 * The previous version presented nine fixed columns, a single-select module
 * dropdown, a single-select date preset, and a search box that filtered a
 * client-held 500-row window. Row detail was a hover tooltip printing raw JSON.
 * Its four summary cards counted the loaded slice rather than the table, so
 * "Total Activities" read 500 whenever the real figure was larger.
 *
 * WHAT CHANGED
 * ------------
 *  - Multi-select filters on actor, action, module, severity, category and
 *    outcome, all combinable, all evaluated in Postgres against the whole table.
 *  - Custom date+time ranges alongside the presets.
 *  - Column visibility and row density are operator-controlled and persisted.
 *  - Sortable columns, server-side.
 *  - Page size control, server-side pagination, honest totals.
 *  - Expandable rows, plus a full detail panel with the field-level diff, the
 *    captured screen state, device and network context, and the raw record.
 *  - Live tail for watching activity as it happens.
 *  - Export to XLSX (two sheets), CSV, and lossless JSON, plus a print/PDF
 *    document — every one covering the whole filtered set, not the visible page.
 *  - Pivot actions: jump from one entry to the whole session, the entity's full
 *    history, or everything by that actor.
 */

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuCheckboxItem,
} from '@/components/ui/dropdown-menu';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  AlertCircle, ArrowDown, ArrowUp, Braces, Calendar, Camera, ChevronDown,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Columns3, Download,
  FileSpreadsheet, FileText, Filter, Layers, MapPin, Monitor, Printer, RefreshCw,
  Rows3, Search, ShieldAlert, Radio, X, Info,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  ACTION_LABELS, CATEGORY_LIST, CATEGORY_STYLES, MODULE_LIST,
  SEVERITY_LIST, SEVERITY_STYLES,
} from '@/lib/audit/actions';
import { fetchAllAuditLog } from '@/utils/auditLog';
import { getSupabaseClient } from '@/integrations/supabase/client';
import type { AuditRecord, AuditOutcome } from '@/lib/audit/types';
import type { ActionCategory, AuditSeverity } from '@/lib/audit/actions';
import { cn } from '@/lib/utils';

import { AuditFacetFilter, type FacetOption } from './audit/AuditFacetFilter';
import { AuditChangeSummary, AuditDiffTable } from './audit/AuditDiffTable';
import { AuditDetailSheet } from './audit/AuditDetailSheet';
import { AuditPrintView, type PrintFilterSummary } from './audit/AuditPrintView';
import { exportAuditToCsv, exportAuditToExcel, exportAuditToJson } from './audit/exporters';
import {
  DATE_PRESETS, resolveDatePreset, useAuditLog, type DatePreset,
} from './audit/useAuditLog';

// ─────────────────────────────────────────────────────────────────────────────
// Column configuration
// ─────────────────────────────────────────────────────────────────────────────

type ColumnId =
  | 'timestamp' | 'user' | 'action' | 'target' | 'changes' | 'module'
  | 'severity' | 'outcome' | 'ip' | 'location' | 'device' | 'route' | 'duration';

interface ColumnDef {
  id: ColumnId;
  label: string;
  /** Sort key accepted by the read route, when the column is sortable. */
  sortKey?: 'timestamp' | 'actor' | 'action' | 'module' | 'severity';
  width: string;
  /** Hidden by default to keep the initial table readable. */
  defaultHidden?: boolean;
}

const COLUMNS: readonly ColumnDef[] = [
  { id: 'timestamp', label: 'Timestamp', sortKey: 'timestamp', width: 'w-[150px]' },
  { id: 'user', label: 'User', sortKey: 'actor', width: 'w-[170px]' },
  { id: 'action', label: 'Action', sortKey: 'action', width: 'w-[150px]' },
  { id: 'target', label: 'Target', width: 'w-[170px]' },
  { id: 'changes', label: 'Changes', width: 'w-[240px]' },
  { id: 'module', label: 'Module', sortKey: 'module', width: 'w-[110px]' },
  { id: 'severity', label: 'Severity', sortKey: 'severity', width: 'w-[90px]' },
  { id: 'outcome', label: 'Outcome', width: 'w-[85px]' },
  { id: 'ip', label: 'IP Address', width: 'w-[115px]' },
  { id: 'location', label: 'Location', width: 'w-[140px]', defaultHidden: true },
  { id: 'device', label: 'Device', width: 'w-[150px]' },
  { id: 'route', label: 'Route', width: 'w-[150px]', defaultHidden: true },
  { id: 'duration', label: 'Duration', width: 'w-[90px]', defaultHidden: true },
];

const COLUMN_PREF_KEY = 'safend.audit.columns';
const DENSITY_PREF_KEY = 'safend.audit.density';

/** Cap on records pulled into the browser for an export or printout. */
const EXPORT_CAP = 10_000;

const PAGE_SIZES = [25, 50, 100, 200, 500];

const OUTCOME_OPTIONS: readonly FacetOption[] = [
  { value: 'success', label: 'Success', dotClass: 'bg-green-500' },
  { value: 'failure', label: 'Failure', dotClass: 'bg-red-500' },
  { value: 'denied', label: 'Denied', dotClass: 'bg-orange-500' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Small presentational helpers
// ─────────────────────────────────────────────────────────────────────────────

function OutcomeBadge({ outcome }: { outcome: AuditOutcome }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        'text-[10px] capitalize',
        outcome === 'success' && 'border-green-300 bg-green-50 text-green-700 dark:border-green-900 dark:bg-green-950/40 dark:text-green-300',
        outcome === 'failure' && 'border-red-300 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300',
        outcome === 'denied' && 'border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-900 dark:bg-orange-950/40 dark:text-orange-300'
      )}
    >
      {outcome}
    </Badge>
  );
}

/** Summary statistic card. */
function StatCard({
  label,
  value,
  hint,
  tone,
  icon,
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: 'default' | 'warning' | 'critical';
  icon?: React.ReactNode;
}) {
  return (
    <Card
      className={cn(
        'p-3',
        tone === 'warning' && 'border-amber-200 dark:border-amber-900',
        tone === 'critical' && 'border-red-200 dark:border-red-900'
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
          <p
            className={cn(
              'mt-0.5 text-xl font-bold tabular-nums',
              tone === 'warning' && 'text-amber-600 dark:text-amber-400',
              tone === 'critical' && 'text-red-600 dark:text-red-400'
            )}
          >
            {typeof value === 'number' ? value.toLocaleString('en-IN') : value}
          </p>
          {hint && <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{hint}</p>}
        </div>
        {icon && <span className="shrink-0 text-muted-foreground">{icon}</span>}
      </div>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export function ActivityAudit() {
  const { toast } = useToast();
  const audit = useAuditLog();
  const {
    filters, searchInput, setSearchInput, patchFilters, resetFilters,
    activeFilterCount, records, facets, totalPages,
    isLoading, isRefreshing, error, lastUpdated, liveTail, setLiveTail, refresh, query,
  } = audit;

  // ── Display preferences, persisted ──────────────────────────────────────
  const [visibleColumns, setVisibleColumns] = useState<Set<ColumnId>>(
    () => new Set(COLUMNS.filter((c) => !c.defaultHidden).map((c) => c.id))
  );
  const [density, setDensity] = useState<'compact' | 'comfortable'>('compact');

  useEffect(() => {
    try {
      const savedColumns = localStorage.getItem(COLUMN_PREF_KEY);
      if (savedColumns) {
        const parsed = JSON.parse(savedColumns) as ColumnId[];
        const valid = parsed.filter((id) => COLUMNS.some((c) => c.id === id));
        if (valid.length > 0) setVisibleColumns(new Set(valid));
      }
      const savedDensity = localStorage.getItem(DENSITY_PREF_KEY);
      if (savedDensity === 'compact' || savedDensity === 'comfortable') setDensity(savedDensity);
    } catch {
      // Preferences are cosmetic; a storage failure must not block rendering.
    }
  }, []);

  const toggleColumn = useCallback((id: ColumnId) => {
    setVisibleColumns((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        // Never allow the table to become entirely columnless.
        if (next.size <= 1) return prev;
        next.delete(id);
      } else {
        next.add(id);
      }
      try {
        localStorage.setItem(COLUMN_PREF_KEY, JSON.stringify([...next]));
      } catch { /* ignore */ }
      return next;
    });
  }, []);

  const changeDensity = useCallback((value: 'compact' | 'comfortable') => {
    setDensity(value);
    try {
      localStorage.setItem(DENSITY_PREF_KEY, value);
    } catch { /* ignore */ }
  }, []);

  const activeColumns = useMemo(
    () => COLUMNS.filter((c) => visibleColumns.has(c.id)),
    [visibleColumns]
  );

  // ── Row expansion and detail panel ──────────────────────────────────────
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [detailRecord, setDetailRecord] = useState<AuditRecord | null>(null);

  const toggleExpanded = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // ── Filter option lists, counts from server facets ──────────────────────
  const actorOptions = useMemo<FacetOption[]>(
    () =>
      facets.actors.map((a) => ({
        value: a.email,
        label: a.name || a.email,
        hint: a.name && a.name !== a.email ? a.email : undefined,
        count: a.count,
      })),
    [facets.actors]
  );

  const moduleOptions = useMemo<FacetOption[]>(() => {
    // Union of the catalog modules and any module present in the data, so
    // historical values that predate the catalog remain selectable.
    const names = new Set<string>([...MODULE_LIST, ...Object.keys(facets.byModule)]);
    return [...names].sort().map((name) => ({
      value: name,
      label: name,
      count: facets.byModule[name],
    }));
  }, [facets.byModule]);

  const actionOptions = useMemo<FacetOption[]>(
    () => ACTION_LABELS.map((label) => ({ value: label, label })),
    []
  );

  const severityOptions = useMemo<FacetOption[]>(
    () =>
      SEVERITY_LIST.map((s) => ({
        value: s,
        label: SEVERITY_STYLES[s].label,
        count: facets.bySeverity[s],
        dotClass: SEVERITY_STYLES[s].dot,
      })),
    [facets.bySeverity]
  );

  const categoryOptions = useMemo<FacetOption[]>(
    () =>
      CATEGORY_LIST.map((c) => ({
        value: c,
        label: c.charAt(0).toUpperCase() + c.slice(1),
        count: facets.byCategory[c],
      })),
    [facets.byCategory]
  );

  const outcomeOptions = useMemo<FacetOption[]>(
    () => OUTCOME_OPTIONS.map((o) => ({ ...o, count: facets.byOutcome[o.value] })),
    [facets.byOutcome]
  );

  // ── Human-readable description of the applied filters ───────────────────
  const filterSummary = useMemo<PrintFilterSummary[]>(() => {
    const out: PrintFilterSummary[] = [];
    if (filters.search) out.push({ label: 'Search', value: filters.search });
    if (filters.datePreset !== 'all') {
      const preset = DATE_PRESETS.find((p) => p.value === filters.datePreset);
      const { from, to } = resolveDatePreset(filters.datePreset, {
        from: filters.customFrom, to: filters.customTo,
      });
      const range = [from, to]
        .filter(Boolean)
        .map((d) => new Date(d!).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }))
        .join(' → ');
      out.push({ label: 'Date range', value: range || preset?.label || filters.datePreset });
    }
    if (filters.actors.length) out.push({ label: 'Users', value: filters.actors.join(', ') });
    if (filters.actions.length) out.push({ label: 'Actions', value: filters.actions.join(', ') });
    if (filters.modules.length) out.push({ label: 'Modules', value: filters.modules.join(', ') });
    if (filters.severities.length) out.push({ label: 'Severity', value: filters.severities.join(', ') });
    if (filters.categories.length) out.push({ label: 'Category', value: filters.categories.join(', ') });
    if (filters.outcomes.length) out.push({ label: 'Outcome', value: filters.outcomes.join(', ') });
    if (filters.sessionId) out.push({ label: 'Session', value: filters.sessionId });
    if (filters.entityType || filters.entityId) {
      out.push({ label: 'Entity', value: `${filters.entityType}${filters.entityId ? ` / ${filters.entityId}` : ''}` });
    }
    if (filters.changedField) out.push({ label: 'Changed field', value: filters.changedField });
    if (filters.hasSnapshot !== null) {
      out.push({ label: 'Snapshot', value: filters.hasSnapshot ? 'Present' : 'Absent' });
    }
    return out;
  }, [filters]);

  // ── Export and print ────────────────────────────────────────────────────
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<string | null>(null);
  const [printData, setPrintData] = useState<AuditRecord[] | null>(null);
  const [printedBy, setPrintedBy] = useState('');
  const [printIncludeChanges, setPrintIncludeChanges] = useState(true);
  const [printIncludeContext, setPrintIncludeContext] = useState(false);

  /**
   * Pull the whole filtered set for an export or printout.
   *
   * Exports must reflect the filters, not the page. The previous implementation
   * exported the client's 500-row buffer, so an export labelled "Last 90 days"
   * could silently contain a fraction of that period.
   */
  const collectAll = useCallback(async (): Promise<AuditRecord[] | null> => {
    if (facets.total === 0) {
      toast({
        title: 'Nothing to export',
        description: 'No records match the current filters.',
        variant: 'destructive',
      });
      return null;
    }

    setIsExporting(true);
    setExportProgress('Collecting records…');
    try {
      const all = await fetchAllAuditLog(query, EXPORT_CAP, (loaded, total) => {
        setExportProgress(`Collecting ${loaded.toLocaleString('en-IN')} of ${total.toLocaleString('en-IN')}…`);
      });
      return all;
    } catch (err: any) {
      toast({
        title: 'Export failed',
        description: err?.message ?? 'Could not collect the records.',
        variant: 'destructive',
      });
      return null;
    } finally {
      setIsExporting(false);
      setExportProgress(null);
    }
  }, [facets.total, query, toast]);

  const handleExport = useCallback(
    async (format: 'xlsx' | 'csv' | 'json') => {
      const all = await collectAll();
      if (!all) return;

      try {
        let filename: string;
        if (format === 'xlsx') filename = await exportAuditToExcel(all);
        else if (format === 'csv') filename = await exportAuditToCsv(all);
        else {
          const { data } = await getSupabaseClient().auth.getUser();
          filename = exportAuditToJson(all, {
            filters: Object.fromEntries(filterSummary.map((f) => [f.label, f.value])),
            exportedBy: data.user?.email ?? undefined,
          });
        }

        toast({
          title: 'Export complete',
          description: `${all.length.toLocaleString('en-IN')} records written to ${filename}.${
            all.length < facets.total
              ? ` Capped at ${EXPORT_CAP.toLocaleString('en-IN')} — narrow the filters for the full set.`
              : ''
          }`,
        });
      } catch (err: any) {
        toast({
          title: 'Export failed',
          description: err?.message ?? 'Could not write the file.',
          variant: 'destructive',
        });
      }
    },
    [collectAll, facets.total, filterSummary, toast]
  );

  const handlePrint = useCallback(async () => {
    const all = await collectAll();
    if (!all) return;
    try {
      const { data } = await getSupabaseClient().auth.getUser();
      setPrintedBy(data.user?.email ?? 'Unknown user');
    } catch {
      setPrintedBy('Unknown user');
    }
    setPrintData(all);
  }, [collectAll]);

  // ── Pivot handlers ──────────────────────────────────────────────────────
  const viewSession = useCallback(
    (sessionId: string) => {
      setDetailRecord(null);
      resetFilters();
      patchFilters({ sessionId, sortDir: 'asc' });
      toast({
        title: 'Filtered to session',
        description: 'Showing every action in this browser session, oldest first.',
      });
    },
    [patchFilters, resetFilters, toast]
  );

  const viewEntity = useCallback(
    (entityType: string, entityId: string) => {
      setDetailRecord(null);
      resetFilters();
      patchFilters({ entityType, entityId, sortDir: 'asc' });
      toast({
        title: 'Filtered to entity',
        description: `Showing the full history of ${entityType} / ${entityId}.`,
      });
    },
    [patchFilters, resetFilters, toast]
  );

  const viewActor = useCallback(
    (email: string) => {
      setDetailRecord(null);
      resetFilters();
      patchFilters({ actors: [email] });
      toast({ title: 'Filtered to user', description: `Showing every action by ${email}.` });
    },
    [patchFilters, resetFilters, toast]
  );

  // ── Sorting ─────────────────────────────────────────────────────────────
  const toggleSort = useCallback(
    (sortKey: NonNullable<ColumnDef['sortKey']>) => {
      if (filters.sortBy === sortKey) {
        patchFilters({ sortDir: filters.sortDir === 'asc' ? 'desc' : 'asc' });
      } else {
        patchFilters({ sortBy: sortKey, sortDir: 'desc' });
      }
    },
    [filters.sortBy, filters.sortDir, patchFilters]
  );

  const rowPad = density === 'compact' ? 'py-1.5' : 'py-3';

  const failureCount = (facets.byOutcome.failure ?? 0) + (facets.byOutcome.denied ?? 0);
  const criticalCount = facets.bySeverity.critical ?? 0;

  const firstRow = facets.total === 0 ? 0 : (filters.page - 1) * filters.pageSize + 1;
  const lastRow = Math.min(filters.page * filters.pageSize, facets.total);

  return (
    <div className="space-y-4">
      {/* ── Summary ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatCard
          label="Matching records" value={facets.total}
          hint={activeFilterCount > 0 ? `${activeFilterCount} filter(s) applied` : 'No filters'}
          icon={<Layers className="h-4 w-4" />}
        />
        <StatCard label="Unique users" value={facets.uniqueActors} icon={<Monitor className="h-4 w-4" />} />
        <StatCard
          label="Failed / denied" value={failureCount}
          tone={failureCount > 0 ? 'warning' : 'default'}
          hint={failureCount > 0 ? 'Click to filter' : undefined}
          icon={<AlertCircle className="h-4 w-4" />}
        />
        <StatCard
          label="Critical actions" value={criticalCount}
          tone={criticalCount > 0 ? 'critical' : 'default'}
          icon={<ShieldAlert className="h-4 w-4" />}
        />
        <StatCard
          label="Page views" value={facets.byCategory.read ?? 0}
          hint="Routine navigation" icon={<Rows3 className="h-4 w-4" />}
        />
      </div>

      <Card>
        <CardHeader className="space-y-3 pb-3">
          <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-start">
            <div>
              <CardTitle className="text-lg font-bold">Activity &amp; Audit Log</CardTitle>
              <CardDescription className="text-xs">
                Append-only record of user actions. Administrator access only.
                {lastUpdated && (
                  <span className="ml-1 text-muted-foreground">
                    Updated {lastUpdated.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}.
                  </span>
                )}
              </CardDescription>
            </div>

            {/* ── Toolbar ─────────────────────────────────────────────── */}
            <div className="flex flex-wrap items-center gap-1.5">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline" size="icon" className="h-9 w-9"
                      onClick={refresh} disabled={isLoading}
                      aria-label="Refresh the audit log"
                    >
                      <RefreshCw className={cn('h-4 w-4', (isLoading || isRefreshing) && 'animate-spin')} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Refresh</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant={liveTail ? 'default' : 'outline'}
                      size="sm" className="h-9 gap-1.5 text-xs"
                      onClick={() => setLiveTail(!liveTail)}
                      aria-pressed={liveTail}
                    >
                      <Radio className={cn('h-3.5 w-3.5', liveTail && 'animate-pulse')} />
                      Live
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {liveTail ? 'Stop auto-refresh' : 'Auto-refresh every 15 seconds'}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>

              {/* Column visibility */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-9 gap-1.5 text-xs">
                    <Columns3 className="h-3.5 w-3.5" />
                    Columns
                    <Badge variant="secondary" className="h-5 px-1.5 text-[10px] tabular-nums">
                      {activeColumns.length}
                    </Badge>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuLabel className="text-xs">Visible columns</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {COLUMNS.map((column) => (
                    <DropdownMenuCheckboxItem
                      key={column.id}
                      checked={visibleColumns.has(column.id)}
                      onCheckedChange={() => toggleColumn(column.id)}
                      onSelect={(e) => e.preventDefault()}
                      className="text-xs"
                    >
                      {column.label}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Density */}
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline" size="icon" className="h-9 w-9"
                      onClick={() => changeDensity(density === 'compact' ? 'comfortable' : 'compact')}
                      aria-label={`Switch to ${density === 'compact' ? 'comfortable' : 'compact'} row height`}
                    >
                      <Rows3 className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Row height: {density}</TooltipContent>
                </Tooltip>
              </TooltipProvider>

              {/* Export & print */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-9 gap-1.5 text-xs" disabled={isExporting}>
                    <Download className="h-3.5 w-3.5" />
                    {isExporting ? (exportProgress ?? 'Working…') : 'Export'}
                    <ChevronDown className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64">
                  <DropdownMenuLabel className="text-xs">
                    Covers all {facets.total.toLocaleString('en-IN')} filtered records
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => void handleExport('xlsx')} className="gap-2 text-xs">
                    <FileSpreadsheet className="h-4 w-4 text-green-600" />
                    <span>
                      Excel (.xlsx)
                      <span className="block text-[10px] text-muted-foreground">
                        Entries + one row per changed field
                      </span>
                    </span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => void handleExport('csv')} className="gap-2 text-xs">
                    <FileText className="h-4 w-4 text-blue-600" />
                    <span>
                      CSV
                      <span className="block text-[10px] text-muted-foreground">Flat, one row per entry</span>
                    </span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => void handleExport('json')} className="gap-2 text-xs">
                    <Braces className="h-4 w-4 text-amber-600" />
                    <span>
                      JSON
                      <span className="block text-[10px] text-muted-foreground">
                        Lossless, includes integrity hashes
                      </span>
                    </span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-xs">Print / PDF</DropdownMenuLabel>
                  <div className="space-y-1.5 px-2 py-1.5">
                    <label className="flex items-center gap-2 text-xs">
                      <Switch
                        checked={printIncludeChanges}
                        onCheckedChange={setPrintIncludeChanges}
                        aria-label="Include field changes in the printout"
                      />
                      Include field changes
                    </label>
                    <label className="flex items-center gap-2 text-xs">
                      <Switch
                        checked={printIncludeContext}
                        onCheckedChange={setPrintIncludeContext}
                        aria-label="Include device and context detail in the printout"
                      />
                      Include device &amp; context
                    </label>
                  </div>
                  <DropdownMenuItem onClick={() => void handlePrint()} className="gap-2 text-xs">
                    <Printer className="h-4 w-4" />
                    <span>
                      Print full report
                      <span className="block text-[10px] text-muted-foreground">
                        Use “Save as PDF” in the dialog
                      </span>
                    </span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* ── Filters ───────────────────────────────────────────────── */}
          <div className="flex flex-wrap items-center gap-1.5">
            <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search user, action, target, IP…"
                className="h-9 pl-9 pr-8 text-xs"
                aria-label="Search the audit log"
              />
              {searchInput && (
                <Button
                  variant="ghost" size="icon"
                  className="absolute right-0.5 top-1/2 h-8 w-8 -translate-y-1/2"
                  onClick={() => setSearchInput('')}
                  aria-label="Clear search"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>

            {/* Date range */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 gap-1.5 text-xs font-normal">
                  <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                  {DATE_PRESETS.find((p) => p.value === filters.datePreset)?.label ?? 'All time'}
                  <ChevronDown className="h-3.5 w-3.5 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-64 p-2">
                <div className="space-y-0.5">
                  {DATE_PRESETS.map((preset) => (
                    <Button
                      key={preset.value}
                      variant={filters.datePreset === preset.value ? 'secondary' : 'ghost'}
                      size="sm"
                      className="h-7 w-full justify-start text-xs"
                      onClick={() => patchFilters({ datePreset: preset.value as DatePreset })}
                    >
                      {preset.label}
                    </Button>
                  ))}
                </div>

                {filters.datePreset === 'custom' && (
                  <>
                    <Separator className="my-2" />
                    {/* datetime-local rather than a date picker: audit
                        investigations routinely need a window of hours, not days
                        ("between 18:00 and 19:00 yesterday"). */}
                    <div className="space-y-2">
                      <div className="space-y-1">
                        <Label htmlFor="audit-from" className="text-[10px] uppercase text-muted-foreground">
                          From
                        </Label>
                        <Input
                          id="audit-from" type="datetime-local" className="h-8 text-xs"
                          value={filters.customFrom}
                          onChange={(e) => patchFilters({ customFrom: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="audit-to" className="text-[10px] uppercase text-muted-foreground">
                          To
                        </Label>
                        <Input
                          id="audit-to" type="datetime-local" className="h-8 text-xs"
                          value={filters.customTo}
                          onChange={(e) => patchFilters({ customTo: e.target.value })}
                        />
                      </div>
                    </div>
                  </>
                )}
              </PopoverContent>
            </Popover>

            <AuditFacetFilter
              label="User" options={actorOptions} selected={filters.actors}
              onChange={(actors) => patchFilters({ actors })}
              searchable width="w-[130px]"
            />
            <AuditFacetFilter
              label="Action" options={actionOptions} selected={filters.actions}
              onChange={(actions) => patchFilters({ actions })}
              searchable width="w-[130px]"
            />
            <AuditFacetFilter
              label="Module" options={moduleOptions} selected={filters.modules}
              onChange={(modules) => patchFilters({ modules })}
              searchable width="w-[130px]"
              icon={<Filter className="h-3.5 w-3.5 text-muted-foreground" />}
            />
            <AuditFacetFilter
              label="Severity" options={severityOptions}
              selected={filters.severities}
              onChange={(severities) => patchFilters({ severities: severities as AuditSeverity[] })}
              width="w-[120px]"
            />
            <AuditFacetFilter
              label="Category" options={categoryOptions}
              selected={filters.categories}
              onChange={(categories) => patchFilters({ categories: categories as ActionCategory[] })}
              width="w-[125px]"
            />
            <AuditFacetFilter
              label="Outcome" options={outcomeOptions}
              selected={filters.outcomes}
              onChange={(outcomes) => patchFilters({ outcomes: outcomes as AuditOutcome[] })}
              width="w-[125px]"
            />

            <Button
              variant={filters.hasSnapshot === true ? 'default' : 'outline'}
              size="sm" className="h-9 gap-1.5 text-xs"
              onClick={() => patchFilters({ hasSnapshot: filters.hasSnapshot === true ? null : true })}
              aria-pressed={filters.hasSnapshot === true}
            >
              <Camera className="h-3.5 w-3.5" />
              Snapshot
            </Button>

            {activeFilterCount > 0 && (
              <Button
                variant="ghost" size="sm" className="h-9 gap-1.5 text-xs"
                onClick={resetFilters}
              >
                <X className="h-3.5 w-3.5" />
                Clear all ({activeFilterCount})
              </Button>
            )}
          </div>

          {/* Pinned-filter chips for the narrow filters, which have no dropdown */}
          {(filters.sessionId || filters.entityId || filters.changedField) && (
            <div className="flex flex-wrap items-center gap-1.5">
              {filters.sessionId && (
                <Badge variant="secondary" className="gap-1 text-[10px] font-normal">
                  Session: <span className="font-mono">{filters.sessionId.slice(0, 8)}…</span>
                  <button
                    type="button" onClick={() => patchFilters({ sessionId: '' })}
                    aria-label="Remove session filter"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              )}
              {filters.entityId && (
                <Badge variant="secondary" className="gap-1 text-[10px] font-normal">
                  Entity: <span className="font-mono">{filters.entityType}/{filters.entityId}</span>
                  <button
                    type="button" onClick={() => patchFilters({ entityType: '', entityId: '' })}
                    aria-label="Remove entity filter"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              )}
              {filters.changedField && (
                <Badge variant="secondary" className="gap-1 text-[10px] font-normal">
                  Field: <span className="font-mono">{filters.changedField}</span>
                  <button
                    type="button" onClick={() => patchFilters({ changedField: '' })}
                    aria-label="Remove changed-field filter"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              )}
            </div>
          )}
        </CardHeader>

        <CardContent className="p-0">
          {error ? (
            <div className="flex flex-col items-center gap-2 py-16 text-center">
              <AlertCircle className="h-6 w-6 text-destructive" aria-hidden="true" />
              <p className="text-sm font-medium">{error}</p>
              <Button variant="outline" size="sm" onClick={refresh}>Try again</Button>
            </div>
          ) : isLoading ? (
            <div className="space-y-2 p-4" aria-busy="true" aria-label="Loading audit log">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableHead className="w-[32px]" />
                      {activeColumns.map((column) => {
                        const isSorted = column.sortKey && filters.sortBy === column.sortKey;
                        return (
                          <TableHead key={column.id} className={cn(column.width, 'text-xs')}>
                            {column.sortKey ? (
                              <button
                                type="button"
                                onClick={() => toggleSort(column.sortKey!)}
                                className="flex items-center gap-1 font-medium hover:text-foreground"
                                aria-sort={
                                  isSorted
                                    ? filters.sortDir === 'asc' ? 'ascending' : 'descending'
                                    : 'none'
                                }
                              >
                                {column.label}
                                {isSorted ? (
                                  filters.sortDir === 'asc'
                                    ? <ArrowUp className="h-3 w-3" aria-hidden="true" />
                                    : <ArrowDown className="h-3 w-3" aria-hidden="true" />
                                ) : (
                                  <ArrowDown className="h-3 w-3 opacity-25" aria-hidden="true" />
                                )}
                              </button>
                            ) : (
                              column.label
                            )}
                          </TableHead>
                        );
                      })}
                      <TableHead className="w-[40px] text-xs">Info</TableHead>
                    </TableRow>
                  </TableHeader>

                  <TableBody>
                    {records.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={activeColumns.length + 2}
                          className="py-16 text-center text-sm text-muted-foreground"
                        >
                          {activeFilterCount > 0 ? (
                            <>
                              No records match these filters.
                              <Button variant="link" size="sm" onClick={resetFilters} className="ml-1 h-auto p-0 text-sm">
                                Clear filters
                              </Button>
                            </>
                          ) : (
                            'No audit records yet. Activity will appear here as users work in the system.'
                          )}
                        </TableCell>
                      </TableRow>
                    ) : (
                      records.map((record) => {
                        const isExpanded = expanded.has(record.id);
                        const severity = SEVERITY_STYLES[record.severity];

                        return (
                          <Fragment key={record.id}>
                            <TableRow
                              className={cn(
                                'hover:bg-muted/20',
                                record.outcome !== 'success' && 'bg-red-50/40 dark:bg-red-950/10',
                                record.severity === 'critical' && 'border-l-2 border-l-red-500'
                              )}
                            >
                              <TableCell className={cn(rowPad, 'pl-2 pr-0')}>
                                <Button
                                  variant="ghost" size="icon" className="h-6 w-6"
                                  onClick={() => toggleExpanded(record.id)}
                                  aria-expanded={isExpanded}
                                  aria-label={isExpanded ? 'Collapse row detail' : 'Expand row detail'}
                                >
                                  <ChevronRight
                                    className={cn('h-3.5 w-3.5 transition-transform', isExpanded && 'rotate-90')}
                                  />
                                </Button>
                              </TableCell>

                              {activeColumns.map((column) => (
                                <TableCell key={column.id} className={cn(rowPad, 'text-xs align-top')}>
                                  {column.id === 'timestamp' && (
                                    <span className="whitespace-nowrap font-mono text-[11px]">
                                      {new Date(record.timestamp).toLocaleString('en-IN', {
                                        day: '2-digit', month: '2-digit', year: '2-digit',
                                        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true,
                                      })}
                                    </span>
                                  )}

                                  {column.id === 'user' && (
                                    <button
                                      type="button"
                                      onClick={() => viewActor(record.actorEmail)}
                                      className="block max-w-[160px] text-left hover:underline"
                                      title={`Show everything by ${record.actorEmail}`}
                                    >
                                      <span className="block truncate font-medium">{record.actorName}</span>
                                      <span className="block truncate text-[10px] text-muted-foreground">
                                        {record.actorEmail}
                                      </span>
                                    </button>
                                  )}

                                  {column.id === 'action' && (
                                    <Badge
                                      variant="outline"
                                      className={cn('text-[10px]', CATEGORY_STYLES[record.actionCategory])}
                                    >
                                      {record.action}
                                    </Badge>
                                  )}

                                  {column.id === 'target' && (
                                    <span className="block max-w-[170px] truncate" title={record.target}>
                                      {record.target || '—'}
                                    </span>
                                  )}

                                  {column.id === 'changes' && (
                                    record.changes.length > 0
                                      ? <AuditChangeSummary changes={record.changes} />
                                      : <span className="text-muted-foreground">—</span>
                                  )}

                                  {column.id === 'module' && (
                                    <Badge variant="outline" className="text-[10px]">{record.module}</Badge>
                                  )}

                                  {column.id === 'severity' && (
                                    <Badge variant="outline" className={cn('text-[10px]', severity.badge)}>
                                      {severity.label}
                                    </Badge>
                                  )}

                                  {column.id === 'outcome' && <OutcomeBadge outcome={record.outcome} />}

                                  {column.id === 'ip' && (
                                    <span className="font-mono text-[11px] text-muted-foreground">
                                      {record.ip || '—'}
                                    </span>
                                  )}

                                  {column.id === 'location' && (
                                    <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                                      {record.location && <MapPin className="h-3 w-3 shrink-0" aria-hidden="true" />}
                                      <span className="truncate">{record.location || '—'}</span>
                                    </span>
                                  )}

                                  {column.id === 'device' && (
                                    <span
                                      className="block max-w-[150px] truncate text-[11px] text-muted-foreground"
                                      title={record.userAgent ?? undefined}
                                    >
                                      {record.os ? `${record.os} · ${record.browser ?? '?'}` : '—'}
                                    </span>
                                  )}

                                  {column.id === 'route' && (
                                    <span
                                      className="block max-w-[150px] truncate font-mono text-[10px] text-muted-foreground"
                                      title={record.route ?? undefined}
                                    >
                                      {record.route || '—'}
                                    </span>
                                  )}

                                  {column.id === 'duration' && (
                                    <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                                      {record.durationMs !== null && record.durationMs !== undefined
                                        ? `${record.durationMs} ms`
                                        : '—'}
                                    </span>
                                  )}
                                </TableCell>
                              ))}

                              <TableCell className={cn(rowPad, 'pr-2')}>
                                <span className="flex items-center gap-0.5">
                                  {record.hasSnapshot && (
                                    <Camera
                                      className="h-3 w-3 text-muted-foreground"
                                      aria-label="Visual snapshot available"
                                    />
                                  )}
                                  <Button
                                    variant="ghost" size="icon" className="h-6 w-6"
                                    onClick={() => setDetailRecord(record)}
                                    aria-label="Open full record detail"
                                  >
                                    <Info className="h-3.5 w-3.5 text-muted-foreground" />
                                  </Button>
                                </span>
                              </TableCell>
                            </TableRow>

                            {isExpanded && (
                              <TableRow className="bg-muted/20 hover:bg-muted/20">
                                <TableCell colSpan={activeColumns.length + 2} className="p-3">
                                  <div className="space-y-2">
                                    {record.changes.length > 0 && (
                                      <AuditDiffTable changes={record.changes} />
                                    )}

                                    <dl className="grid gap-x-4 gap-y-1 text-[11px] sm:grid-cols-2 lg:grid-cols-3">
                                      {record.uiState?.heading && (
                                        <div>
                                          <dt className="inline text-muted-foreground">Screen: </dt>
                                          <dd className="inline">{record.uiState.heading}</dd>
                                        </div>
                                      )}
                                      {record.route && (
                                        <div>
                                          <dt className="inline text-muted-foreground">Route: </dt>
                                          <dd className="inline font-mono">{record.route}</dd>
                                        </div>
                                      )}
                                      {record.location && (
                                        <div>
                                          <dt className="inline text-muted-foreground">Location: </dt>
                                          <dd className="inline">{record.location}</dd>
                                        </div>
                                      )}
                                      {record.actorRoles.length > 0 && (
                                        <div>
                                          <dt className="inline text-muted-foreground">Roles: </dt>
                                          <dd className="inline">{record.actorRoles.join(', ')}</dd>
                                        </div>
                                      )}
                                      {record.branchName && (
                                        <div>
                                          <dt className="inline text-muted-foreground">Branch: </dt>
                                          <dd className="inline">{record.branchName}</dd>
                                        </div>
                                      )}
                                      {record.errorMessage && (
                                        <div className="sm:col-span-2 lg:col-span-3">
                                          <dt className="inline text-muted-foreground">Error: </dt>
                                          <dd className="inline text-red-600 dark:text-red-400">
                                            {record.errorMessage}
                                          </dd>
                                        </div>
                                      )}
                                      {Object.keys(record.details).length > 0 && (
                                        <div className="sm:col-span-2 lg:col-span-3">
                                          <dt className="text-muted-foreground">Details</dt>
                                          <dd>
                                            <pre className="mt-0.5 max-h-32 overflow-auto rounded bg-background p-1.5 text-[10px]">
                                              {JSON.stringify(record.details, null, 2)}
                                            </pre>
                                          </dd>
                                        </div>
                                      )}
                                    </dl>

                                    <Button
                                      variant="outline" size="sm" className="h-7 text-xs"
                                      onClick={() => setDetailRecord(record)}
                                    >
                                      Open full record
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            )}
                          </Fragment>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>

              {/* ── Pagination ──────────────────────────────────────── */}
              {facets.total > 0 && (
                <div className="flex flex-col items-center justify-between gap-2 border-t px-4 py-3 sm:flex-row">
                  <div className="flex items-center gap-3">
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {firstRow.toLocaleString('en-IN')}–{lastRow.toLocaleString('en-IN')} of{' '}
                      {facets.total.toLocaleString('en-IN')}
                    </p>
                    <Select
                      value={String(filters.pageSize)}
                      onValueChange={(value) => patchFilters({ pageSize: Number(value), page: 1 })}
                    >
                      <SelectTrigger className="h-7 w-[110px] text-xs" aria-label="Rows per page">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PAGE_SIZES.map((size) => (
                          <SelectItem key={size} value={String(size)} className="text-xs">
                            {size} / page
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline" size="icon" className="h-7 w-7"
                      disabled={filters.page <= 1}
                      onClick={() => patchFilters({ page: 1 })}
                      aria-label="First page"
                    >
                      <ChevronsLeft className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="outline" size="icon" className="h-7 w-7"
                      disabled={filters.page <= 1}
                      onClick={() => patchFilters({ page: filters.page - 1 })}
                      aria-label="Previous page"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </Button>
                    <span className="px-2 text-xs font-medium tabular-nums">
                      {filters.page} / {totalPages}
                    </span>
                    <Button
                      variant="outline" size="icon" className="h-7 w-7"
                      disabled={filters.page >= totalPages}
                      onClick={() => patchFilters({ page: filters.page + 1 })}
                      aria-label="Next page"
                    >
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="outline" size="icon" className="h-7 w-7"
                      disabled={filters.page >= totalPages}
                      onClick={() => patchFilters({ page: totalPages })}
                      aria-label="Last page"
                    >
                      <ChevronsRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <AuditDetailSheet
        record={detailRecord}
        open={detailRecord !== null}
        onOpenChange={(open) => !open && setDetailRecord(null)}
        onViewSession={viewSession}
        onViewEntity={viewEntity}
        onViewActor={viewActor}
      />

      {/* Portalled to <body> so the print stylesheet can suppress the entire
          application and admit only this subtree. */}
      {printData !== null &&
        typeof document !== 'undefined' &&
        createPortal(
          <div className="audit-print-portal">
            <AuditPrintView
              records={printData}
              filters={filterSummary}
              totalMatching={facets.total}
              printedBy={printedBy}
              includeChanges={printIncludeChanges}
              includeContext={printIncludeContext}
              onAfterPrint={() => setPrintData(null)}
            />
          </div>,
          document.body
        )}
    </div>
  );
}
