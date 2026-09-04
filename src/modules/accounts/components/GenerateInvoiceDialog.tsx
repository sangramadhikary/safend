'use client';

import { useState, useMemo, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { ArrowLeft, Loader2, Zap, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabaseClient } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { getNextInvoiceNumber, peekNextInvoiceNumber } from '@/services/invoiceNumberService';
import { fetchClientOutstandingInvoices, sumOutstanding, type OutstandingInvoice } from '@/lib/invoice/outstanding';
import { resolveGstConfig, INDIAN_STATES, DEFAULT_PLACE_OF_SUPPLY } from '@/lib/tax/gst';

interface GenerateInvoiceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  onBack: () => void;
}

interface OperationalPost {
  id: string;
  post_name: string;
  client_name: string;
  gst_number: string | null;
  gst_percentage: number;
  gst_exempt: boolean;
  service_instances: Record<string, any> | null;
  security_services: Record<string, any> | null;
  location: Record<string, any> | null;
  work_order_id: string | null;
}

interface DutySummaryItem {
  post_name: string;
  service_type_key: string;
  service_type_label: string;
  personnel: number;
  total_duties: number;
  monthly_rate: number;
  per_day_rate: number;
  amount: number;
  /** The divisor used to derive per_day_rate from monthly_rate (26 or calendar days). */
  basis_divisor: number;
}

const SERVICE_DESIGNATIONS: { key: string; label: string }[] = [
  { key: 'unarmedGuards', label: 'Unarmed Guards' },
  { key: 'armedGuards', label: 'Armed Guards' },
  { key: 'supervisors', label: 'Supervisors' },
  { key: 'patrolOfficers', label: 'Patrol Officers' },
  { key: 'eventSecurity', label: 'Event Security' },
  { key: 'personalSecurity', label: 'Personal Security' },
];

const SHIFT_KEYS = ['day', 'afternoon', 'night'] as const;

const round2 = (n: number) => Math.round(n * 100) / 100;

function extractBillingRates(post: OperationalPost): Record<string, Partial<Record<string, number>>> {
  const map: Record<string, Partial<Record<string, number>>> = {};
  const record = (key: string, shift: string, rate: number) => {
    if (!rate || rate <= 0) return;
    map[key] = map[key] || {};
    if (!map[key][shift]) map[key][shift] = rate;
  };
  Object.entries(post.service_instances || {}).forEach(([key, val]) => {
    const instances = Array.isArray(val) ? val : (val ? [val] : []);
    instances.forEach((inst: any) => {
      SHIFT_KEYS.forEach((sh) => {
        if (inst?.shifts?.[sh]?.enabled) record(key, sh, Number(inst.shifts[sh]?.rate) || 0);
      });
    });
  });
  Object.entries(post.security_services || {}).forEach(([key, val]: [string, any]) => {
    SHIFT_KEYS.forEach((sh) => {
      if (val?.shifts?.[sh]?.enabled) record(key, sh, Number(val.shifts[sh]?.rate) || 0);
    });
  });
  return map;
}

function firstRate(shiftRates: Partial<Record<string, number>> | undefined): number {
  if (!shiftRates) return 0;
  for (const sh of SHIFT_KEYS) if (shiftRates[sh]) return shiftRates[sh]!;
  return 0;
}

function extractGuardCounts(post: OperationalPost): Record<string, number> {
  const counts: Record<string, number> = {};
  const add = (key: string, qty: number) => { counts[key] = (counts[key] || 0) + (Number(qty) || 0); };
  Object.entries(post.service_instances || {}).forEach(([key, val]) => {
    const instances = Array.isArray(val) ? val : (val ? [val] : []);
    instances.forEach((inst: any) => {
      SHIFT_KEYS.forEach((sh) => { if (inst?.shifts?.[sh]?.enabled) add(key, inst.shifts[sh]?.quantity); });
    });
  });
  Object.entries(post.security_services || {}).forEach(([key, val]: [string, any]) => {
    SHIFT_KEYS.forEach((sh) => { if (val?.shifts?.[sh]?.enabled) add(key, val.shifts[sh]?.quantity); });
  });
  return counts;
}

export function GenerateInvoiceDialog({ open, onOpenChange, onSuccess, onBack }: GenerateInvoiceDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [selectedClientName, setSelectedClientName] = useState('');
  const [selectedPostIds, setSelectedPostIds] = useState<string[]>([]);
  const [billingFrom, setBillingFrom] = useState('');
  const [billingTo, setBillingTo] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [step, setStep] = useState<'select' | 'review'>('select');
  const [dutySummary, setDutySummary] = useState<DutySummaryItem[]>([]);
  const [isFetching, setIsFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [invoiceNumInfo, setInvoiceNumInfo] = useState<{ isReused: boolean; reusedFrom?: string } | null>(null);
  const [placeOfSupply, setPlaceOfSupply] = useState(DEFAULT_PLACE_OF_SUPPLY);
  // Previous outstanding dues carried forward from this client's unpaid invoices.
  const [outstandingInvoices, setOutstandingInvoices] = useState<OutstandingInvoice[]>([]);
  const [previousDue, setPreviousDue] = useState(0);

  // Auto-generate invoice number when moving to review step
  useEffect(() => {
    if (step === 'review' && !invoiceNumber) {
      peekNextInvoiceNumber().then(({ number }) => {
        setInvoiceNumber(number);
        setInvoiceNumInfo(null);
      }).catch(() => {});
    }
  }, [step]);

  // Clear any carried-forward dues whenever we leave the review step.
  useEffect(() => {
    if (step === 'select') { setOutstandingInvoices([]); setPreviousDue(0); }
  }, [step]);

  // Fetch active operational posts (clients)
  const { data: posts = [], isLoading: postsLoading } = useQuery<OperationalPost[]>({
    queryKey: ['operational_posts_for_invoice'],
    queryFn: async () => {
      const { data, error } = await supabaseClient
        .from('operational_posts')
        .select('id, post_name, client_name, gst_number, gst_percentage, gst_exempt, service_instances, security_services, location, work_order_id')
        .eq('status', 'active')
        .order('client_name', { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as OperationalPost[];
    },
  });

  // Derive unique client names for the dropdown
  const uniqueClients = useMemo(() => {
    const clientMap = new Map<string, { name: string; gst_number: string | null; gst_percentage: number; gst_exempt: boolean; postCount: number }>();
    posts.forEach((post) => {
      const name = post.client_name || post.post_name;
      if (!clientMap.has(name)) {
        clientMap.set(name, {
          name,
          gst_number: post.gst_number,
          gst_percentage: post.gst_percentage,
          gst_exempt: post.gst_exempt,
          postCount: 1,
        });
      } else {
        clientMap.get(name)!.postCount += 1;
      }
    });
    return Array.from(clientMap.values());
  }, [posts]);

  // All posts belonging to the selected client
  const clientPosts = useMemo(() => {
    if (!selectedClientName) return [];
    return posts.filter(p => (p.client_name || p.post_name) === selectedClientName);
  }, [posts, selectedClientName]);

  // Auto-select all posts when client changes
  useEffect(() => {
    setSelectedPostIds(clientPosts.map(p => p.id));
  }, [selectedClientName, clientPosts.length]);

  // The posts that will be included in the invoice (only selected ones)
  const includedPosts = useMemo(() => {
    return clientPosts.filter(p => selectedPostIds.includes(p.id));
  }, [clientPosts, selectedPostIds]);

  const togglePostSelection = (postId: string) => {
    setSelectedPostIds(prev =>
      prev.includes(postId) ? prev.filter(id => id !== postId) : [...prev, postId]
    );
  };

  const toggleAllPosts = (checked: boolean) => {
    setSelectedPostIds(checked ? clientPosts.map(p => p.id) : []);
  };

  const selectedClientInfo = useMemo(() => uniqueClients.find(c => c.name === selectedClientName), [uniqueClients, selectedClientName]);

  // On reaching the review step, look up this client's unpaid invoices and
  // carry their outstanding balance forward automatically, so an overdue
  // client's previous dues are added to the new invoice's payment advice.
  // Matching is by normalised client name (see fetchClientOutstandingInvoices)
  // so invoices across multiple work orders — or with no work order — are all
  // captured, not just those tied to the current work order.
  useEffect(() => {
    if (step !== 'review' || !selectedClientName) return;
    let cancelled = false;

    (async () => {
      try {
        const unpaid = await fetchClientOutstandingInvoices(supabaseClient, selectedClientName);
        if (cancelled) return;
        setOutstandingInvoices(unpaid);
        setPreviousDue(sumOutstanding(unpaid));
      } catch { /* non-critical — invoice can still be generated without carry-forward */ }
    })();

    return () => { cancelled = true; };
  }, [step, selectedClientName]);

  // Fetch duty data across selected posts for the client
  const handleFetchDutyData = async () => {
    if (!selectedClientName || !billingFrom || !billingTo) {
      toast({ title: 'Missing Fields', description: 'Please select a client and billing period.', variant: 'destructive' });
      return;
    }

    if (includedPosts.length === 0) {
      toast({ title: 'No Posts Selected', description: 'Please select at least one post to include in the invoice.', variant: 'destructive' });
      return;
    }

    setIsFetching(true);
    setFetchError(null);
    setDutySummary([]);

    try {
      const fromDate = new Date(billingFrom);
      const daysInMonth = new Date(fromDate.getFullYear(), fromDate.getMonth() + 1, 0).getDate();

      const postIds = includedPosts.map(p => p.id);

      // Fetch attendance for ALL posts of this client in one query
      const { data: attendanceData, error: attError } = await supabaseClient
        .from('shift_attendance')
        .select('post_id, attendance_date, service_type_key, shift_key, status')
        .in('post_id', postIds)
        .gte('attendance_date', billingFrom)
        .lte('attendance_date', billingTo)
        .in('status', ['present', 'half_day']);

      if (attError) throw new Error(`Failed to fetch attendance: ${attError.message}`);

      // Group attendance by post_id
      const attendanceByPost: Record<string, any[]> = {};
      (attendanceData ?? []).forEach((record: any) => {
        const pid = record.post_id;
        attendanceByPost[pid] = attendanceByPost[pid] || [];
        attendanceByPost[pid].push(record);
      });

      // Build duty summary per post per designation
      const summary: DutySummaryItem[] = [];
      let missingRate = false;

      for (const post of includedPosts) {
        const rateMap = extractBillingRates(post);
        const guardCounts = extractGuardCounts(post);
        const postAttendance = attendanceByPost[post.id] || [];

        // Aggregate duties per designation + shift for this post
        const dutyMap: Record<string, Record<string, number>> = {};
        postAttendance.forEach((record: any) => {
          const key = record.service_type_key;
          if (!key) return;
          const shift = record.shift_key || 'day';
          const dutyValue = record.status === 'half_day' ? 0.5 : 1;
          dutyMap[key] = dutyMap[key] || {};
          dutyMap[key][shift] = (dutyMap[key][shift] || 0) + dutyValue;
        });

        for (const { key, label } of SERVICE_DESIGNATIONS) {
          const shiftDuties = dutyMap[key];
          if (!shiftDuties) continue;

          const buckets: Record<number, number> = {};
          for (const shift of Object.keys(shiftDuties)) {
            const duties = shiftDuties[shift];
            if (!duties || duties <= 0) continue;
            const rate = rateMap[key]?.[shift] || firstRate(rateMap[key]);
            if (!rate) missingRate = true;
            buckets[rate] = (buckets[rate] || 0) + duties;
          }

          for (const rateStr of Object.keys(buckets)) {
            const monthlyRate = Number(rateStr);
            const duties = buckets[monthlyRate];
            const perDay = daysInMonth > 0 ? monthlyRate / daysInMonth : 0;
            summary.push({
              post_name: post.post_name,
              service_type_key: key,
              service_type_label: label,
              personnel: guardCounts[key] || 0,
              total_duties: round2(duties),
              monthly_rate: monthlyRate,
              per_day_rate: round2(perDay),
              amount: round2(duties * perDay),
              basis_divisor: daysInMonth,
            });
          }
        }
      }

      if (summary.length === 0) {
        setFetchError('No attendance/duty records found for this client in the selected period. Ensure attendance has been marked.');
        setIsFetching(false);
        return;
      }

      if (missingRate) {
        setFetchError('Some designations have duties but no billing rate in the work order. Those lines are ₹0 — set the client rate in the quotation / work order.');
      }

      setDutySummary(summary);
      setStep('review');
    } catch (err: any) {
      setFetchError(err.message || 'An error occurred while fetching data.');
    } finally {
      setIsFetching(false);
    }
  };

  // Computed totals
  const subTotal = useMemo(() => dutySummary.reduce((sum, item) => sum + item.amount, 0), [dutySummary]);
  const gstPercent = selectedClientInfo?.gst_exempt ? 0 : (selectedClientInfo?.gst_percentage ?? 18);
  const gstAmount = Math.round(subTotal * (gstPercent / 100) * 100) / 100;
  const totalAmount = Math.round((subTotal + gstAmount) * 100) / 100;

  // Create the invoice
  const createInvoice = useMutation({
    mutationFn: async () => {
      if (!selectedClientName) throw new Error('No client selected.');
      if (!invoiceNumber.trim()) throw new Error('Invoice number is required.');

      // Allocate the real invoice number atomically at save time (not on form open).
      // The number shown on the form was a preview from peekNextInvoiceNumber.
      const allocated = await getNextInvoiceNumber();
      const finalInvoiceNumber = allocated.number;
      setInvoiceNumber(finalInvoiceNumber);

      // Lookup the work order display ID and date from the work_orders table
      let woDisplayId = '';
      let woDate = '';
      const woUuid = includedPosts[0]?.work_order_id;
      if (woUuid) {
        const { data: woData } = await supabaseClient
          .from('work_orders')
          .select('work_order_id, order_date')
          .eq('id', woUuid)
          .maybeSingle();
        if (woData) {
          woDisplayId = woData.work_order_id || '';
          woDate = woData.order_date || '';
        }
      }

      const fromDate = new Date(billingFrom);
      const calendarDays = new Date(fromDate.getFullYear(), fromDate.getMonth() + 1, 0).getDate();

      const description = dutySummary
        .map(d => `${d.post_name} - ${d.service_type_label}: ${d.total_duties} duties`)
        .join(', ');

      // Structured breakdown with post info — each line uses its own basis_divisor
      const lineItems = dutySummary.map(d => ({
        service: d.service_type_label,
        post: d.post_name,
        personnel: d.personnel,
        monthlyRate: d.monthly_rate,
        days: d.basis_divisor,
        duties: d.total_duties,
        perDayRate: d.per_day_rate,
        gstRate: gstPercent,
        amount: d.amount,
      }));

      const postNames = [...new Set(dutySummary.map(d => d.post_name))].join(', ');
      const serviceNames = [...new Set(dutySummary.map(d => d.service_type_label))].join(', ');

      const baseRow = {
        category: 'Invoices',
        description: `${serviceNames} | Inv#: ${finalInvoiceNumber}`,
        client_name: selectedClientName,
        amount: subTotal,
        gst_amount: gstAmount || null,
        total_amount: totalAmount,
        due_date: dueDate || null,
        reference_number: finalInvoiceNumber,
        // Lifecycle starts at 'created'; downloading the PDF promotes to 'issued'.
        status: 'created',
        // ── GST engine: persist place_of_supply + gst_type as proper columns ──
        place_of_supply: placeOfSupply,
        gst_type: resolveGstConfig(placeOfSupply, gstPercent).gstType,
        // Carry forward this client's outstanding dues so the payment advice
        // shows previous balance + current invoice. total_amount stays the
        // current invoice's own total; previous_balance is tracked separately.
        previous_balance: previousDue > 0 ? previousDue : null,
        previous_balance_breakdown:
          previousDue > 0 && outstandingInvoices.length > 0
            ? outstandingInvoices.map(i => ({
                referenceNumber: i.ref,
                date: i.due_date || null,
                amount: i.amount,
              }))
            : null,
        notes: [
          `Billing Period: ${billingFrom} to ${billingTo}`,
          `GST: ${gstPercent}%`,
          previousDue > 0 ? `Previous Due: ₹${previousDue.toLocaleString('en-IN')}` : '',
          previousDue > 0 && outstandingInvoices.length > 0
            ? `Outstanding: ${outstandingInvoices.map(i => `${i.ref} (₹${i.amount.toLocaleString('en-IN')})`).join(', ')}`
            : '',
          selectedClientInfo?.gst_number ? `Client GSTIN: ${selectedClientInfo.gst_number.toUpperCase()}` : '',
          (() => {
            const firstPost = includedPosts[0];
            const loc = firstPost?.location as any;
            if (!loc) return '';
            const parts = [loc.address, loc.city, loc.state, loc.pincode].filter(Boolean);
            return parts.length > 0 ? `Client Address: ${parts.join(', ')}` : '';
          })(),
          includedPosts[0]?.work_order_id ? `Work Order UUID: ${includedPosts[0].work_order_id}` : '',
          woDisplayId ? `Work Order No: ${woDisplayId}` : '',
          woDate ? `Work Order Date: ${woDate}` : '',
          `Posts: ${postNames}`,
          `Services: ${description}`,
        ].filter(Boolean).join(' | '),
      };

      let result = await supabaseClient
        .from('receivables')
        .insert({ ...baseRow, line_items: lineItems })
        .select()
        .single();

      if (result.error && /line_items/i.test(result.error.message)) {
        result = await supabaseClient.from('receivables').insert(baseRow).select().single();
      }
      if (result.error) throw new Error(result.error.message);
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['receivables'] });
      toast({
        title: 'Invoice Generated',
        description: previousDue > 0
          ? `Invoice ${invoiceNumber} created for ₹${totalAmount.toLocaleString('en-IN')} + ₹${previousDue.toLocaleString('en-IN')} previous due (₹${(totalAmount + previousDue).toLocaleString('en-IN')} payable).`
          : `Invoice ${invoiceNumber} created for ₹${totalAmount.toLocaleString('en-IN')}.`,
      });
      onSuccess();
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const handleReset = () => {
    setStep('select');
    setDutySummary([]);
    setFetchError(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[750px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={step === 'review' ? handleReset : onBack}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <DialogTitle>{step === 'select' ? 'Generate Invoice' : 'Review & Confirm'}</DialogTitle>
          </div>
          <p className="text-sm text-muted-foreground ml-10">
            {step === 'select'
              ? 'Select a client and billing period to auto-generate the invoice from duty data'
              : 'Review the calculated amounts before creating the invoice'}
          </p>
        </DialogHeader>

        {step === 'select' && (
          <div className="space-y-5 py-2">
            {/* Client Selection */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Client Selection</h3>
              <div className="space-y-1">
                <Label>Select Client *</Label>
                <Select value={selectedClientName} onValueChange={setSelectedClientName}>
                  <SelectTrigger>
                    <SelectValue placeholder={postsLoading ? 'Loading...' : 'Select a client'} />
                  </SelectTrigger>
                  <SelectContent>
                    {uniqueClients.map((client) => (
                      <SelectItem key={client.name} value={client.name}>
                        {client.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedClientInfo && (
                <Card className="bg-muted/30">
                  <CardContent className="p-3 text-sm space-y-1">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Client Name:</span>
                      <span className="font-medium">{selectedClientInfo.name}</span>
                    </div>
                    {selectedClientInfo.gst_number && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">GSTIN:</span>
                        <span className="font-medium">{selectedClientInfo.gst_number}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">GST:</span>
                      <span className="font-medium">{selectedClientInfo.gst_exempt ? 'Exempt' : `${selectedClientInfo.gst_percentage}%`}</span>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Post Selection with checkboxes */}
              {clientPosts.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm">Select Posts to Include *</Label>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="select-all-posts"
                        checked={selectedPostIds.length === clientPosts.length}
                        onCheckedChange={(checked) => toggleAllPosts(!!checked)}
                      />
                      <label htmlFor="select-all-posts" className="text-xs text-muted-foreground cursor-pointer">
                        Select All ({clientPosts.length})
                      </label>
                    </div>
                  </div>
                  <Card className="bg-muted/20">
                    <CardContent className="p-2 max-h-[160px] overflow-y-auto space-y-1">
                      {clientPosts.map((post) => (
                        <div
                          key={post.id}
                          className="flex items-center gap-2 p-1.5 rounded hover:bg-muted/50 transition-colors"
                        >
                          <Checkbox
                            id={`post-${post.id}`}
                            checked={selectedPostIds.includes(post.id)}
                            onCheckedChange={() => togglePostSelection(post.id)}
                          />
                          <label htmlFor={`post-${post.id}`} className="text-sm cursor-pointer flex-1">
                            {post.post_name}
                          </label>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                  <p className="text-xs text-muted-foreground">
                    {selectedPostIds.length} of {clientPosts.length} posts selected
                  </p>
                </div>
              )}
            </div>

            {/* Billing Period */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Billing Period</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label>From Date *</Label>
                  <Input type="date" value={billingFrom} onChange={(e) => setBillingFrom(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>To Date *</Label>
                  <Input type="date" value={billingTo} onChange={(e) => setBillingTo(e.target.value)} />
                </div>
              </div>
            </div>

            {/* Error display */}
            {fetchError && (
              <div className="flex items-start gap-2 p-3 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800">
                <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                <p className="text-sm text-amber-800 dark:text-amber-200">{fetchError}</p>
              </div>
            )}

            <DialogFooter className="pt-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button
                onClick={handleFetchDutyData}
                disabled={isFetching || !selectedClientName || !billingFrom || !billingTo || selectedPostIds.length === 0}
                className="bg-safend-red hover:bg-safend-red/90 text-white"
              >
                {isFetching && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {isFetching ? 'Fetching Data...' : 'Fetch & Generate'}
                {!isFetching && <Zap className="h-4 w-4 ml-2" />}
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === 'review' && (
          <div className="space-y-5 py-2">
            {/* Summary Header */}
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold">{selectedClientName}</p>
                <p className="text-sm text-muted-foreground">
                  Period: {new Date(billingFrom).toLocaleDateString('en-IN')} — {new Date(billingTo).toLocaleDateString('en-IN')}
                  {' · '}{includedPosts.length} post{includedPosts.length > 1 ? 's' : ''}
                </p>
              </div>
              <Badge variant="outline" className="text-green-700 border-green-300 bg-green-50">
                <CheckCircle2 className="h-3 w-3 mr-1" /> Data Fetched
              </Badge>
            </div>

            {/* Duty Breakdown Table */}
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>Post</TableHead>
                    <TableHead>Service Type</TableHead>
                    <TableHead className="text-center">Personnel</TableHead>
                    <TableHead className="text-right">WO Rate/mo (₹)</TableHead>
                    <TableHead className="text-center">Duties</TableHead>
                    <TableHead className="text-right">Rate/Duty (₹)</TableHead>
                    <TableHead className="text-right">Amount (₹)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dutySummary.map((item, idx) => (
                    <TableRow key={`${item.post_name}-${item.service_type_key}-${idx}`}>
                      <TableCell className="text-xs text-muted-foreground">{item.post_name}</TableCell>
                      <TableCell className="font-medium">{item.service_type_label}</TableCell>
                      <TableCell className="text-center">{item.personnel || '—'}</TableCell>
                      <TableCell className="text-right">₹{item.monthly_rate.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</TableCell>
                      <TableCell className="text-center">{item.total_duties}</TableCell>
                      <TableCell className="text-right">₹{item.per_day_rate.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</TableCell>
                      <TableCell className="text-right font-medium">₹{item.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Totals */}
            <Card>
              <CardContent className="p-4 space-y-2">
                {/* Place of Supply */}
                <div className="space-y-1 pb-2 border-b">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Place of Supply</Label>
                  <Select value={placeOfSupply} onValueChange={setPlaceOfSupply}>
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="max-h-60">
                      {INDIAN_STATES.map(s => (
                        <SelectItem key={s.code} value={s.label}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {(() => {
                    const { gstType } = resolveGstConfig(placeOfSupply, gstPercent);
                    return (
                      <p className={`text-[10px] font-medium mt-1 ${gstType === 'igst' ? 'text-blue-600' : 'text-green-600'}`}>
                        {gstType === 'igst'
                          ? `Inter-State → IGST ${gstPercent}%`
                          : `Intra-State (Odisha) → CGST ${gstPercent / 2}% + SGST ${gstPercent / 2}%`}
                      </p>
                    );
                  })()}
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Sub Total</span>
                  <span className="font-medium">₹{subTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                </div>
                {gstAmount > 0 && (() => {
                  const { gstType } = resolveGstConfig(placeOfSupply, gstPercent);
                  return gstType === 'igst' ? (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">IGST ({gstPercent}%)</span>
                      <span className="font-medium">₹{gstAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                    </div>
                  ) : (
                    <>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">GST ({gstPercent}%)</span>
                        <span className="font-medium">₹{gstAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                      </div>
                      <div className="flex justify-between text-xs text-muted-foreground pl-4">
                        <span>SGST ({gstPercent / 2}%) + CGST ({gstPercent / 2}%)</span>
                        <span>₹{(gstAmount / 2).toLocaleString('en-IN', { minimumFractionDigits: 2 })} + ₹{(gstAmount / 2).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                      </div>
                    </>
                  );
                })()}
                <div className="flex justify-between text-base font-bold border-t pt-2 mt-2">
                  <span>Total Amount</span>
                  <span className="text-safend-red">₹{totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                </div>
                {previousDue > 0 && (
                  <>
                    <div className="flex justify-between text-sm text-amber-700 dark:text-amber-300">
                      <span>Previous Outstanding</span>
                      <span className="font-medium">₹{previousDue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between text-base font-bold border-t pt-2 mt-1">
                      <span>Total Payable</span>
                      <span className="text-safend-red">₹{(totalAmount + previousDue).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Previous outstanding dues carried forward for this client */}
            {outstandingInvoices.length > 0 && (
              <div className="rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 overflow-hidden">
                <div className="px-3 py-1.5 bg-amber-100 dark:bg-amber-900/30 flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-amber-800 dark:text-amber-200">
                    Previous dues carried forward — {outstandingInvoices.length} unpaid invoice{outstandingInvoices.length !== 1 ? 's' : ''}
                  </span>
                  <span className="text-[11px] font-bold text-amber-900 dark:text-amber-100">
                    ₹{previousDue.toLocaleString('en-IN')}
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
                        <td className="px-3 py-1 text-right font-semibold text-amber-900 dark:text-amber-100">
                          ₹{inv.amount.toLocaleString('en-IN')}
                          {inv.previousBalance > 0 && (
                            <div className="text-[10px] font-normal text-amber-600 dark:text-amber-400">
                              ₹{inv.ownAmount.toLocaleString('en-IN')} + ₹{inv.previousBalance.toLocaleString('en-IN')} prev
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Invoice Details */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Invoice Details</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label>Invoice Number *</Label>
                  <Input
                    value={invoiceNumber}
                    onChange={(e) => setInvoiceNumber(e.target.value)}
                    placeholder="Auto-generated"
                    className="font-mono"
                  />
                  {invoiceNumInfo?.isReused && (
                    <p className="text-xs text-blue-600 mt-1">↻ Reusing cancelled invoice number (priority fill)</p>
                  )}
                </div>
                <div className="space-y-1">
                  <Label>Due Date</Label>
                  <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                </div>
              </div>
            </div>

            <DialogFooter className="pt-2">
              <Button variant="outline" onClick={handleReset}>← Back to Selection</Button>
              <Button
                onClick={() => createInvoice.mutate()}
                disabled={createInvoice.isPending || !invoiceNumber.trim()}
                className="bg-safend-red hover:bg-safend-red/90 text-white"
              >
                {createInvoice.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {createInvoice.isPending ? 'Creating...' : 'Create Invoice'}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
