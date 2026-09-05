'use client';

import { useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabaseClient } from '@/integrations/supabase/client';

/**
 * Shared GST liability + settlement computation.
 *
 * Both the GST → GSTR-3B view (ComplianceModule) and the Statutory & Taxes
 * payable form (ManagePayables) need the SAME figures — net GST payable per
 * month, how much is already paid, and the CGST/SGST/IGST split — so the user
 * never keys these in by hand. Centralising the queries + math here guarantees
 * the two screens can't drift apart.
 *
 * Source of truth:
 *   - Output GST  = receivables.gst_amount (forward-charge only; RCM excluded;
 *                   cancelled invoices excluded).
 *   - ITC         = payables.gst_amount (rejected payables excluded).
 *   - GST paid    = payables under 'Statutory & Taxes' tagged "GST Period: YYYY-MM".
 */

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

const periodKeyOf = (createdAt: string) => {
  const d = new Date(createdAt);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const periodLabelOf = (key: string) => {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { year: 'numeric', month: 'long' });
};

const paymentPeriodOf = (p: any): string | null => {
  const m = typeof p?.notes === 'string' ? p.notes.match(/GST Period:\s*(\d{4}-\d{2})/) : null;
  return m ? m[1] : null;
};

export interface PeriodLiability {
  output: number;
  /** ITC actually applied to the net (equals computedItc unless overridden). */
  itc: number;
  /** ITC auto-derived from purchases, before any override. */
  computedItc: number;
  net: number;
  paid: number;
  remaining: number;
  cgst: number;
  sgst: number;
  igst: number;
  dueDate: string; // YYYY-MM-DD, 20th of the following month
}

export function useGstLiability(enabled = true) {
  const { data: outward = [] } = useQuery({
    queryKey: ['gst-liability', 'outward'],
    queryFn: async () => {
      const { data, error } = await supabaseClient
        .from('receivables')
        // gst_type ('cgst_sgst' | 'igst' | 'exempt') is persisted at invoice
        // creation, so the CGST/SGST/IGST split is EXACT per invoice — never
        // assumed. notes is a fallback for legacy rows lacking gst_type.
        .select('gst_amount, created_at, gst_treatment, status, gst_type, notes')
        .or('gst_amount.gt.0,gst_amount.lt.0,gst_treatment.eq.rcm')
        .neq('status', 'cancelled');
      if (error) { console.warn('useGstLiability outward:', error.message); return []; }
      return data ?? [];
    },
    enabled,
  });

  const { data: inward = [] } = useQuery({
    queryKey: ['gst-liability', 'inward'],
    queryFn: async () => {
      const { data, error } = await supabaseClient
        .from('payables')
        .select('gst_amount, created_at, status')
        .not('gst_amount', 'is', null)
        .gt('gst_amount', 0)
        .neq('status', 'rejected');
      if (error) { console.warn('useGstLiability inward:', error.message); return []; }
      return data ?? [];
    },
    enabled,
  });

  const { data: payments = [] } = useQuery({
    queryKey: ['compliance', 'gst-payments'],
    queryFn: async () => {
      const { data, error } = await supabaseClient
        .from('payables')
        .select('amount, total_amount, notes, status, created_at')
        .eq('category', 'Statutory & Taxes')
        .ilike('notes', '%Tax Type: GST%')
        .neq('status', 'rejected');
      if (error) { console.warn('useGstLiability payments:', error.message); return []; }
      return data ?? [];
    },
    enabled,
  });

  const forwardOutward = useMemo(
    () => outward.filter((e: any) => (e.gst_treatment || 'forward') !== 'rcm'),
    [outward]
  );

  const periodOptions = useMemo(() => {
    const keys = new Set<string>();
    [...outward, ...inward].forEach((e: any) => { if (e.created_at) keys.add(periodKeyOf(e.created_at)); });
    return Array.from(keys).sort((a, b) => (a < b ? 1 : -1));
  }, [outward, inward]);

  // True for inter-state (IGST) invoices, using the persisted gst_type column;
  // falls back to notes sniffing only for legacy rows that predate the column.
  const isInterState = (e: any): boolean => {
    if (e?.gst_type) return e.gst_type === 'igst';
    return typeof e?.notes === 'string' && e.notes.toLowerCase().includes('igst');
  };

  const computePeriodLiability = useCallback((periodKey: string, itcOverride?: number | null): PeriodLiability => {
    const inKey = (e: any) => periodKeyOf(e.created_at) === periodKey;
    const rows = forwardOutward.filter(inKey);

    // Split OUTPUT tax by each invoice's own place-of-supply type — exact, not
    // assumed. Inter-state → IGST; intra-state → CGST + SGST (equal halves).
    const outputIgst = round2(rows.filter(isInterState).reduce((s: number, e: any) => s + (e.gst_amount || 0), 0));
    const outputIntra = round2(rows.filter((e: any) => !isInterState(e)).reduce((s: number, e: any) => s + (e.gst_amount || 0), 0));
    const output = round2(outputIgst + outputIntra);

    // ITC auto-derived from purchases. An explicit override replaces it for the
    // net calculation (e.g. ineligible/blocked credits under Sec 17(5), reversals,
    // or credit deferred to another period). computedItc is kept for reference.
    const computedItc = round2(inward.filter(inKey).reduce((s: number, e: any) => s + (e.gst_amount || 0), 0));
    const itc = itcOverride != null && Number.isFinite(itcOverride) ? round2(itcOverride) : computedItc;
    const net = round2(output - itc);

    const paid = round2(
      payments.reduce((s: number, p: any) => (paymentPeriodOf(p) === periodKey ? s + (p.amount || p.total_amount || 0) : s), 0)
    );
    const remaining = round2(Math.max(0, net - paid));

    // Apportion the REMAINING liability across heads in the same ratio as the
    // output tax mix (ITC set-off reduces all heads proportionally). This yields
    // the true CGST/SGST/IGST split when a month mixes intra- and inter-state
    // sales, instead of a blanket 50/50.
    let cgst = 0, sgst = 0, igst = 0;
    if (output > 0 && remaining > 0) {
      igst = round2(remaining * (outputIgst / output));
      const intraShare = round2(remaining - igst); // remainder goes to CGST+SGST
      cgst = round2(intraShare / 2);
      sgst = round2(intraShare - cgst); // absorb any 1-paise rounding gap
    }

    // GSTR-3B is due on the 20th of the month after the return period.
    const [y, m] = periodKey.split('-').map(Number);
    const dueMonth = m === 12 ? 1 : m + 1;
    const dueYear = m === 12 ? y + 1 : y;
    const dueDate = `${dueYear}-${String(dueMonth).padStart(2, '0')}-20`;

    return { output, itc, computedItc, net, paid, remaining, cgst, sgst, igst, dueDate };
  }, [forwardOutward, inward, payments]);

  return { periodOptions, computePeriodLiability, periodLabelOf, periodKeyOf };
}
