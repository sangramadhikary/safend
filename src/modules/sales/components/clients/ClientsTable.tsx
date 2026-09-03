'use client';

import React from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChevronRight, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { UnifiedClient } from '../../hooks/useClientDirectory';
import {
  avatarGradient,
  clientStatusStyle,
  formatDate,
  formatINR,
  formatMonthYear,
  initialsOf,
} from './clientFormat';

interface ClientsTableProps {
  clients: UnifiedClient[];
  variant: 'regular' | 'occasional';
  onOpen: (client: UnifiedClient) => void;
}

export function ClientsTable({ clients, variant, onOpen }: ClientsTableProps) {
  const isRegular = variant === 'regular';

  return (
    <div className="rounded-md border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-[240px]">Client</TableHead>
            <TableHead>Customer ID</TableHead>
            <TableHead>Status</TableHead>
            {isRegular ? (
              <>
                <TableHead className="text-right">Monthly Value</TableHead>
                <TableHead className="text-right">Deployment</TableHead>
                <TableHead>Contract End</TableHead>
              </>
            ) : (
              <>
                <TableHead className="text-right">Invoices</TableHead>
                <TableHead className="text-right">Total Billed</TableHead>
                <TableHead>Last Invoice</TableHead>
              </>
            )}
            <TableHead className="text-right">Outstanding</TableHead>
            <TableHead className="w-[60px]" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {clients.map((client) => {
            const style = clientStatusStyle(client.status);
            return (
              <TableRow
                key={client.key}
                className="cursor-pointer"
                onClick={() => onOpen(client)}
              >
                <TableCell>
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-linear-to-br text-[11px] font-bold text-white',
                        avatarGradient(client.key),
                      )}
                      aria-hidden="true"
                    >
                      {initialsOf(client.companyName || client.name)}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-medium">{client.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {client.contactPerson || client.city || client.companyName || '—'}
                        {isRegular && client.since ? ` · since ${formatMonthYear(client.since)}` : ''}
                      </p>
                    </div>
                  </div>
                </TableCell>

                <TableCell>
                  {client.customerId ? (
                    <span className="font-mono text-xs">{client.customerId}</span>
                  ) : (
                    <span
                      className="text-xs text-muted-foreground"
                      title="This client predates Customer IDs — run the customer backfill to assign one"
                    >
                      Not assigned
                    </span>
                  )}
                </TableCell>

                <TableCell>
                  <div className="flex flex-col items-start gap-1">
                    <Badge variant="outline" className={cn('text-[10px]', style.badge)}>
                      {client.status}
                    </Badge>
                    {(client.isExpiring || client.isExpired) && (
                      <span className="text-[10px] font-medium text-amber-600 dark:text-amber-400">
                        {client.isExpired ? 'Expired' : `${client.daysToExpiry}d to renew`}
                      </span>
                    )}
                  </div>
                </TableCell>

                {isRegular ? (
                  <>
                    <TableCell className="text-right font-medium">
                      {formatINR(client.monthlyValue)}
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="inline-flex items-center gap-1 text-sm">
                        <Users className="h-3 w-3 text-muted-foreground" />
                        {client.guardCount}
                        <span className="text-xs text-muted-foreground">
                          / {client.postCount} post{client.postCount !== 1 ? 's' : ''}
                        </span>
                      </span>
                    </TableCell>
                    <TableCell className="text-sm">{formatDate(client.contractEnd)}</TableCell>
                  </>
                ) : (
                  <>
                    <TableCell className="text-right">{client.invoices.length}</TableCell>
                    <TableCell className="text-right font-medium">
                      {formatINR(client.lifetimeBilled)}
                    </TableCell>
                    <TableCell className="text-sm">{formatDate(client.lastActivity)}</TableCell>
                  </>
                )}

                <TableCell className="text-right">
                  <span
                    className={cn(
                      'font-medium',
                      client.outstanding > 0
                        ? 'text-red-600 dark:text-red-400'
                        : 'text-muted-foreground',
                    )}
                  >
                    {formatINR(client.outstanding)}
                  </span>
                </TableCell>

                <TableCell>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Open ${client.name}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpen(client);
                    }}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
