'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowLeft, Loader2, Info, Plus, Trash2, EyeOff, Eye } from 'lucide-react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { supabaseClient } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { getNextInvoiceNumber, peekNextInvoiceNumber } from '@/services/invoiceNumberService';
import { resolveGstConfig, INDIAN_STATES, DEFAULT_PLACE_OF_SUPPLY } from '@/lib/tax/gst';

// ── SAC codes (GST classification for security services) ─────────────────────
// Security guard & allied services → 998525 (Private security services)
// Manpower supply (general) → 998513 · Housekeeping → 998533 · Caretaker → 998514
const SERVICE_OPTIONS: { label: string; sac: string; hasRoles?: boolean }[] = [
  { label: 'Unarmed Guards',           sac: '998525' },
  { label: 'Armed Guards',             sac: '998525' },
  { label: 'Supervisors',              sac: '998525' },
  { label: 'Patrol Officers',          sac: '998525' },
  { label: 'PSO (Personal Security)',  sac: '998525' },
  { label: 'Bouncers',                 sac: '998525' },
  { label: 'Event Security',           sac: '998525' },
  { label: 'Manpower Supply',          sac: '998513', hasRoles: true },
  { label: 'Armoured Car Service',     sac: '998523' },
  { label: 'Investigation',            sac: '998521' },
  { label: 'Surveillance / CCTV',      sac: '998522' },
  { label: 'Other',                    sac: '998599' },
];

// Manpower roles grouped by wage category (for display in dropdown)
// Classification per Minimum Wages Act, 1948 / Odisha 2026 notification
// Unskilled ₹472 · Semi-Skilled ₹522 · Skilled ₹572 · Highly Skilled ₹622
const MANPOWER_ROLES_BY_CATEGORY = [
  { category: 'Unskilled',      roles: ['Peon', 'OfficeBoy', 'Labor', 'DeliveryBoy', 'Housekeeping', 'Attendant'] },
  { category: 'Semi-Skilled',   roles: ['Cook', 'Driver', 'Gardner', 'Servant', 'CareTaker', 'BabySitter', 'Pet-CareTaker', 'Pujari', 'OfficeAssistant'] },
  { category: 'Skilled',        roles: ['Plumber', 'Carpenter', 'Electrician', 'Technician', 'Welder', 'Mason', 'Painter', 'Mechanic'] },
  { category: 'Highly Skilled', roles: ['Accountant', 'Supervisor', 'DataEntryOp'] },
] as const;

// Role → SAC override for Manpower Supply sub-roles
// Housekeeping → 998533, Caretaker/Pet-CareTaker/BabySitter → 998514, rest → 998513
const MANPOWER_ROLE_SAC: Record<string, string> = {
  'Housekeeping': '998533',
  'CareTaker':    '998514',
  'Pet-CareTaker':'998514',
  'BabySitter':   '998514',
};

interface ServiceLine {
  id: string;
  serviceType: string;
  customService: string;
  sac: string;
  location: string;
  /** When true, Location/Post is hidden on the printed invoice */
  hideLocation: boolean;
  manpower: string;
  woPricePerMonth: string;
  hideWoPrice: boolean;     // when true, WO Price/Month is hidden on the printed invoice
  daysInMonth: string;
  duties: string;
  manpowerRole: string;
  /** Shift duration shown on the invoice — 8H or 12H */
  shiftType: '8H' | '12H';
  /** When true, shift type label is NOT appended to the service name on the printed invoice */
  hideShiftType: boolean;
}

// Default days = calendar days in the current month
function defaultDays(): string {
  const now = new Date();
  return String(new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate());
}

const newLine = (): ServiceLine => ({
  id: crypto.randomUUID(),
  serviceType: '',
  customService: '',
  sac: '',
  location: '',
  hideLocation: false,
  manpower: '',
  woPricePerMonth: '',
  hideWoPrice: false,
  daysInMonth: defaultDays(),
  duties: '',
  manpowerRole: '',
  shiftType: '8H',
  hideShiftType: false,
});

interface OneTimeInvoiceFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  onBack: () => void;
  /** Pass an existing receivable entry to pre-fill the form for editing */
  editEntry?: any | null;
}

interface StaffUser { id: string; name: string; role: string; }

// Amount = (WO Price/Month ÷ Days) × Duties — same formula as calculations.ts
function lineAmount(l: ServiceLine): number {
  const woPrice = parseFloat(l.woPricePerMonth) || 0;
  const days    = parseFloat(l.daysInMonth) || 30;
  const duties  = parseFloat(l.duties) || 0;
  return (woPrice / days) * duties;
}

export function OneTimeInvoiceForm({ open, onOpenChange, onSuccess, onBack, editEntry }: OneTimeInvoiceFormProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // ── Customer mode ─────────────────────────────────────────────────────────
  const [customerMode, setCustomerMode] = useState<'new' | 'existing'>('new');
  const [selectedWorkOrderId, setSelectedWorkOrderId] = useState('');

  // ── Client & invoice meta ──────────────────────────────────────────────────
  const [clientName,    setClientName]    = useState('');
  const [clientGstin,   setClientGstin]   = useState('');
  const [clientAddress, setClientAddress] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [dueDate,       setDueDate]       = useState('');
  const [paymentStatus, setPaymentStatus] = useState<'due'|'paid'>('due');
  const [invoiceNumInfo, setInvoiceNumInfo] = useState<{ isReused: boolean; reusedFrom?: string } | null>(null);
  const [placeOfSupply, setPlaceOfSupply] = useState(DEFAULT_PLACE_OF_SUPPLY);

  // ── Service period ────────────────────────────────────────────────────────
  // 'month' = "YYYY-MM" (single month picker), 'range' = ISO date range
  const [servicePeriodMode, setServicePeriodMode] = useState<'month' | 'range'>('month');
  const [servicePeriodMonth, setServicePeriodMonth] = useState(''); // YYYY-MM
  const [servicePeriodStart, setServicePeriodStart] = useState(''); // YYYY-MM-DD
  const [servicePeriodEnd,   setServicePeriodEnd]   = useState(''); // YYYY-MM-DD

  // Derive the ISO start/end dates to persist
  const resolvedPeriodStart = servicePeriodMode === 'month' && servicePeriodMonth
    ? `${servicePeriodMonth}-01`
    : servicePeriodStart || null;
  const resolvedPeriodEnd = servicePeriodMode === 'month' && servicePeriodMonth
    ? (() => {
        const [y, m] = servicePeriodMonth.split('-').map(Number);
        return `${servicePeriodMonth}-${new Date(y, m, 0).getDate().toString().padStart(2, '0')}`;
      })()
    : servicePeriodEnd || null;
  const [gstPercent, setGstPercent] = useState('18');
  const [tdsEnabled, setTdsEnabled] = useState(false);
  const [tdsRate,    setTdsRate]    = useState('2');
  const [previousDue, setPreviousDue] = useState('');
  const [outstandingInvoices, setOutstandingInvoices] = useState<{ ref: string; amount: number; due_date: string | null; status: string }[]>([]);

  // ── Service lines ─────────────────────────────────────────────────────────
  const [lines, setLines] = useState<ServiceLine[]>([newLine()]);

  // ── Payment fields ────────────────────────────────────────────────────────
  const [paymentMode,        setPaymentMode]        = useState('Bank Transfer');
  const [receivedBy,         setReceivedBy]         = useState('');
  const [thirdPartyName,     setThirdPartyName]     = useState('');
  const [chequeNumber,       setChequeNumber]       = useState('');
  const [chequeDate,         setChequeDate]         = useState('');
  const [bankAccountId,      setBankAccountId]      = useState('');
  const [transactionNumber,  setTransactionNumber]  = useState('');
  const [transactionDatetime,setTransactionDatetime]= useState('');

  // Auto-generate invoice number on open (new invoices only)
  useEffect(() => {
    if (open && !editEntry && !invoiceNumber) {
      peekNextInvoiceNumber().then(({ number }) => {
        setInvoiceNumber(number);
        setInvoiceNumInfo(null);
      }).catch(() => {});
    }
  }, [open]);

  // Pre-fill from editEntry when editing an existing invoice
  useEffect(() => {
    if (open && editEntry) {
      const notes = editEntry.notes || '';
      const gstinMatch = notes.match(/(?:Client )?GSTIN:\s*([^\s|]+)/);
      const addrMatch  = notes.match(/(?:Client )?(?:Address|Addr):\s*([^|]+)/);
      const tdsMatch   = notes.match(/TDS:\s*([\d.]+)%/);
      const prevMatch  = notes.match(/Previous Due:\s*₹?([\d,]+)/);
      const gstMatch   = notes.match(/GST:\s*([\d.]+)%/);

      setClientName(editEntry.client_name || '');
      setClientGstin(gstinMatch ? gstinMatch[1].trim().toUpperCase() : '');
      setClientAddress(addrMatch ? addrMatch[1].trim() : '');
      setInvoiceNumber(editEntry.reference_number || '');
      setDueDate(editEntry.due_date || '');
      setPaymentStatus(editEntry.status === 'received' ? 'paid' : 'due');
      setGstPercent(gstMatch ? gstMatch[1] : '18');
      setTdsEnabled(!!tdsMatch);
      setTdsRate(tdsMatch ? tdsMatch[1] : '2');
      setPreviousDue(prevMatch ? prevMatch[1].replace(/,/g, '') : '');
      // Restore Place of Supply from proper DB column first, then notes fallback
      const posMatch = notes.match(/Place of Supply:\s*([^|]+)/);
      setPlaceOfSupply(
        editEntry.place_of_supply ||
        (posMatch ? posMatch[1].trim() : DEFAULT_PLACE_OF_SUPPLY)
      );
      // Restore service period
      if (editEntry.service_period_start) {
        const s: string = editEntry.service_period_start;
        const e: string = editEntry.service_period_end || '';
        const monthStr = s.slice(0, 7); // YYYY-MM
        // Check if it covers an entire month
        const [y, mo] = monthStr.split('-').map(Number);
        const lastDay = new Date(y, mo, 0).getDate();
        const isWholeMonth = s === `${monthStr}-01` && (!e || e === `${monthStr}-${lastDay.toString().padStart(2, '0')}`);
        if (isWholeMonth) {
          setServicePeriodMode('month');
          setServicePeriodMonth(monthStr);
          setServicePeriodStart('');
          setServicePeriodEnd('');
        } else {
          setServicePeriodMode('range');
          setServicePeriodMonth('');
          setServicePeriodStart(s);
          setServicePeriodEnd(e);
        }
      }

      // Rebuild service lines from stored line_items
      if (editEntry.line_items && editEntry.line_items.length > 0) {
        setLines(editEntry.line_items.map((li: any) => {
          // Stored service label is e.g. "Manpower Supply — Housekeeping (8-Hour)"
          // or after multiple edits "... (8-Hour) (8-Hour) (8-Hour)".
          // Strip ALL shift-type tokens globally (not just trailing), then parse.
          const rawService: string = li.service || '';
          const withoutShift = rawService
            .replace(/\s*\(12-Hour\)/g, '')
            .replace(/\s*\(8-Hour\)/g, '')
            .trim();
          const shiftType: '8H' | '12H' = li.shiftType === '12H'
            ? '12H'
            : rawService.includes('12-Hour') ? '12H' : '8H';
          const hideShiftType = !!li.hideShiftType;

          // "Manpower Supply — <Role>" → base = "Manpower Supply", role = "<Role>"
          // The dash may be an em dash (—, \u2014) or a regular hyphen.
          const dashIdx = withoutShift.indexOf(' \u2014 ');
          const baseLabel = dashIdx !== -1 ? withoutShift.slice(0, dashIdx).trim() : withoutShift;
          const roleLabel = dashIdx !== -1 ? withoutShift.slice(dashIdx + 3).trim() : '';

          // Match base label against SERVICE_OPTIONS; if unknown treat as custom "Other"
          const knownOption = SERVICE_OPTIONS.find(o => o.label === baseLabel);
          const serviceType = knownOption ? knownOption.label : (baseLabel ? 'Other' : '');
          const customService = serviceType === 'Other' ? baseLabel : '';

          return {
            id: crypto.randomUUID(),
            serviceType,
            customService,
            sac: li.sac || '998525',
            location: li.post || '',
            hideLocation: !!li.hideLocation,
            manpower: String(li.personnel || ''),
            woPricePerMonth: String(li.woPrice || li.monthlyRate || ''),
            hideWoPrice: !!li.hideWoPrice,
            daysInMonth: String(li.days || defaultDays()),
            duties: String(li.duties || ''),
            manpowerRole: roleLabel,
            shiftType,
            hideShiftType,
          };
        }));
      } else {
        setLines([newLine()]);
      }
    }
  }, [open, editEntry]);

  // Reset on close
  useEffect(() => {
    if (!open) {
      setClientName(''); setClientGstin(''); setClientAddress('');
      setInvoiceNumber(''); setDueDate('');
      setPaymentStatus('due'); setGstPercent('18');
      setTdsEnabled(false); setTdsRate('2'); setPreviousDue('');
      setOutstandingInvoices([]);
      setCustomerMode('new'); setSelectedWorkOrderId('');
      setPlaceOfSupply(DEFAULT_PLACE_OF_SUPPLY);
      setServicePeriodMode('month'); setServicePeriodMonth('');
      setServicePeriodStart(''); setServicePeriodEnd('');
      setLines([newLine()]);
      setPaymentMode('Bank Transfer'); setReceivedBy(''); setThirdPartyName('');
      setChequeNumber(''); setChequeDate(''); setBankAccountId('');
      setTransactionNumber(''); setTransactionDatetime('');
    }
  }, [open]);

  // Maps operational_post service_instances keys → SERVICE_OPTIONS labels
  const INSTANCE_KEY_TO_SERVICE: Record<string, string> = {
    unarmedGuards:    'Unarmed Guards',
    armedGuards:      'Armed Guards',
    supervisors:      'Supervisors',
    patrolOfficers:   'Patrol Officers',
    pso:              'PSO (Personal Security)',
    personalSecurity: 'PSO (Personal Security)',
    bouncers:         'Bouncers',
    eventSecurity:    'Event Security',
    manpower:         'Manpower Supply',
  };

  // Active work orders → populate Existing Customer picker
  const { data: activeWorkOrders = [] } = useQuery<any[]>({
    queryKey: ['work_orders_for_invoice'],
    queryFn: async () => {
      // Fetch work orders
      const { data: woData, error: woError } = await supabaseClient
        .from('work_orders')
        .select('id, work_order_id, description, total_amount, status')
        .not('status', 'eq', 'cancelled')
        .order('created_at', { ascending: false });
      if (woError) return [];

      const workOrderIds = (woData ?? []).map((r: any) => r.id);

      // Fetch all operational posts for these work orders in one query
      let postsMap: Record<string, any[]> = {};
      if (workOrderIds.length > 0) {
        const { data: postsData } = await supabaseClient
          .from('operational_posts')
          .select('id, work_order_id, post_name, post_code, location, total_guards, shift_type, service_instances')
          .in('work_order_id', workOrderIds)
          .eq('status', 'active');
        for (const p of (postsData ?? [])) {
          if (!postsMap[p.work_order_id]) postsMap[p.work_order_id] = [];
          postsMap[p.work_order_id].push(p);
        }
      }

      return (woData ?? []).map((row: any) => {
        let desc: any = {};
        try { desc = JSON.parse(row.description || '{}'); } catch {}
        const posts = postsMap[row.id] || [];

        // Post names for the picker.
        //
        // operational_posts only exists once a work order has been synced into
        // Operations, which is the minority of rows — so relying on it alone
        // leaves most work orders with no post label, and sibling work orders
        // for the same client become impossible to tell apart. The work order's
        // own description JSON always carries the posts it was raised for, so
        // fall back to that.
        const fromOpPosts = posts.map((p: any) => p.post_name).filter(Boolean);
        const fromLocations = Array.isArray(desc.locations)
          ? desc.locations.map((l: any) => l?.name).filter(Boolean)
          : [];
        const fromDescPosts = Array.isArray(desc.posts)
          ? desc.posts.map((p: any) => p?.postName || p?.name).filter(Boolean)
          : [];
        const postNames: string[] = fromOpPosts.length ? fromOpPosts
          : fromLocations.length ? fromLocations
          : fromDescPosts;

        const guardsFromOpPosts = posts.reduce((s: number, p: any) => s + (p.total_guards || 0), 0);
        const guardsFromDesc = Array.isArray(desc.locations)
          ? desc.locations.reduce((s: number, l: any) => s + (Number(l?.guards) || 0), 0)
          : Array.isArray(desc.posts)
            ? desc.posts.reduce((s: number, p: any) => s + (Number(p?.totalGuards ?? p?.guards) || 0), 0)
            : 0;
        const totalGuards = guardsFromOpPosts || guardsFromDesc;

        return {
          id: row.id,
          workOrderId: row.work_order_id,
          status: row.status,
          clientName: desc.clientName || desc.companyName || '',
          clientGst: desc.clientGst || '',
          address: [desc.address, desc.city, desc.state, desc.pincode].filter(Boolean).join(', '),
          totalAmount: row.total_amount,
          posts, // operational posts with post_name, service_instances, etc.
          // Raw description fallbacks, used when no operational_posts exist
          descLocations: Array.isArray(desc.locations) ? desc.locations : [],
          descPerPostServiceInstances: desc.perPostServiceInstances || {},
          postNames,
          totalGuards,
        };
      }).filter((r: any) => r.clientName);
    },
  });

  // Fill client fields + service lines + fetch outstanding balance when a work order is selected
  const handleSelectWorkOrder = async (woId: string) => {
    setSelectedWorkOrderId(woId);
    const wo = activeWorkOrders.find((w: any) => w.id === woId);
    if (!wo) return;
    setClientName(wo.clientName);
    setClientGstin((wo.clientGst || '').toUpperCase());
    setClientAddress(wo.address || '');

    // Build service lines from the work order's posts.
    //
    // Prefer operational_posts (richer: shift type, per-service instances), but
    // most work orders have never been synced into Operations, so fall back to
    // the posts recorded on the work order itself. Without this fallback picking
    // such a work order silently produced no service lines at all.
    type SourcePost = { name: string; shiftType: '8H' | '12H'; instances: Record<string, any[]>; guards: number };

    const sourcePosts: SourcePost[] = (wo.posts && wo.posts.length > 0)
      ? wo.posts.map((p: any) => ({
          name: p.post_name || '',
          shiftType: p.shift_type === '12H' ? '12H' : '8H',
          instances: p.service_instances || {},
          guards: Number(p.total_guards) || 0,
        }))
      : (wo.descLocations || []).map((loc: any, i: number) => ({
          name: loc?.name || `Post ${i + 1}`,
          shiftType: '8H' as const,
          instances: wo.descPerPostServiceInstances?.[String(i)] || {},
          guards: Number(loc?.guards) || 0,
        }));

    if (sourcePosts.length > 0) {
      const builtLines: ServiceLine[] = [];

      for (const post of sourcePosts) {
        const postName = post.name;
        const shiftType: '8H' | '12H' = post.shiftType;
        const instances: Record<string, any[]> = post.instances;
        const hasInstances = Object.keys(instances).length > 0;
        const linesBefore = builtLines.length;

        if (hasInstances) {
          // One service line per active service type in this post
          for (const [key, instArray] of Object.entries(instances)) {
            if (!Array.isArray(instArray) || instArray.length === 0) continue;
            const serviceLabel = INSTANCE_KEY_TO_SERVICE[key];
            if (!serviceLabel) continue;

            // Sum up manpower across all instances and shifts
            let totalManpower = 0;
            let lineShiftType: '8H' | '12H' = shiftType;
            for (const inst of instArray) {
              lineShiftType = inst.shiftType === '12H' ? '12H' : lineShiftType;
              const s = inst.shifts || {};
              if (s.day?.enabled) totalManpower += s.day.quantity || 0;
              if (s.afternoon?.enabled && lineShiftType === '8H') totalManpower += s.afternoon.quantity || 0;
              if (s.night?.enabled) totalManpower += s.night.quantity || 0;
            }
            if (totalManpower === 0) continue;

            // Derive WO price from rate data if available
            let woPrice = '';
            const firstInst = instArray[0];
            const dayRate = firstInst?.shifts?.day?.rate || 0;
            if (dayRate > 0) {
              // daily rate × working days per month ≈ monthly WO price
              woPrice = String(Math.round(dayRate * 26));
            }

            const opt = SERVICE_OPTIONS.find(o => o.label === serviceLabel);
            builtLines.push({
              id: crypto.randomUUID(),
              serviceType: serviceLabel,
              customService: '',
              sac: opt?.sac ?? '998525',
              location: postName,
              hideLocation: false,
              manpower: String(totalManpower),
              woPricePerMonth: woPrice,
              hideWoPrice: false,
              daysInMonth: defaultDays(),
              duties: String(totalManpower),
              manpowerRole: '',
              shiftType: lineShiftType,
              hideShiftType: false,
            });
          }
        }

        // Fallback: either there were no service instances at all, or every one
        // of them resolved to zero enabled manpower. Emit a generic line so the
        // post is still represented and named on the invoice rather than
        // vanishing without explanation.
        if (builtLines.length === linesBefore) {
          const totalGuards = post.guards;
          builtLines.push({
            id: crypto.randomUUID(),
            serviceType: 'Unarmed Guards',
            customService: '',
            sac: '998525',
            location: postName,
            hideLocation: false,
            manpower: String(totalGuards),
            woPricePerMonth: '',
            hideWoPrice: false,
            daysInMonth: defaultDays(),
            duties: String(totalGuards),
            manpowerRole: '',
            shiftType,
            hideShiftType: false,
          });
        }
      }

      if (builtLines.length > 0) {
        setLines(builtLines);
      }
    }

    // Fetch all unpaid invoices for this client
    setOutstandingInvoices([]);
    setPreviousDue('');
    try {
      const { data, error } = await supabaseClient
        .from('receivables')
        .select('reference_number, total_amount, due_date, status, notes')
        .eq('category', 'Invoices')
        .in('status', ['pending', 'overdue'])
        .or(`work_order_id.eq.${woId},and(work_order_id.is.null,client_name.eq.${wo.clientName})`)
        .order('due_date', { ascending: true });

      if (!error && data && data.length > 0) {
        // Subtract any partial payments recorded in notes ("Amount: ₹X | Balance: ₹Y")
        const unpaid = data.map((r: any) => {
          const balanceMatch = (r.notes || '').match(/Balance:\s*₹?([\d,]+(?:\.\d+)?)/);
          const effectiveAmount = balanceMatch
            ? parseFloat(balanceMatch[1].replace(/,/g, ''))
            : r.total_amount;
          return {
            ref: r.reference_number || '—',
            amount: effectiveAmount,
            due_date: r.due_date,
            status: r.status,
          };
        }).filter(r => r.amount > 0);

        if (unpaid.length > 0) {
          setOutstandingInvoices(unpaid);
        }
      }
    } catch { /* non-critical — user can enter manually */ }
  };

  const { data: bankAccounts = [] } = useQuery<any[]>({
    queryKey: ['bank_accounts_for_invoice'],
    queryFn: async () => {
      const { data, error } = await supabaseClient.from('bank_accounts')
        .select('id, account_name, bank_name, account_number').eq('status', 'active');
      if (error) return []; return data ?? [];
    },
  });

  const { data: staffUsers = [] } = useQuery<StaffUser[]>({
    queryKey: ['staff_users_for_payment'],
    queryFn: async () => {
      const { data, error } = await supabaseClient.from('users')
        .select('id, name, roles').eq('status', 'active');
      if (error) return [];
      return (data ?? []).filter((u: any) => (u.roles || []).some((r: string) => r === 'sales' || r === 'operations'))
        .map((u: any) => ({ id: u.id, name: u.name || 'Unknown', role: (u.roles || []).find((r: string) => r === 'sales' || r === 'operations') || 'staff' }));
    },
  });

  // ── Line helpers ──────────────────────────────────────────────────────────
  const updateLine = (id: string, key: keyof ServiceLine, value: string | boolean) => {
    setLines(prev => prev.map(l => {
      if (l.id !== id) return l;
      const updated = { ...l, [key]: value };
      if (key === 'serviceType') {
        const opt = SERVICE_OPTIONS.find(o => o.label === value);
        updated.sac = opt?.sac ?? '';
        updated.customService = '';
        updated.manpowerRole = '';
      }
      // Override SAC for specific Manpower sub-roles
      if (key === 'manpowerRole' && typeof value === 'string') {
        updated.sac = MANPOWER_ROLE_SAC[value] ?? '998513';
      }
      return updated;
    }));
  };

  const addLine    = () => setLines(prev => [...prev, newLine()]);
  const removeLine = (id: string) => setLines(prev => prev.length > 1 ? prev.filter(l => l.id !== id) : prev);

  // ── Totals ────────────────────────────────────────────────────────────────
  const subTotal    = lines.reduce((s, l) => s + lineAmount(l), 0);
  const gstPct      = parseFloat(gstPercent) || 0;
  const gstAmt      = subTotal * (gstPct / 100);
  const invoiceTotal = Math.round(subTotal + gstAmt);
  const tdsAmt      = tdsEnabled ? subTotal * ((parseFloat(tdsRate) || 0) / 100) : 0;
  const prevDue     = parseFloat(previousDue) || 0;
  const netPayable  = invoiceTotal - tdsAmt + prevDue;

  // ── Save mutation ─────────────────────────────────────────────────────────
  const createInvoice = useMutation({
    mutationFn: async () => {
      if (!clientName.trim() || !invoiceNumber.trim()) throw new Error('Client Name and Invoice Number are required.');
      if (lines.every(l => !l.serviceType)) throw new Error('Add at least one service line.');

      // Allocate the real invoice number atomically at save time (not on form open).
      // The number shown on the form was a preview from peekNextInvoiceNumber.
      // Only allocate for new invoices, not edits.
      let finalInvoiceNumber = invoiceNumber;
      if (!editEntry?.id) {
        const allocated = await getNextInvoiceNumber();
        finalInvoiceNumber = allocated.number;
        setInvoiceNumber(finalInvoiceNumber);
      }

      const status = paymentStatus === 'paid' ? 'received' : 'pending';

      const lineItems = lines.filter(l => l.serviceType).map(l => {
        const baseService = l.serviceType === 'Other' ? l.customService : l.serviceType;
        const service = l.serviceType === 'Manpower Supply' && l.manpowerRole
          ? `Manpower Supply — ${l.manpowerRole}`
          : baseService;
        // Append shift type to service label so it appears on the invoice
        const serviceLabel = l.hideShiftType ? service : (l.shiftType === '12H' ? `${service} (12-Hour)` : `${service} (8-Hour)`);
        const woPrice = parseFloat(l.woPricePerMonth) || 0;
        const days    = parseFloat(l.daysInMonth) || 30;
        const duties  = parseFloat(l.duties) || 0;
        return {
          service: serviceLabel,
          post: l.location,
          sac: l.sac,
          personnel: parseInt(l.manpower) || 0,
          woPrice,
          hideWoPrice: l.hideWoPrice,
          hideLocation: l.hideLocation,
          shiftType: l.shiftType,
          hideShiftType: l.hideShiftType,
          days,
          duties,
          gstRate: gstPct,
          amount: lineAmount(l),
        };
      });

      const serviceLabel = lineItems.length === 1
        ? lineItems[0].service
        : `${lineItems.length} services`;

      const { gstType } = resolveGstConfig(placeOfSupply, gstPct);

      const payload = {
        category: 'Invoices',
        description: `${serviceLabel} | Inv#: ${finalInvoiceNumber}`,
        client_name: clientName.trim(),
        amount: subTotal,
        gst_amount: gstAmt || null,
        total_amount: invoiceTotal,
        due_date: dueDate || null,
        reference_number: finalInvoiceNumber,
        status,
        line_items: lineItems,
        // ── Persist as proper DB columns ──────────────────────────────────
        place_of_supply: placeOfSupply,
        gst_type: gstPct === 0 ? 'exempt' : gstType,
        service_period_start: resolvedPeriodStart,
        service_period_end: resolvedPeriodEnd,
        work_order_id: selectedWorkOrderId || null,
        previous_balance: prevDue > 0 ? prevDue : null,
        notes: [
          `GST: ${gstPercent}%`,
          tdsEnabled ? `TDS: ${tdsRate}%` : '',
          prevDue > 0 ? `Previous Due: ₹${prevDue.toLocaleString('en-IN')}` : '',
          prevDue > 0 && outstandingInvoices.length > 0
            ? `Outstanding: ${outstandingInvoices.map(i => `${i.ref} (₹${i.amount.toLocaleString('en-IN')})`).join(', ')}`
            : '',
          clientGstin ? `GSTIN: ${clientGstin}` : '',
          clientAddress ? `Addr: ${clientAddress}` : '',
        ].filter(Boolean).join(' | '),
      };

      // UPDATE existing invoice
      if (editEntry?.id) {
        const { error } = await supabaseClient.from('receivables').update(payload).eq('id', editEntry.id);
        if (error) throw new Error(error.message);
        return { id: editEntry.id };
      }

      // CREATE new invoice
      const { data: receivable, error } = await supabaseClient.from('receivables').insert(payload).select().single();
      if (error) throw new Error(error.message);

      if (paymentStatus === 'paid' && receivable) {
        const resolvedBy = receivedBy === '__third_party__' ? thirdPartyName || 'Authorized 3rd Person' : receivedBy || null;
        try {
          await supabaseClient.from('receivable_payments').insert({
            receivable_id: receivable.id, amount: invoiceTotal, mode: paymentMode,
            received_by: resolvedBy, cheque_number: chequeNumber || null,
            cheque_date: chequeDate || null, bank_account_id: bankAccountId || null,
            transaction_number: transactionNumber || null,
            transaction_datetime: transactionDatetime || null,
            is_partial: false, balance_amount: 0, created_at: new Date().toISOString(),
          });
        } catch { /* table may not exist */ }
        if (paymentMode === 'Bank Transfer' && bankAccountId) {
          try {
            await supabaseClient.from('bank_transactions').insert({
              account_id: bankAccountId,
              transaction_date: transactionDatetime ? transactionDatetime.split('T')[0] : new Date().toISOString().split('T')[0],
              type: 'credit', amount: invoiceTotal, category: 'client_receipt',
              description: `Receipt: ${serviceLabel} (${clientName})`,
              reference_number: transactionNumber || null, payment_mode: 'neft', party_name: clientName,
            });
          } catch { /* continue */ }
        }
      }
      return receivable;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['receivables'] });
      toast({ title: editEntry ? 'Invoice Updated' : 'Invoice Created', description: paymentStatus === 'paid' ? 'Invoice created and payment recorded.' : editEntry ? 'Invoice updated successfully.' : 'Invoice raised successfully.' });
      onSuccess();
    },
    onError: (error: any) => { toast({ title: 'Error', description: error.message, variant: 'destructive' }); },
  });

  // ── Shared "Received By" dropdown ────────────────────────────────────────
  const ReceivedBySelect = () => (
    <Select value={receivedBy} onValueChange={setReceivedBy}>
      <SelectTrigger><SelectValue placeholder="Select person" /></SelectTrigger>
      <SelectContent>
        {staffUsers.filter(u => u.role === 'sales').length > 0 && (<>
          <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">Sales</div>
          {staffUsers.filter(u => u.role === 'sales').map(u => <SelectItem key={u.id} value={u.name}>{u.name}</SelectItem>)}
        </>)}
        {staffUsers.filter(u => u.role === 'operations').length > 0 && (<>
          <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">Operations</div>
          {staffUsers.filter(u => u.role === 'operations').map(u => <SelectItem key={u.id} value={u.name}>{u.name}</SelectItem>)}
        </>)}
        <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">Other</div>
        <SelectItem value="__third_party__">Authorized 3rd Person</SelectItem>
      </SelectContent>
    </Select>
  );

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[1300px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onBack}><ArrowLeft className="h-4 w-4" /></Button>
            <DialogTitle>{editEntry ? 'Edit Invoice' : 'Raise One-Time Invoice'}</DialogTitle>
          </div>
          <p className="text-sm text-muted-foreground ml-10">Fill in client and service details to create an invoice</p>
        </DialogHeader>

        <div className="space-y-6 py-2">

          {/* ── CUSTOMER TYPE TOGGLE ───────────────────────────────────── */}
          <section>
            <div className="flex gap-2">
              {([
                { v: 'new',      l: 'New Customer',      hint: 'Enter details manually' },
                { v: 'existing', l: 'Existing Customer',  hint: 'Pick from active work orders' },
              ] as const).map(opt => (
                <button
                  key={opt.v}
                  type="button"
                  onClick={() => { setCustomerMode(opt.v); setSelectedWorkOrderId(''); }}
                  className={`flex flex-col items-start px-4 py-3 rounded-lg border text-left transition-all ${
                    customerMode === opt.v
                      ? 'border-black bg-black'
                      : 'border-input hover:border-black/40 hover:bg-muted/40'
                  }`}
                >
                  <span className={`text-sm font-semibold ${customerMode === opt.v ? 'text-white' : ''}`}>{opt.l}</span>
                  <span className={`text-[11px] ${customerMode === opt.v ? 'text-white/70' : 'text-muted-foreground'}`}>{opt.hint}</span>
                </button>
              ))}
            </div>

            {customerMode === 'existing' && (
              <div className="mt-3 space-y-1">
                <Label className="text-xs">Select Active Work Order</Label>
                <Select value={selectedWorkOrderId} onValueChange={handleSelectWorkOrder}>
                  <SelectTrigger>
                    {/* Rendered explicitly rather than via SelectValue: the option
                        body is a multi-line block with chips, which looks cramped
                        when Radix clones it into the trigger. */}
                    {(() => {
                      const sel = activeWorkOrders.find((w: any) => w.id === selectedWorkOrderId);
                      if (!sel) return <span className="text-muted-foreground">Search client / work order…</span>;
                      return (
                        <span className="flex items-center gap-2 truncate text-sm">
                          <span className="font-medium truncate">{sel.clientName}</span>
                          <span className="text-[11px] font-mono text-muted-foreground bg-muted px-1 rounded shrink-0">{sel.workOrderId}</span>
                          {sel.postNames?.length > 0 && (
                            <span className="text-xs text-blue-700 dark:text-blue-300 truncate">
                              {sel.postNames.join(', ')}
                            </span>
                          )}
                        </span>
                      );
                    })()}
                  </SelectTrigger>
                  <SelectContent className="max-h-80">
                    {activeWorkOrders.length === 0 && (
                      <div className="px-3 py-2 text-xs text-muted-foreground">No active work orders found.</div>
                    )}
                    {activeWorkOrders.map((wo: any) => {
                      const postNames: string[] = wo.postNames || [];
                      const totalGuards: number = wo.totalGuards || 0;
                      return (
                        <SelectItem
                          key={wo.id}
                          value={wo.id}
                          className="py-2"
                          // Keeps type-ahead matching on post name as well as client / WO id
                          textValue={`${wo.clientName} ${wo.workOrderId} ${postNames.join(' ')}`}
                        >
                          <div className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-sm">{wo.clientName}</span>
                              <span className="text-[11px] font-mono text-muted-foreground bg-muted px-1 rounded">{wo.workOrderId}</span>
                              {wo.status && (
                                <span className="text-[10px] text-muted-foreground capitalize">
                                  ({String(wo.status).replace(/_/g, ' ')})
                                </span>
                              )}
                            </div>
                            {postNames.length > 0 ? (
                              <div className="flex flex-wrap gap-1 mt-0.5">
                                {postNames.map((name: string, i: number) => (
                                  <span key={i} className="text-[10px] bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 rounded border border-blue-200 dark:border-blue-800">
                                    {name}
                                  </span>
                                ))}
                                {totalGuards > 0 && (
                                  <span className="text-[10px] text-muted-foreground ml-1">· {totalGuards} guards</span>
                                )}
                              </div>
                            ) : (
                              <span className="text-[10px] text-muted-foreground italic mt-0.5">No post recorded</span>
                            )}
                          </div>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
                {selectedWorkOrderId && (() => {
                  const wo = activeWorkOrders.find((w: any) => w.id === selectedWorkOrderId);
                  const postNames: string[] = wo?.postNames || [];
                  return (
                    <div className="text-[11px] text-green-600 dark:text-green-400 flex items-center gap-1.5 flex-wrap">
                      <span>Client details filled ✓</span>
                      {postNames.length > 0 && (
                        <span className="text-[11px] text-blue-600 dark:text-blue-400">
                          · {postNames.length} post{postNames.length > 1 ? 's' : ''} loaded into service lines ✓
                        </span>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}
          </section>

          {/* ── CLIENT DETAILS ─────────────────────────────────────────── */}
          <section className="space-y-3">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Client Details</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Client Name *</Label>
                <Input value={clientName} onChange={e => setClientName(e.target.value)} placeholder="Client name" />
              </div>
              <div className="space-y-1">
                <Label>Client GSTIN</Label>
                <Input value={clientGstin} onChange={e => setClientGstin(e.target.value.toUpperCase())} placeholder="e.g. 21XXXXX1234X1Z5" maxLength={15} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Client Address</Label>
              <Textarea value={clientAddress} onChange={e => setClientAddress(e.target.value)} placeholder="Full address" rows={2} />
            </div>
          </section>

          {/* ── INVOICE META ───────────────────────────────────────────── */}
          <section className="space-y-3">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Invoice Details</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Invoice Number *</Label>
                <Input value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)} placeholder="Auto-generated" className="font-mono" />
                {invoiceNumInfo?.isReused && (
                  <p className="text-xs text-blue-600 flex items-center gap-1 mt-1"><Info className="h-3 w-3" /> Reusing cancelled invoice number</p>
                )}
              </div>
              <div className="space-y-1">
                <Label>Service Period</Label>
                {/* Toggle between single-month and date-range */}
                <div className="flex gap-1 mb-1">
                  {(['month', 'range'] as const).map(m => (
                    <button key={m} type="button"
                      onClick={() => setServicePeriodMode(m)}
                      className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors ${
                        servicePeriodMode === m
                          ? 'bg-black text-white border-black'
                          : 'border-input text-muted-foreground hover:border-black/40'
                      }`}
                    >
                      {m === 'month' ? 'Month' : 'Date Range'}
                    </button>
                  ))}
                </div>
                {servicePeriodMode === 'month' ? (
                  <Input
                    type="month"
                    value={servicePeriodMonth}
                    onChange={e => setServicePeriodMonth(e.target.value)}
                    className="h-9 text-sm"
                  />
                ) : (
                  <div className="flex items-center gap-2">
                    <Input type="date" value={servicePeriodStart} onChange={e => setServicePeriodStart(e.target.value)} className="h-9 text-sm flex-1" />
                    <span className="text-xs text-muted-foreground">–</span>
                    <Input type="date" value={servicePeriodEnd} onChange={e => setServicePeriodEnd(e.target.value)} className="h-9 text-sm flex-1" />
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* ── SERVICE LINES ──────────────────────────────────────────── */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Service Lines</h3>
              <Button type="button" variant="outline" size="sm" onClick={addLine}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Add Service
              </Button>
            </div>

            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[160px]">Service Type</TableHead>
                    <TableHead className="w-[100px]">SAC Code</TableHead>
                    <TableHead className="min-w-[140px]">Location / Post</TableHead>
                    <TableHead className="w-[80px] text-right">Manpower</TableHead>
                    <TableHead className="w-[130px] text-right">WO Price/Month (₹)</TableHead>
                    <TableHead className="w-[70px] text-right">Days</TableHead>
                    <TableHead className="w-[90px] text-right">Duties</TableHead>
                    <TableHead className="w-[120px] text-right">Amount (₹)</TableHead>
                    <TableHead className="w-[40px]" />
                  </TableRow>                </TableHeader>
                <TableBody>
                  {lines.map((line) => (
                    <TableRow key={line.id}>
                      {/* Service Type + shift toggle */}
                      <TableCell>
                        <Select value={line.serviceType} onValueChange={v => updateLine(line.id, 'serviceType', v)}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select service" /></SelectTrigger>
                          <SelectContent>
                            {SERVICE_OPTIONS.map(o => <SelectItem key={o.label} value={o.label}>{o.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        {line.serviceType === 'Other' && (
                          <Input className="mt-1 h-7 text-xs" value={line.customService}
                            onChange={e => updateLine(line.id, 'customService', e.target.value)}
                            placeholder="Service name" />
                        )}
                        {line.serviceType === 'Manpower Supply' && (
                          <Select value={line.manpowerRole} onValueChange={v => updateLine(line.id, 'manpowerRole', v)}>
                            <SelectTrigger className="mt-1 h-7 text-xs"><SelectValue placeholder="Select role" /></SelectTrigger>
                            <SelectContent>
                              {MANPOWER_ROLES_BY_CATEGORY.map(group => (
                                <div key={group.category}>
                                  <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{group.category}</div>
                                  {group.roles.map(role => (
                                    <SelectItem key={role} value={role}>{role}</SelectItem>
                                  ))}
                                </div>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                        {/* 8H / 12H shift toggle — shown for all service types except 'Other' */}
                        {line.serviceType && line.serviceType !== 'Other' && (
                          <div className="flex mt-1.5 rounded-md border border-gray-200 dark:border-gray-700 overflow-hidden w-fit">
                            {(['8H', '12H'] as const).map(sh => (
                              <button
                                key={sh}
                                type="button"
                                onClick={() => updateLine(line.id, 'shiftType', sh)}
                                className={`px-2.5 py-0.5 text-[11px] font-semibold transition-colors ${
                                  line.shiftType === sh && !line.hideShiftType
                                    ? 'bg-safend-red text-white'
                                    : 'bg-transparent text-muted-foreground hover:text-foreground'
                                }`}
                              >
                                {sh}
                              </button>
                            ))}
                            <button
                              type="button"
                              title="Don't show shift type on invoice"
                              onClick={() => updateLine(line.id, 'hideShiftType', !line.hideShiftType)}
                              className={`px-2.5 py-0.5 text-[11px] font-semibold border-l border-gray-200 dark:border-gray-700 transition-colors ${
                                line.hideShiftType
                                  ? 'bg-amber-500 text-white'
                                  : 'bg-transparent text-muted-foreground hover:text-foreground'
                              }`}
                            >
                              No
                            </button>
                          </div>
                        )}
                      </TableCell>
                      {/* SAC */}
                      <TableCell>
                        <Input className="h-8 text-xs font-mono w-24"
                          value={line.sac}
                          onChange={e => updateLine(line.id, 'sac', e.target.value)}
                          placeholder="998525" />
                      </TableCell>
                      {/* Location / Post + visibility toggle */}
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Input className="h-8 text-xs flex-1 min-w-0" value={line.location}
                            onChange={e => updateLine(line.id, 'location', e.target.value)}
                            placeholder="Site / post name" />
                          <button
                            type="button"
                            title={line.hideLocation ? "Hidden on invoice — click to show" : "Visible on invoice — click to hide"}
                            onClick={() => updateLine(line.id, 'hideLocation', !line.hideLocation)}
                            className={`shrink-0 h-7 w-7 flex items-center justify-center rounded border transition-colors ${
                              line.hideLocation
                                ? 'border-amber-400 bg-amber-50 text-amber-600 dark:bg-amber-900/30'
                                : 'border-gray-200 bg-transparent text-muted-foreground hover:text-foreground'
                            }`}
                          >
                            {line.hideLocation
                              ? <EyeOff className="h-3.5 w-3.5" />
                              : <Eye className="h-3.5 w-3.5" />}
                          </button>
                        </div>
                        {line.hideLocation && (
                          <p className="text-[10px] text-amber-600 mt-0.5">Hidden on invoice</p>
                        )}
                      </TableCell>
                      {/* Manpower */}
                      <TableCell>
                        <Input className="h-8 text-xs text-right" type="number" min="0"
                          value={line.manpower}
                          onChange={e => updateLine(line.id, 'manpower', e.target.value)}
                          placeholder="0" />
                      </TableCell>
                      {/* WO Price/Month + visibility toggle */}
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Input
                            className="h-8 text-xs text-right flex-1 min-w-0"
                            type="number" min="0"
                            value={line.woPricePerMonth}
                            onChange={e => updateLine(line.id, 'woPricePerMonth', e.target.value)}
                            placeholder="0"
                          />
                          <button
                            type="button"
                            title={line.hideWoPrice ? "Hidden on invoice — click to show" : "Visible on invoice — click to hide"}
                            onClick={() => updateLine(line.id, 'hideWoPrice', !line.hideWoPrice)}
                            className={`shrink-0 h-7 w-7 flex items-center justify-center rounded border transition-colors ${
                              line.hideWoPrice
                                ? 'border-amber-400 bg-amber-50 text-amber-600 dark:bg-amber-900/30'
                                : 'border-gray-200 bg-transparent text-muted-foreground hover:text-foreground'
                            }`}
                          >
                            {line.hideWoPrice
                              ? <EyeOff className="h-3.5 w-3.5" />
                              : <Eye className="h-3.5 w-3.5" />}
                          </button>
                        </div>
                        {line.hideWoPrice && (
                          <p className="text-[10px] text-amber-600 mt-0.5">Hidden on invoice</p>
                        )}
                      </TableCell>
                      {/* Days */}
                      <TableCell>
                        <Input className="h-8 text-xs text-right w-16" type="number" min="1" max="31"
                          value={line.daysInMonth}
                          onChange={e => updateLine(line.id, 'daysInMonth', e.target.value)} />
                      </TableCell>
                      {/* Duties */}
                      <TableCell>
                        <Input className="h-8 text-xs text-right" type="number" min="0"
                          value={line.duties}
                          onChange={e => updateLine(line.id, 'duties', e.target.value)}
                          placeholder="0" />
                      </TableCell>
                      {/* Amount */}
                      <TableCell className="text-right text-sm font-medium">
                        {lineAmount(line) > 0 ? `₹${lineAmount(line).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '—'}
                      </TableCell>
                      {/* Remove */}
                      <TableCell>
                        <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-red-600"
                          onClick={() => removeLine(line.id)} disabled={lines.length === 1}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Amount = (WO Price/Month ÷ Days) × Duties. Rate/Duty is shown on the invoice.
            </p>
          </section>

          {/* ── GST & TDS ─────────────────────────────────────────────── */}
          <section className="space-y-3">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Tax & Deductions</h3>
            <div className="grid grid-cols-2 gap-6">
              {/* GST */}
              <div className="space-y-3 p-3 rounded-lg border">
                <p className="text-xs font-semibold">GST</p>
                <div className="flex items-center gap-3">
                  <Select value={gstPercent} onValueChange={setGstPercent}>
                    <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">0% (Exempt)</SelectItem>
                      <SelectItem value="5">5%</SelectItem>
                      <SelectItem value="12">12%</SelectItem>
                      <SelectItem value="18">18%</SelectItem>
                      <SelectItem value="28">28%</SelectItem>
                    </SelectContent>
                  </Select>
                  <span className="text-sm text-muted-foreground">
                    = ₹{gstAmt.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                </div>

                {/* Place of Supply — drives IGST vs CGST+SGST */}
                <div className="space-y-1">
                  <Label className="text-xs">Place of Supply</Label>
                  <Select value={placeOfSupply} onValueChange={setPlaceOfSupply}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="max-h-56">
                      {INDIAN_STATES.map(s => (
                        <SelectItem key={s.code} value={s.label}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {gstAmt > 0 && (() => {
                  const { gstType } = resolveGstConfig(placeOfSupply, gstPct);
                  return gstType === 'igst' ? (
                    <p className="text-[11px] text-blue-600 font-medium">
                      Inter-State → IGST {gstPercent}% = ₹{gstAmt.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </p>
                  ) : (
                    <p className="text-[11px] text-green-600 font-medium">
                      Intra-State (Odisha) → SGST ₹{(gstAmt / 2).toLocaleString('en-IN', { minimumFractionDigits: 2 })} + CGST ₹{(gstAmt / 2).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </p>
                  );
                })()}
              </div>

              {/* TDS */}
              <div className="space-y-3 p-3 rounded-lg border">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold">TDS Deduction</p>
                  <div className="flex items-center gap-2">
                    <Switch id="tds-toggle" checked={tdsEnabled} onCheckedChange={setTdsEnabled} />
                    <Label htmlFor="tds-toggle" className="text-xs cursor-pointer">
                      {tdsEnabled ? 'On' : 'Off'}
                    </Label>
                  </div>
                </div>
                {tdsEnabled && (
                  <>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1">
                        <Input className="w-20 h-8 text-xs text-right" type="number" min="0" max="30" step="0.5"
                          value={tdsRate} onChange={e => setTdsRate(e.target.value)} />
                        <span className="text-xs text-muted-foreground">%</span>
                      </div>
                      <span className="text-sm text-muted-foreground">
                        = ₹{tdsAmt.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      TDS u/s 194C @ {tdsRate}% on taxable value. Deducted from net payable, not from invoice total.
                    </p>
                  </>
                )}
                {!tdsEnabled && <p className="text-[11px] text-muted-foreground">Toggle on if client deducts TDS.</p>}
              </div>
            </div>

            {/* Previous Due */}
            <div className="space-y-2 p-3 rounded-lg border">
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <Label className="text-xs font-semibold">Previous Due Amount (₹)</Label>
                  <p className="text-[11px] text-muted-foreground">Outstanding balance carried forward from prior invoices</p>
                </div>
                <Input
                  type="number" min="0"
                  className="w-40 text-right"
                  placeholder="0"
                  value={previousDue}
                  onChange={e => { setPreviousDue(e.target.value); if (!e.target.value) setOutstandingInvoices([]); }}
                />
              </div>

              {/* Auto-fetched breakdown */}
              {outstandingInvoices.length > 0 && (
                <div className="rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 overflow-hidden">
                  <div className="px-3 py-1.5 bg-amber-100 dark:bg-amber-900/30 flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-amber-800 dark:text-amber-200">
                      Outstanding invoices detected — {outstandingInvoices.length} unpaid
                    </span>
                    {(() => {
                      const panelTotal = String(Math.round(outstandingInvoices.reduce((s, r) => s + r.amount, 0)));
                      const alreadyIncluded = previousDue === panelTotal;
                      return (
                        <button
                          type="button"
                          disabled={alreadyIncluded}
                          onClick={() => setPreviousDue(panelTotal)}
                          className={`text-[11px] px-2 py-0.5 rounded font-medium transition-colors ${
                            alreadyIncluded
                              ? 'bg-amber-200/60 text-amber-600 dark:bg-amber-800/40 dark:text-amber-400 cursor-default'
                              : 'bg-white/80 text-amber-800 hover:bg-white dark:bg-amber-800 dark:text-amber-100 dark:hover:bg-amber-700 cursor-pointer'
                          }`}
                        >
                          {alreadyIncluded ? '✓ Included' : 'Include previous balance'}
                        </button>
                      );
                    })()}
                    <span className="text-[11px] font-bold text-amber-900 dark:text-amber-100">
                      ₹{outstandingInvoices.reduce((s, r) => s + r.amount, 0).toLocaleString('en-IN')}
                    </span>
                  </div>
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="border-b border-amber-200 dark:border-amber-800">
                        <th className="text-left px-3 py-1 text-amber-700 dark:text-amber-300 font-semibold">Invoice #</th>
                        <th className="text-center px-3 py-1 text-amber-700 dark:text-amber-300 font-semibold">Due Date</th>
                        <th className="text-center px-3 py-1 text-amber-700 dark:text-amber-300 font-semibold">Status</th>
                        <th className="text-right px-3 py-1 text-amber-700 dark:text-amber-300 font-semibold">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {outstandingInvoices.map((inv, i) => (
                        <tr key={i} className="border-b border-amber-100 dark:border-amber-900/50 last:border-0">
                          <td className="px-3 py-1 font-mono font-medium text-amber-900 dark:text-amber-100">{inv.ref}</td>
                          <td className="px-3 py-1 text-center text-amber-700 dark:text-amber-300">
                            {inv.due_date ? new Date(inv.due_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                          </td>
                          <td className="px-3 py-1 text-center">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${inv.status === 'overdue' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-200'}`}>
                              {inv.status}
                            </span>
                          </td>
                          <td className="px-3 py-1 text-right font-semibold text-amber-900 dark:text-amber-100">₹{inv.amount.toLocaleString('en-IN')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Totals summary */}
            <div className="rounded-lg border p-4 bg-muted/30 space-y-1.5 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Sub-total (Taxable)</span><span>₹{subTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">GST ({gstPercent}%)</span><span>₹{gstAmt.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div>
              <div className="flex justify-between font-semibold border-t pt-1.5"><span>Invoice Total</span><span>₹{invoiceTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div>
              {tdsEnabled && (
                <div className="flex justify-between text-amber-700 dark:text-amber-400"><span>Less: TDS ({tdsRate}%)</span><span>− ₹{tdsAmt.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div>
              )}
              {prevDue > 0 && (
                <div className="flex justify-between text-red-600 dark:text-red-400"><span>Add: Previous Due</span><span>+ ₹{prevDue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div>
              )}
              {(tdsEnabled || prevDue > 0) && (
                <div className="flex justify-between font-bold text-green-700 dark:text-green-400 border-t pt-1.5"><span>Net Payable</span><span>₹{netPayable.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div>
              )}
            </div>
          </section>

          {/* ── DUE DATE & STATUS ─────────────────────────────────────── */}
          <section className="space-y-3">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Due Date & Status</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Due Date</Label>
                <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Invoice Status</Label>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  {[{ v: 'due' as const, l: 'Due (Unpaid)' }, { v: 'paid' as const, l: 'Paid' }].map(opt => (
                    <button key={opt.v} type="button" onClick={() => setPaymentStatus(opt.v)}
                      className={`px-3 py-2 rounded-lg text-sm font-medium border transition-all ${
                        paymentStatus === opt.v
                          ? opt.v === 'paid' ? 'bg-green-600 text-white border-green-600 shadow-xs' : 'bg-[#D71920] text-white border-[#D71920] shadow-xs'
                          : 'bg-background border-input hover:border-[#D71920]/40 hover:bg-muted/50'
                      }`}>
                      {opt.l}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* ── PAYMENT DETAILS ──────────────────────────────────────── */}
          {paymentStatus === 'paid' && (
            <section className="space-y-3 p-4 rounded-lg border border-green-200 bg-green-50 dark:bg-green-950/20 dark:border-green-800">
              <h3 className="text-xs font-semibold text-green-800 dark:text-green-200 uppercase tracking-wider">Payment Received Details</h3>
              <div className="grid grid-cols-3 gap-2">
                {['Cash', 'Cheque', 'Bank Transfer'].map(m => (
                  <button key={m} type="button" onClick={() => setPaymentMode(m)}
                    className={`px-3 py-2 rounded-lg text-sm font-medium border transition-all ${paymentMode === m ? 'bg-green-600 text-white border-green-600' : 'bg-white dark:bg-gray-900 border-input hover:border-green-400'}`}>
                    {m}
                  </button>
                ))}
              </div>

              {(paymentMode === 'Cash' || paymentMode === 'Cheque') && (
                <div className="space-y-2">
                  <Label className="text-xs">Received By</Label>
                  <ReceivedBySelect />
                  {receivedBy === '__third_party__' && (
                    <Input value={thirdPartyName} onChange={e => setThirdPartyName(e.target.value)} placeholder="Authorized person's name" />
                  )}
                </div>
              )}
              {paymentMode === 'Cheque' && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1"><Label className="text-xs">Cheque Number</Label>
                    <Input value={chequeNumber} onChange={e => setChequeNumber(e.target.value)} placeholder="000456" /></div>
                  <div className="space-y-1"><Label className="text-xs">Cheque Date</Label>
                    <Input type="date" value={chequeDate} onChange={e => setChequeDate(e.target.value)} /></div>
                </div>
              )}
              {paymentMode === 'Bank Transfer' && (
                <div className="space-y-3">
                  <div className="space-y-1"><Label className="text-xs">Received in Bank Account</Label>
                    <Select value={bankAccountId} onValueChange={setBankAccountId}>
                      <SelectTrigger><SelectValue placeholder="Select bank account" /></SelectTrigger>
                      <SelectContent>
                        {bankAccounts.length === 0 ? <div className="px-2 py-2 text-xs text-muted-foreground">No bank accounts found.</div>
                          : bankAccounts.map(b => <SelectItem key={b.id} value={b.id}>{b.account_name} — {b.bank_name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1"><Label className="text-xs">Transaction Number (UTR / Ref)</Label>
                      <Input value={transactionNumber} onChange={e => setTransactionNumber(e.target.value)} placeholder="Transaction reference" /></div>
                    <div className="space-y-1"><Label className="text-xs">Transaction Date & Time</Label>
                      <Input type="datetime-local" value={transactionDatetime} onChange={e => setTransactionDatetime(e.target.value)} /></div>
                  </div>
                </div>
              )}
            </section>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => createInvoice.mutate()} disabled={createInvoice.isPending}
            className="bg-[#D71920] hover:bg-[#D71920]/90 text-white">
            {createInvoice.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {createInvoice.isPending ? 'Saving...' : editEntry ? 'Save Changes' : paymentStatus === 'paid' ? 'Create & Record Payment' : 'Create Invoice'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
