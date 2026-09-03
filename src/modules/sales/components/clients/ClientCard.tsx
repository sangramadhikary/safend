'use client';

import React from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Building2,
  Phone,
  ChevronRight,
  MapPin,
  ShieldAlert,
  Users,
  Receipt,
  AlertTriangle,
  CalendarClock,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { UnifiedClient } from '../../hooks/useClientDirectory';
import {
  avatarGradient,
  clientStatusStyle,
  formatINRCompact,
  formatMonthYear,
  formatDate,
  initialsOf,
} from './clientFormat';

interface ClientCardProps {
  client: UnifiedClient;
  onOpen: (client: UnifiedClient) => void;
}

/** One metric cell inside the card body. */
function Metric({
  label,
  value,
  tone,
  icon: Icon,
}: {
  label: string;
  value: string;
  tone?: 'default' | 'danger' | 'success';
  icon?: React.ElementType;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground flex items-center gap-1">
        {Icon && <Icon className="h-3 w-3 shrink-0" />}
        <span className="truncate">{label}</span>
      </p>
      <p
        className={cn(
          'text-sm font-semibold mt-0.5 truncate',
          tone === 'danger' && 'text-red-600 dark:text-red-400',
          tone === 'success' && 'text-emerald-600 dark:text-emerald-400',
        )}
      >
        {value}
      </p>
    </div>
  );
}

export function ClientCard({ client, onOpen }: ClientCardProps) {
  const style = clientStatusStyle(client.status);
  const isRegular = client.type === 'regular';

  return (
    <Card
      role="button"
      tabIndex={0}
      aria-label={`Open ${client.name} client profile`}
      onClick={() => onOpen(client)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen(client);
        }
      }}
      className={cn(
        'group relative cursor-pointer overflow-hidden border-l-4 p-4 transition-all duration-200',
        'hover:shadow-lg hover:-translate-y-0.5 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-red-500',
        style.accent,
      )}
    >
      {/* Identity */}
      <div className="flex items-start gap-3">
        <div
          className={cn(
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-linear-to-br text-sm font-bold text-white shadow-xs',
            avatarGradient(client.key),
          )}
          aria-hidden="true"
        >
          {initialsOf(client.companyName || client.name)}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h4 className="truncate font-semibold leading-snug" title={client.name}>
              {client.name}
            </h4>
            <Badge variant="outline" className={cn('shrink-0 text-[10px]', style.badge)}>
              {client.status}
            </Badge>
          </div>

          <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
            <Building2 className="h-3 w-3 shrink-0" />
            <span className="truncate">
              {client.companyName && client.companyName !== client.name
                ? client.companyName
                : isRegular
                  ? `${client.workOrders.length} work order${client.workOrders.length !== 1 ? 's' : ''}`
                  : `${client.invoices.length} invoice${client.invoices.length !== 1 ? 's' : ''}`}
            </span>
          </p>
        </div>
      </div>

      {/* Attention strip */}
      {(client.isExpiring || client.isExpired || client.outstanding > 0) && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {client.isExpired && (
            <span className="inline-flex items-center gap-1 rounded-md bg-red-50 px-2 py-0.5 text-[10px] font-medium text-red-700 dark:bg-red-900/20 dark:text-red-400">
              <ShieldAlert className="h-3 w-3" />
              Contract expired {Math.abs(client.daysToExpiry ?? 0)}d ago
            </span>
          )}
          {client.isExpiring && (
            <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/20 dark:text-amber-400">
              <CalendarClock className="h-3 w-3" />
              Renews in {client.daysToExpiry}d
            </span>
          )}
          {client.outstanding > 0 && (
            <span className="inline-flex items-center gap-1 rounded-md bg-orange-50 px-2 py-0.5 text-[10px] font-medium text-orange-700 dark:bg-orange-900/20 dark:text-orange-400">
              <AlertTriangle className="h-3 w-3" />
              {formatINRCompact(client.outstanding)} due
            </span>
          )}
        </div>
      )}

      {/* Metrics */}
      <div className="mt-3 grid grid-cols-3 gap-3 border-t pt-3">
        {isRegular ? (
          <>
            <Metric label="Monthly" value={formatINRCompact(client.monthlyValue)} />
            <Metric
              label="Deployment"
              value={`${client.postCount} post${client.postCount !== 1 ? 's' : ''} · ${client.guardCount}`}
              icon={Users}
            />
            <Metric
              label="Outstanding"
              value={formatINRCompact(client.outstanding)}
              tone={client.outstanding > 0 ? 'danger' : 'success'}
            />
          </>
        ) : (
          <>
            <Metric label="Invoices" value={String(client.invoices.length)} icon={Receipt} />
            <Metric label="Billed" value={formatINRCompact(client.lifetimeBilled)} />
            <Metric
              label="Outstanding"
              value={formatINRCompact(client.outstanding)}
              tone={client.outstanding > 0 ? 'danger' : 'success'}
            />
          </>
        )}
      </div>

      {/* Footer */}
      <div className="mt-3 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <div className="flex min-w-0 items-center gap-3">
          {client.contactPhone ? (
            <span className="flex items-center gap-1 truncate">
              <Phone className="h-3 w-3 shrink-0" />
              <span className="truncate">{client.contactPhone}</span>
            </span>
          ) : client.city ? (
            <span className="flex items-center gap-1 truncate">
              <MapPin className="h-3 w-3 shrink-0" />
              <span className="truncate">{client.city}</span>
            </span>
          ) : null}
          <span className="whitespace-nowrap">
            {isRegular ? `Since ${formatMonthYear(client.since)}` : `Last ${formatDate(client.lastActivity)}`}
          </span>
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5 group-hover:text-safend-red" />
      </div>
    </Card>
  );
}
