'use client';

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { CheckCircle } from "lucide-react";
import { BillPayment, PAYMENT_METHODS } from "./types";
import { useBillStore } from "./billStore";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { getBranchScope } from "@/utils/branchScope";

interface PaymentDialogProps {
  payment: BillPayment;
  onSuccess: () => void;
  onCancel: () => void;
}

interface UtilityState {
  prevReading: string;
  currReading: string;
  rate: string;
}

const emptyUtil = (): UtilityState => ({ prevReading: '', currReading: '', rate: '' });

function calcUtility(u: UtilityState): number {
  const prev = parseFloat(u.prevReading) || 0;
  const curr = parseFloat(u.currReading) || 0;
  const rate = parseFloat(u.rate) || 0;
  const units = Math.max(0, curr - prev);
  return Math.round(units * rate * 100) / 100;
}

/**
 * One utility's meter inputs.
 *
 * Declared at module scope, NOT inside PaymentDialog. A component defined in the
 * parent's body is a new type on every render, so React unmounts and remounts the
 * whole subtree — which made these inputs lose focus after every keystroke.
 */
function UtilityRow({
  label, emoji, unit, accent, state, setState, error,
}: {
  label: string;
  emoji: string;
  unit: string;
  accent: string;
  state: UtilityState;
  setState: React.Dispatch<React.SetStateAction<UtilityState>>;
  error?: string;
}) {
  const amount = calcUtility(state);
  const prev = parseFloat(state.prevReading) || 0;
  const curr = parseFloat(state.currReading) || 0;
  const units = Math.max(0, curr - prev);
  const hasUsage = units > 0 || amount > 0;

  return (
    <div className={`min-w-0 rounded-lg border ${accent}`}>
      {/* Header: name on the left, live computed amount on the right */}
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wide">
          {emoji} {label}
          <span className="ml-1.5 font-normal normal-case text-muted-foreground">({unit})</span>
        </span>
        <span className={`shrink-0 text-sm font-bold tabular-nums ${hasUsage ? '' : 'text-muted-foreground'}`}>
          ₹{amount.toLocaleString('en-IN')}
        </span>
      </div>

      <div className="grid min-w-0 grid-cols-3 gap-2 p-3">
        <div className="min-w-0 space-y-1">
          <Label className="text-xs whitespace-nowrap">Previous</Label>
          <Input
            type="number" min="0" step="0.01" value={state.prevReading}
            onChange={e => setState(s => ({ ...s, prevReading: e.target.value }))}
            placeholder="0" className="h-9 text-sm tabular-nums"
          />
        </div>
        <div className="min-w-0 space-y-1">
          <Label className="text-xs whitespace-nowrap">Current</Label>
          <Input
            type="number" min="0" step="0.01" value={state.currReading}
            onChange={e => setState(s => ({ ...s, currReading: e.target.value }))}
            placeholder="0"
            className={`h-9 text-sm tabular-nums ${error ? 'border-destructive' : ''}`}
          />
        </div>
        <div className="min-w-0 space-y-1">
          <Label className="text-xs whitespace-nowrap">Rate ₹</Label>
          <Input
            type="number" min="0" step="0.01" value={state.rate}
            onChange={e => setState(s => ({ ...s, rate: e.target.value }))}
            placeholder="0" className="h-9 text-sm tabular-nums"
          />
        </div>
      </div>

      {(error || hasUsage) && (
        <div className="px-3 pb-2.5">
          {error
            ? <p className="text-xs text-destructive">{error}</p>
            : <p className="text-xs text-muted-foreground tabular-nums">
                {units.toFixed(2)} {unit} × ₹{(parseFloat(state.rate) || 0).toFixed(2)} = ₹{amount.toLocaleString('en-IN')}
              </p>
          }
        </div>
      )}
    </div>
  );
}

export function PaymentDialog({ payment, onSuccess, onCancel }: PaymentDialogProps) {
  const { markAsPaid, bills } = useBillStore();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const bill = bills.find(b => b.id === payment.bill_id);
  const isRent = bill?.category === 'rent';

  // ── Property context (only for rent bills) ──────────────────────────────────
  const [propertyId, setPropertyId] = useState<string | null>(null);
  const [propertyName, setPropertyName] = useState<string>('');
  const [electric, setElectric] = useState<UtilityState>(emptyUtil());
  const [water, setWater] = useState<UtilityState>(emptyUtil());
  const [gas, setGas] = useState<UtilityState>(emptyUtil());
  const [loadingProperty, setLoadingProperty] = useState(false);

  useEffect(() => {
    if (!isRent || !bill?.notes) return;
    const match = bill.notes.match(/\[property_id:([^\]]+)\]/);
    if (!match) return;
    const pid = match[1];
    setPropertyId(pid);

    setLoadingProperty(true);
    supabase
      .from('rented_properties')
      .select('name,electric_meter_reading,electric_rate_per_unit,water_meter_reading,water_rate_per_unit,gas_meter_reading,gas_rate_per_unit')
      .eq('id', pid)
      .maybeSingle()
      .then(({ data }) => {
        setLoadingProperty(false);
        if (!data) return;
        setPropertyName(data.name || '');
        if (data.electric_meter_reading != null) {
          setElectric(e => ({
            ...e,
            prevReading: String(data.electric_meter_reading),
            rate: data.electric_rate_per_unit != null ? String(data.electric_rate_per_unit) : e.rate,
          }));
        }
        if (data.water_meter_reading != null) {
          setWater(e => ({
            ...e,
            prevReading: String(data.water_meter_reading),
            rate: data.water_rate_per_unit != null ? String(data.water_rate_per_unit) : e.rate,
          }));
        }
        if (data.gas_meter_reading != null) {
          setGas(e => ({
            ...e,
            prevReading: String(data.gas_meter_reading),
            rate: data.gas_rate_per_unit != null ? String(data.gas_rate_per_unit) : e.rate,
          }));
        }
      });
  }, [isRent, bill?.notes]);

  const electricAmt = calcUtility(electric);
  const waterAmt = calcUtility(water);
  const gasAmt = calcUtility(gas);
  const utilityTotal = electricAmt + waterAmt + gasAmt;

  const rentBase = payment.total_amount - (payment.paid_amount || 0);
  const grandTotal = rentBase + utilityTotal;

  // ── Standard payment fields ──────────────────────────────────────────────────
  const [formData, setFormData] = useState({
    payment_date: format(new Date(), 'yyyy-MM-dd'),
    payment_method: '',
    payment_reference: '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!formData.payment_date) e.payment_date = 'Payment date is required';
    if (!formData.payment_method) e.payment_method = 'Select a payment method';
    if (isRent) {
      const checkReading = (label: string, u: UtilityState) => {
        if (!u.currReading && !u.prevReading) return; // utility not configured — skip
        const prev = parseFloat(u.prevReading) || 0;
        const curr = parseFloat(u.currReading);
        if (u.currReading !== '' && curr < prev) e[`${label}_curr`] = 'Current reading must be ≥ previous';
      };
      checkReading('electric', electric);
      checkReading('water', water);
      checkReading('gas', gas);
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!validate()) return;
    setIsSubmitting(true);

    try {
      // 1. Update bill_payment row with utility breakdown and grand total
      const utilityPayload = isRent ? {
        electric_prev_reading: parseFloat(electric.prevReading) || null,
        electric_curr_reading: parseFloat(electric.currReading) || null,
        electric_units: Math.max(0, (parseFloat(electric.currReading) || 0) - (parseFloat(electric.prevReading) || 0)) || null,
        electric_rate: parseFloat(electric.rate) || null,
        electric_amount: electricAmt || null,
        water_prev_reading: parseFloat(water.prevReading) || null,
        water_curr_reading: parseFloat(water.currReading) || null,
        water_units: Math.max(0, (parseFloat(water.currReading) || 0) - (parseFloat(water.prevReading) || 0)) || null,
        water_rate: parseFloat(water.rate) || null,
        water_amount: waterAmt || null,
        gas_prev_reading: parseFloat(gas.prevReading) || null,
        gas_curr_reading: parseFloat(gas.currReading) || null,
        gas_units: Math.max(0, (parseFloat(gas.currReading) || 0) - (parseFloat(gas.prevReading) || 0)) || null,
        gas_rate: parseFloat(gas.rate) || null,
        gas_amount: gasAmt || null,
        utility_total: utilityTotal || null,
        grand_total: grandTotal || null,
        property_id: propertyId || null,
        property_name: propertyName || null,
      } : {};

      const paidAmountFull = (payment.paid_amount || 0) + payment.total_amount - (payment.paid_amount || 0);
      const result = await markAsPaid(payment.id, {
        paid_amount: paidAmountFull,
        payment_date: formData.payment_date,
        payment_method: formData.payment_method,
        payment_reference: formData.payment_reference.trim() || undefined,
        marked_by: 'admin',
        extra: utilityPayload,
      });
      if (!result.success) throw new Error(result.error);

      // 2. For rent payments: submit a combined payables entry to Accounts
      if (isRent && grandTotal > 0) {
        const scope = getBranchScope();
        const description = [
          `Rent — ${propertyName || bill?.vendor_name || 'Property'} | Period: ${payment.period_label}`,
          electricAmt > 0 ? `Electric ₹${electricAmt.toLocaleString('en-IN')}` : null,
          waterAmt > 0 ? `Water ₹${waterAmt.toLocaleString('en-IN')}` : null,
          gasAmt > 0 ? `Gas ₹${gasAmt.toLocaleString('en-IN')}` : null,
        ].filter(Boolean).join(' | ');

        await supabase.from('payables').insert({
          category: 'Rent & Utilities',
          description,
          vendor_name: bill?.vendor_name || null,
          amount: payment.amount,
          gst_amount: payment.tax_amount || null,
          total_amount: grandTotal,
          due_date: payment.due_date,
          status: 'pending',
          payment_mode: formData.payment_method,
          reference_number: formData.payment_reference.trim() || null,
          notes: `bill_payment_id:${payment.id}${propertyId ? ` | property_id:${propertyId}` : ''}`,
          branch_id: scope.id || null,
        });
      }

      // 3. Update rented_properties meter readings to the new current readings
      //    (so next payment's previous reading is pre-filled correctly)
      if (isRent && propertyId) {
        const updates: Record<string, number | null> = {};
        if (electric.currReading !== '') updates.electric_meter_reading = parseFloat(electric.currReading) || null;
        if (water.currReading !== '') updates.water_meter_reading = parseFloat(water.currReading) || null;
        if (gas.currReading !== '') updates.gas_meter_reading = parseFloat(gas.currReading) || null;
        if (Object.keys(updates).length > 0) {
          await supabase.from('rented_properties').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', propertyId);
        }
      }

      toast({
        title: 'Payment submitted to Accounts',
        description: isRent && utilityTotal > 0
          ? `Rent ₹${payment.amount.toLocaleString('en-IN')} + Utilities ₹${utilityTotal.toLocaleString('en-IN')} = Grand Total ₹${grandTotal.toLocaleString('en-IN')} sent for approval under Rent & Utilities.`
          : `₹${payment.amount.toLocaleString('en-IN')} payment recorded.`,
      });
      onSuccess();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to record payment', variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    // min-w-0 on the grid and both columns: DialogContent is a CSS grid and its
    // items default to min-width:auto, so without this the meter inputs and the
    // nowrap labels push the panel wider than its own max-width.
    <form onSubmit={handleSubmit} className="min-w-0">
      <div className="grid min-w-0 grid-cols-1 gap-5 lg:grid-cols-[minmax(0,300px)_minmax(0,1fr)]">

        {/* ══ LEFT: summary ══════════════════════════════════════════════════ */}
        <div className="min-w-0 space-y-2 self-start rounded-lg bg-muted/50 p-4">
          <div className="flex justify-between gap-3 text-sm">
            <span className="shrink-0 text-muted-foreground">Bill</span>
            <span className="truncate font-medium">{payment.bill_name || bill?.name || 'Bill Payment'}</span>
          </div>
          {propertyName && (
            <div className="flex justify-between gap-3 text-sm">
              <span className="shrink-0 text-muted-foreground">Property</span>
              <span className="truncate">{propertyName}</span>
            </div>
          )}
          <div className="flex justify-between gap-3 text-sm">
            <span className="shrink-0 text-muted-foreground">Period</span>
            <span>{payment.period_label}</span>
          </div>
          <div className="flex justify-between gap-3 text-sm">
            <span className="shrink-0 text-muted-foreground">Due Date</span>
            <span>{format(new Date(payment.due_date), 'dd MMM yyyy')}</span>
          </div>
          <Separator />
          <div className="flex justify-between gap-3 text-sm">
            <span className="text-muted-foreground">Rent</span>
            <span className="tabular-nums">₹{payment.amount.toLocaleString('en-IN')}</span>
          </div>
          {payment.tax_amount > 0 && (
            <div className="flex justify-between gap-3 text-sm">
              <span className="text-muted-foreground">Tax</span>
              <span className="tabular-nums">₹{payment.tax_amount.toLocaleString('en-IN')}</span>
            </div>
          )}
          {isRent && utilityTotal > 0 && (
            <>
              {electricAmt > 0 && (
                <div className="flex justify-between gap-3 text-sm">
                  <span className="text-muted-foreground">⚡ Electric</span>
                  <span className="tabular-nums">₹{electricAmt.toLocaleString('en-IN')}</span>
                </div>
              )}
              {waterAmt > 0 && (
                <div className="flex justify-between gap-3 text-sm">
                  <span className="text-muted-foreground">💧 Water</span>
                  <span className="tabular-nums">₹{waterAmt.toLocaleString('en-IN')}</span>
                </div>
              )}
              {gasAmt > 0 && (
                <div className="flex justify-between gap-3 text-sm">
                  <span className="text-muted-foreground">🔥 Gas</span>
                  <span className="tabular-nums">₹{gasAmt.toLocaleString('en-IN')}</span>
                </div>
              )}
            </>
          )}
          <Separator />
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm font-semibold">Grand Total</span>
            <span className="text-lg font-bold tabular-nums">₹{grandTotal.toLocaleString('en-IN')}</span>
          </div>

          {isRent && (
            <p className="pt-1 text-xs leading-relaxed text-muted-foreground">
              Submitting sends a <strong>Rent &amp; Utilities</strong> payable to Accounts
              for approval. Meter readings become next month's baseline.
            </p>
          )}
        </div>

        {/* ══ RIGHT: inputs ══════════════════════════════════════════════════ */}
        <div className="min-w-0 space-y-5">

          {/* Utility charges — rent bills only */}
          {isRent && (
            <div className="min-w-0 space-y-3">
              <div>
                <p className="text-sm font-semibold">Additional Utility Charges</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {loadingProperty
                    ? 'Loading previous readings…'
                    : 'Previous readings are pre-filled from the property. Leave a utility blank if it does not apply.'}
                </p>
              </div>
              <div className="grid min-w-0 grid-cols-1 gap-3 xl:grid-cols-3">
                <UtilityRow
                  label="Electric" emoji="⚡" unit="kWh"
                  accent="border-amber-200 bg-amber-50/40 [&>div:first-child]:border-amber-200 [&_span]:text-amber-900"
                  state={electric} setState={setElectric} error={errors.electric_curr}
                />
                <UtilityRow
                  label="Water" emoji="💧" unit="KL"
                  accent="border-blue-200 bg-blue-50/40 [&>div:first-child]:border-blue-200 [&_span]:text-blue-900"
                  state={water} setState={setWater} error={errors.water_curr}
                />
                <UtilityRow
                  label="Piped Gas" emoji="🔥" unit="SCM"
                  accent="border-orange-200 bg-orange-50/40 [&>div:first-child]:border-orange-200 [&_span]:text-orange-900"
                  state={gas} setState={setGas} error={errors.gas_curr}
                />
              </div>
              {utilityTotal > 0 && (
                <div className="flex items-center justify-between rounded-lg border bg-muted/40 px-3 py-2">
                  <span className="text-xs font-medium text-muted-foreground">Utilities subtotal</span>
                  <span className="text-sm font-bold tabular-nums">₹{utilityTotal.toLocaleString('en-IN')}</span>
                </div>
              )}
            </div>
          )}

          {/* Payment fields */}
          <div className="min-w-0 space-y-3">
            {isRent && <p className="text-sm font-semibold">Payment Details</p>}
            <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="min-w-0 space-y-1.5">
                <Label htmlFor="payment_date">Payment Date *</Label>
                <Input
                  id="payment_date" type="date" value={formData.payment_date}
                  onChange={e => { setFormData(p => ({ ...p, payment_date: e.target.value })); if (errors.payment_date) setErrors(p => ({ ...p, payment_date: '' })); }}
                  className={errors.payment_date ? 'border-destructive' : ''}
                />
                {errors.payment_date && <p className="text-xs text-destructive">{errors.payment_date}</p>}
              </div>

              <div className="min-w-0 space-y-1.5">
                <Label htmlFor="payment_method">Payment Method *</Label>
                <Select value={formData.payment_method} onValueChange={v => { setFormData(p => ({ ...p, payment_method: v })); if (errors.payment_method) setErrors(p => ({ ...p, payment_method: '' })); }}>
                  <SelectTrigger className={errors.payment_method ? 'border-destructive' : ''}>
                    <SelectValue placeholder="Select method" />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHODS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                {errors.payment_method && <p className="text-xs text-destructive">{errors.payment_method}</p>}
              </div>
            </div>

            <div className="min-w-0 space-y-1.5">
              <Label htmlFor="payment_reference">Reference / Transaction ID</Label>
              <Input
                id="payment_reference" value={formData.payment_reference}
                onChange={e => setFormData(p => ({ ...p, payment_reference: e.target.value }))}
                placeholder="e.g., UTR number, cheque no."
              />
            </div>
          </div>
        </div>
      </div>

      {/* ══ Actions — full width under both columns ═══════════════════════════ */}
      <div className="mt-5 flex flex-wrap justify-end gap-3 border-t pt-4">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>Cancel</Button>
        <Button type="submit" disabled={isSubmitting}>
          <CheckCircle className="h-4 w-4 mr-2" />
          {isSubmitting ? 'Submitting…' : isRent ? `Submit ₹${grandTotal.toLocaleString('en-IN')} to Accounts` : 'Record Payment'}
        </Button>
      </div>
    </form>
  );
}
