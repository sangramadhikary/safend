'use client';

import { useState, useEffect } from 'react';
import { supabaseClient } from '@/integrations/supabase/client';
import { useBranch } from '@/contexts/BranchContext';
import { applyBranchFilter } from './branchFilter';
import type { Branch } from '@/contexts/BranchContext';

export interface ChartResult {
  chartType: 'bar' | 'line' | 'area' | 'pie';
  data: any[];
  keys: string[];
  isLoading: boolean;
}

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Returns the last `n` month buckets as { key: 'YYYY-MM', label: 'Mon' }
function lastMonths(n: number) {
  const out: { key: string; label: string }[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label: MONTH_LABELS[d.getMonth()],
    });
  }
  return out;
}

function monthKey(dateStr: string | null): string | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Determine which real-data chart to build from a widget title, then fetch and
 * aggregate the data. All queries go through supabaseClient, which carries the
 * logged-in user's session — so RLS automatically scopes results to the user's
 * branch (sub-branch users only get their own branch's data).
 */
export function useDashboardChartData(title: string): ChartResult {
  const { currentBranch, isMainBranchUser } = useBranch();
  const [result, setResult] = useState<ChartResult>({
    chartType: 'bar',
    data: [],
    keys: [],
    isLoading: true,
  });

  useEffect(() => {
    let active = true;
    setResult((r) => ({ ...r, isLoading: true }));

    const run = async () => {
      try {
        const res = await buildChart(title, currentBranch, isMainBranchUser);
        if (active) setResult({ ...res, isLoading: false });
      } catch (err) {
        console.error('[useDashboardChartData] error for', title, err);
        if (active) setResult({ chartType: 'bar', data: [], keys: [], isLoading: false });
      }
    };

    run();
    return () => {
      active = false;
    };
  }, [title, currentBranch?.id, isMainBranchUser]);

  return result;
}

async function buildChart(
  title: string,
  currentBranch: Branch | null,
  isMainBranchUser: boolean,
): Promise<Omit<ChartResult, 'isLoading'>> {
  const t = title.toLowerCase();
  // Branch-scoped select: HQ/main selected = all branches; otherwise filter to the branch.
  const scoped = (table: string, columns: string) =>
    applyBranchFilter(supabaseClient.from(table).select(columns), currentBranch, isMainBranchUser);

  // Revenue by month (receivables)
  if (t.includes('revenue')) {
    const { data } = await scoped('receivables', 'total_amount, amount, created_at');
    const months = lastMonths(5);
    const byMonth: Record<string, number> = {};
    (data || []).forEach((r: any) => {
      const k = monthKey(r.created_at);
      if (k) byMonth[k] = (byMonth[k] || 0) + Number(r.total_amount ?? r.amount ?? 0);
    });
    return {
      chartType: 'bar',
      data: months.map((m) => ({ name: m.label, Revenue: Math.round(byMonth[m.key] || 0) })),
      keys: ['Revenue'],
    };
  }

  // Headcount trend (employees by month of joining, cumulative)
  if (t.includes('headcount')) {
    const { data } = await scoped('employees', 'created_at, status');
    const months = lastMonths(5);
    const cumulative: number[] = [];
    let runningTotal = 0;
    const perMonth: Record<string, number> = {};
    (data || []).forEach((e: any) => {
      const k = monthKey(e.created_at);
      if (k) perMonth[k] = (perMonth[k] || 0) + 1;
    });
    months.forEach((m) => {
      runningTotal += perMonth[m.key] || 0;
      cumulative.push(runningTotal);
    });
    return {
      chartType: 'area',
      data: months.map((m, i) => ({ name: m.label, Employees: cumulative[i] })),
      keys: ['Employees'],
    };
  }

  // Receivables aging (by due date buckets)
  if (t.includes('receivable') || t.includes('aging')) {
    const { data } = await scoped('receivables', 'total_amount, amount, due_date, status')
      .neq('status', 'received');
    const buckets = { '0-30 days': 0, '31-60 days': 0, '61-90 days': 0, '90+ days': 0 };
    const now = Date.now();
    (data || []).forEach((r: any) => {
      const amt = Number(r.total_amount ?? r.amount ?? 0);
      if (!r.due_date) return;
      const ageDays = Math.floor((now - new Date(r.due_date).getTime()) / 86400000);
      if (ageDays <= 30) buckets['0-30 days'] += amt;
      else if (ageDays <= 60) buckets['31-60 days'] += amt;
      else if (ageDays <= 90) buckets['61-90 days'] += amt;
      else buckets['90+ days'] += amt;
    });
    return {
      chartType: 'bar',
      data: Object.entries(buckets).map(([name, Amount]) => ({ name, Amount: Math.round(Amount) })),
      keys: ['Amount'],
    };
  }

  // Cash flow (receivables inflow vs payables outflow by month)
  if (t.includes('cash flow')) {
    const [{ data: recv }, { data: pay }] = await Promise.all([
      scoped('receivables', 'total_amount, amount, created_at'),
      scoped('payables', 'total_amount, amount, created_at'),
    ]);
    const months = lastMonths(5);
    const inflow: Record<string, number> = {};
    const outflow: Record<string, number> = {};
    (recv || []).forEach((r: any) => {
      const k = monthKey(r.created_at);
      if (k) inflow[k] = (inflow[k] || 0) + Number(r.total_amount ?? r.amount ?? 0);
    });
    (pay || []).forEach((p: any) => {
      const k = monthKey(p.created_at);
      if (k) outflow[k] = (outflow[k] || 0) + Number(p.total_amount ?? p.amount ?? 0);
    });
    return {
      chartType: 'area',
      data: months.map((m) => ({
        name: m.label,
        Inflow: Math.round(inflow[m.key] || 0),
        Outflow: Math.round(outflow[m.key] || 0),
      })),
      keys: ['Inflow', 'Outflow'],
    };
  }

  // Expense categories (payables grouped by category)
  if (t.includes('expense') || t.includes('budget')) {
    const { data } = await scoped('payables', 'total_amount, amount, category');
    const byCat: Record<string, number> = {};
    (data || []).forEach((p: any) => {
      const cat = p.category || 'Other';
      byCat[cat] = (byCat[cat] || 0) + Number(p.total_amount ?? p.amount ?? 0);
    });
    return {
      chartType: 'pie',
      data: Object.entries(byCat).map(([name, value]) => ({ name, value: Math.round(value) })),
      keys: [],
    };
  }

  // Post coverage (operational_posts by status)
  if (t.includes('post') && (t.includes('coverage') || t.includes('performance'))) {
    const { data } = await scoped('operational_posts', 'status');
    const byStatus: Record<string, number> = {};
    (data || []).forEach((p: any) => {
      const s = p.status || 'Unknown';
      byStatus[s] = (byStatus[s] || 0) + 1;
    });
    return {
      chartType: 'pie',
      data: Object.entries(byStatus).map(([name, value]) => ({ name, value })),
      keys: [],
    };
  }

  // Incident reports (penalties by month)
  if (t.includes('incident') || t.includes('penalt')) {
    const { data } = await scoped('penalties', 'created_at, violation_date, status');
    const months = lastMonths(4);
    const byMonth: Record<string, number> = {};
    (data || []).forEach((p: any) => {
      const k = monthKey(p.violation_date || p.created_at);
      if (k) byMonth[k] = (byMonth[k] || 0) + 1;
    });
    return {
      chartType: 'bar',
      data: months.map((m) => ({ name: m.label, Incidents: byMonth[m.key] || 0 })),
      keys: ['Incidents'],
    };
  }

  // Attendance rate (attendance by week — approximate from status)
  if (t.includes('attendance')) {
    const { data } = await scoped('attendance', 'status, date');
    const present = (data || []).filter((a: any) => (a.status || '').toLowerCase() === 'present').length;
    const total = (data || []).length || 1;
    const rate = Math.round((present / total) * 1000) / 10;
    return {
      chartType: 'line',
      data: [{ name: 'Current', Rate: rate }],
      keys: ['Rate'],
    };
  }

  // Default: empty
  return { chartType: 'bar', data: [], keys: [] };
}
