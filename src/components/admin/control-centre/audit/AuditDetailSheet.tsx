'use client';

/**
 * Full record view for a single audit entry.
 *
 * The old UI exposed one thing beyond the table columns: a hover tooltip printing
 * the raw `details` JSON. Everything else the row contained — the user agent, the
 * request correlation ids, the entity addressing — was either stored and never
 * displayed, or displayed truncated with no way to see the full value.
 *
 * This panel shows the entire record, grouped so it can be read at whatever depth
 * the reviewer needs:
 *
 *   Summary        who, what, when, outcome — the sentence version.
 *   Changes        the field-level diff, which is the substance of most reviews.
 *   Screen         the UI snapshot: structured state, plus the image if captured.
 *   Context        route, session, request, branch, timing.
 *   Device         IP, resolved location, OS, browser, form factor, viewport.
 *   Raw            the complete JSON, for export into an incident report.
 *
 * Cross-links let a reviewer pivot from one entry to the whole session, or to the
 * complete history of the entity that was touched — the two follow-up questions
 * that always come next and previously required constructing a new filter by hand.
 */

import { useEffect, useState } from 'react';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  AlertTriangle, Camera, ChevronDown, Clock, Copy, Fingerprint, Globe,
  History, ImageOff, Layers, MapPin, Monitor, Network, Route, ShieldCheck,
  Timer, User as UserIcon,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { SEVERITY_STYLES, CATEGORY_STYLES } from '@/lib/audit/actions';
import { getSnapshotUrl } from '@/utils/auditLog';
import type { AuditRecord } from '@/lib/audit/types';
import { AuditDiffTable } from './AuditDiffTable';
import { cn } from '@/lib/utils';

/** Label/value row used throughout the panel. */
function Field({
  label,
  value,
  mono = false,
  icon,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
  icon?: React.ReactNode;
}) {
  const isEmpty = value === null || value === undefined || value === '';
  return (
    <div className="grid grid-cols-[130px_1fr] items-start gap-2 py-1.5">
      <dt className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
        {icon}
        {label}
      </dt>
      <dd className={cn('min-w-0 wrap-break-word text-xs', mono && 'font-mono text-[11px]')}>
        {isEmpty ? <span className="text-muted-foreground">—</span> : value}
      </dd>
    </div>
  );
}

/** Collapsible section wrapper. */
function Section({
  title,
  icon,
  children,
  defaultOpen = true,
  badge,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  badge?: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex w-full items-center justify-between rounded-md px-1 py-2 text-left hover:bg-muted/50">
        <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide">
          {icon}
          {title}
          {badge}
        </span>
        <ChevronDown
          className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')}
          aria-hidden="true"
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="px-1 pb-3 pt-1">{children}</CollapsibleContent>
    </Collapsible>
  );
}

/**
 * Snapshot image viewer.
 *
 * The URL is fetched lazily, only when the section is opened, and is valid for
 * five minutes. Storing or preloading a long-lived URL would defeat the private
 * bucket: a leaked link would grant anyone access to an image of an employee's
 * screen for as long as it remained valid.
 */
function SnapshotViewer({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'gone'>('loading');

  useEffect(() => {
    let active = true;
    setState('loading');
    void getSnapshotUrl(path).then((resolved) => {
      if (!active) return;
      if (resolved) {
        setUrl(resolved);
        setState('ready');
      } else {
        setState('gone');
      }
    });
    return () => {
      active = false;
    };
  }, [path]);

  if (state === 'loading') return <Skeleton className="h-48 w-full rounded-md" />;

  if (state === 'gone') {
    return (
      <div className="flex flex-col items-center gap-2 rounded-md border border-dashed py-8 text-center">
        <ImageOff className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
        <p className="text-xs text-muted-foreground">
          Snapshot no longer available.
          <br />
          Images are purged 90 days after capture.
        </p>
      </div>
    );
  }

  return (
    <figure className="space-y-1.5">
      {/* A plain <img> is deliberate here rather than next/image: the URL is a
          signed, five-minute link into a private bucket. next/image would proxy
          it through the image optimizer and cache the result, which would
          outlive the signature and leave an unauthenticated copy of an
          employee's screen contents served from the CDN. */}
      <img
        src={url!}
        alt="Screen contents captured at the moment this action was performed"
        className="w-full rounded-md border"
        loading="lazy"
      />
      <figcaption className="text-[10px] text-muted-foreground">
        Rendered from the application DOM at the time of the action. Does not include
        other browser tabs or applications.
      </figcaption>
    </figure>
  );
}

interface AuditDetailSheetProps {
  record: AuditRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pivot to every entry in the same browser session. */
  onViewSession?: (sessionId: string) => void;
  /** Pivot to the full change history of the entity that was touched. */
  onViewEntity?: (entityType: string, entityId: string) => void;
  /** Pivot to every entry by the same actor. */
  onViewActor?: (email: string) => void;
}

export function AuditDetailSheet({
  record,
  open,
  onOpenChange,
  onViewSession,
  onViewEntity,
  onViewActor,
}: AuditDetailSheetProps) {
  const { toast } = useToast();

  if (!record) return null;

  const severity = SEVERITY_STYLES[record.severity];

  const copyJson = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(record, null, 2));
      toast({ title: 'Copied', description: 'Full record copied to clipboard as JSON.' });
    } catch {
      toast({
        title: 'Copy failed',
        description: 'Your browser blocked clipboard access.',
        variant: 'destructive',
      });
    }
  };

  const timestamp = new Date(record.timestamp);

  /**
   * Render the timestamp in the actor's own local time when the offset was
   * recorded. A trail that only shows the reviewer's timezone invites the wrong
   * conclusion about whether something happened during working hours.
   */
  const actorLocalTime =
    record.tzOffsetMinutes !== null && record.tzOffsetMinutes !== undefined
      ? new Date(timestamp.getTime() + (record.tzOffsetMinutes as number) * 60_000)
      : null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-xl"
      >
        <SheetHeader className="space-y-2 border-b p-4 text-left">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="outline" className={cn('text-[10px]', severity.badge)}>
              {severity.label}
            </Badge>
            <Badge
              variant="outline"
              className={cn('text-[10px]', CATEGORY_STYLES[record.actionCategory])}
            >
              {record.actionCategory}
            </Badge>
            <Badge
              variant="outline"
              className={cn(
                'text-[10px]',
                record.outcome === 'success' && 'border-green-300 bg-green-50 text-green-700',
                record.outcome === 'failure' && 'border-red-300 bg-red-50 text-red-700',
                record.outcome === 'denied' && 'border-orange-300 bg-orange-50 text-orange-700'
              )}
            >
              {record.outcome}
            </Badge>
            {record.isImpersonated && (
              <Badge variant="destructive" className="gap-1 text-[10px]">
                <AlertTriangle className="h-2.5 w-2.5" aria-hidden="true" />
                Impersonated
              </Badge>
            )}
          </div>

          <SheetTitle className="text-base leading-snug">
            {record.action}
            <span className="font-normal text-muted-foreground"> · {record.target}</span>
          </SheetTitle>

          <SheetDescription className="text-xs">
            {record.actorName} ({record.actorEmail}) ·{' '}
            {timestamp.toLocaleString('en-IN', {
              day: '2-digit', month: 'short', year: 'numeric',
              hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true,
            })}
          </SheetDescription>

          <div className="flex flex-wrap gap-1.5 pt-1">
            <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs" onClick={copyJson}>
              <Copy className="h-3 w-3" aria-hidden="true" />
              Copy JSON
            </Button>
            {record.sessionId && onViewSession && (
              <Button
                variant="outline" size="sm" className="h-7 gap-1.5 text-xs"
                onClick={() => onViewSession(record.sessionId!)}
              >
                <Layers className="h-3 w-3" aria-hidden="true" />
                This session
              </Button>
            )}
            {record.entityType && record.entityId && onViewEntity && (
              <Button
                variant="outline" size="sm" className="h-7 gap-1.5 text-xs"
                onClick={() => onViewEntity(record.entityType!, record.entityId!)}
              >
                <History className="h-3 w-3" aria-hidden="true" />
                Entity history
              </Button>
            )}
            {onViewActor && (
              <Button
                variant="outline" size="sm" className="h-7 gap-1.5 text-xs"
                onClick={() => onViewActor(record.actorEmail)}
              >
                <UserIcon className="h-3 w-3" aria-hidden="true" />
                This user
              </Button>
            )}
          </div>
        </SheetHeader>

        <ScrollArea className="flex-1">
          <div className="p-4">
            {/* ── Changes ────────────────────────────────────────────────── */}
            <Section
              title="Field changes"
              icon={<Layers className="h-3.5 w-3.5" aria-hidden="true" />}
              badge={
                record.changes.length > 0 ? (
                  <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-[10px]">
                    {record.changes.length}
                  </Badge>
                ) : undefined
              }
            >
              <AuditDiffTable changes={record.changes} />
            </Section>

            <Separator />

            {/* ── Screen ─────────────────────────────────────────────────── */}
            {(record.uiState || record.hasSnapshot) && (
              <>
                <Section
                  title="Screen at time of action"
                  icon={<Camera className="h-3.5 w-3.5" aria-hidden="true" />}
                  defaultOpen={false}
                >
                  <dl className="space-y-0">
                    <Field label="Page title" value={record.uiState?.title} />
                    <Field label="Heading" value={record.uiState?.heading} />
                    <Field label="Active tab" value={record.uiState?.activeTab} />
                    <Field
                      label="Visible rows"
                      value={record.uiState?.visibleRowCount?.toLocaleString('en-IN')}
                    />
                    <Field label="Triggered by" value={record.uiState?.triggerLabel} />
                  </dl>

                  {record.uiState?.activeFilters &&
                    Object.keys(record.uiState.activeFilters).length > 0 && (
                      <div className="mt-2">
                        <p className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                          Active filters
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {Object.entries(record.uiState.activeFilters).map(([k, v]) => (
                            <Badge key={k} variant="outline" className="text-[10px] font-normal">
                              {k}: {v}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                  {record.uiState?.formValues &&
                    Object.keys(record.uiState.formValues).length > 0 && (
                      <div className="mt-3">
                        <p className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                          Form values on screen
                        </p>
                        <div className="overflow-hidden rounded-md border">
                          <table className="w-full text-left text-[11px]">
                            <tbody>
                              {Object.entries(record.uiState.formValues).map(([k, v]) => (
                                <tr key={k} className="border-b last:border-0">
                                  <th
                                    scope="row"
                                    className="w-2/5 bg-muted/40 px-2 py-1 text-left font-medium"
                                  >
                                    {k}
                                  </th>
                                  <td className="px-2 py-1 font-mono break-all">{String(v)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                  {record.hasSnapshot && record.snapshotPath && (
                    <div className="mt-3">
                      <p className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                        Visual snapshot
                      </p>
                      <SnapshotViewer path={record.snapshotPath} />
                    </div>
                  )}
                </Section>
                <Separator />
              </>
            )}

            {/* ── Context ────────────────────────────────────────────────── */}
            <Section
              title="Request context"
              icon={<Route className="h-3.5 w-3.5" aria-hidden="true" />}
              defaultOpen={false}
            >
              <dl className="space-y-0">
                <Field label="Module" value={record.module} />
                <Field
                  label="Entity"
                  value={
                    record.entityType
                      ? `${record.entityType}${record.entityId ? ` / ${record.entityId}` : ''}`
                      : null
                  }
                  mono
                />
                <Field label="Route" value={record.route} mono icon={<Route className="h-3 w-3" />} />
                <Field label="Referrer" value={record.referrer} mono />
                <Field label="Method" value={record.httpMethod} mono />
                <Field label="Status" value={record.statusCode} mono />
                <Field
                  label="Duration"
                  value={record.durationMs !== null && record.durationMs !== undefined
                    ? `${record.durationMs.toLocaleString('en-IN')} ms`
                    : null}
                  icon={<Timer className="h-3 w-3" />}
                />
                <Field label="Branch" value={record.branchName ?? record.branchId} />
                <Field label="Session" value={record.sessionId} mono />
                <Field label="Request ID" value={record.requestId} mono />
                <Field label="Correlation" value={record.correlationId} mono />
                <Field
                  label="Actor roles"
                  value={
                    record.actorRoles.length > 0 ? (
                      <span className="flex flex-wrap gap-1">
                        {record.actorRoles.map((r) => (
                          <Badge key={r} variant="secondary" className="text-[10px]">{r}</Badge>
                        ))}
                      </span>
                    ) : null
                  }
                />
                {record.errorMessage && (
                  <Field
                    label="Error"
                    value={<span className="text-red-600 dark:text-red-400">{record.errorMessage}</span>}
                  />
                )}
              </dl>
            </Section>

            <Separator />

            {/* ── Device ─────────────────────────────────────────────────── */}
            <Section
              title="Device & network"
              icon={<Monitor className="h-3.5 w-3.5" aria-hidden="true" />}
              defaultOpen={false}
            >
              <dl className="space-y-0">
                <Field label="IP address" value={record.ip} mono icon={<Network className="h-3 w-3" />} />
                <Field label="Location" value={record.location} icon={<MapPin className="h-3 w-3" />} />
                <Field label="Operating system" value={record.os} />
                <Field label="Browser" value={record.browser} icon={<Globe className="h-3 w-3" />} />
                <Field label="Form factor" value={record.deviceType} />
                <Field label="Viewport" value={record.viewport} mono />
                <Field
                  label="Recorded (UTC)"
                  value={timestamp.toISOString()}
                  mono
                  icon={<Clock className="h-3 w-3" />}
                />
                {actorLocalTime && (
                  <Field
                    label="Actor local time"
                    value={`${actorLocalTime.toISOString().slice(0, 19).replace('T', ' ')} (UTC${
                      (record.tzOffsetMinutes as number) >= 0 ? '+' : '-'
                    }${String(Math.floor(Math.abs(record.tzOffsetMinutes as number) / 60)).padStart(2, '0')}:${String(
                      Math.abs(record.tzOffsetMinutes as number) % 60
                    ).padStart(2, '0')})`}
                    mono
                  />
                )}
                <Field label="User agent" value={record.userAgent} mono />
                <Field
                  label="Integrity hash"
                  value={record.entryHash}
                  mono
                  icon={<ShieldCheck className="h-3 w-3" />}
                />
                <Field label="Record ID" value={record.id} mono icon={<Fingerprint className="h-3 w-3" />} />
              </dl>
            </Section>

            <Separator />

            {/* ── Raw ────────────────────────────────────────────────────── */}
            <Section
              title="Raw record"
              icon={<Copy className="h-3.5 w-3.5" aria-hidden="true" />}
              defaultOpen={false}
            >
              <pre className="max-h-72 overflow-auto rounded-md bg-muted p-2 text-[10px] leading-relaxed">
                {JSON.stringify(record, null, 2)}
              </pre>
            </Section>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
