'use client';

import { useState, useRef, useEffect, useMemo } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, CheckCircle2, ChevronDown, Ban, UserCheck, Check, Building2, Search } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useWorkOrdersData } from "@/contexts/WorkOrdersDataContext";
import { RATE_BASIS_OPTIONS, CONVENTIONAL_BASIS_DAYS } from "@/lib/invoice/rateBasis";

const NO_GST_REASONS = [
  { value: 'Unregistered Dealer', label: 'Unregistered Dealer' },
  { value: 'Government Entity', label: 'Government Entity' },
  { value: 'Composition Scheme Dealer', label: 'Composition Scheme Dealer' },
  { value: 'Individual / HUF', label: 'Individual / HUF' },
  { value: 'Diplomatic / Embassy', label: 'Diplomatic / Embassy' },
  { value: 'Charitable / Religious Trust', label: 'Charitable / Religious Trust' },
  { value: 'Below Threshold Turnover', label: 'Below Threshold Turnover' },
  { value: 'GST Pending / Applied', label: 'GST Pending / Applied' },
  { value: 'Foreign Entity', label: 'Foreign Entity' },
  { value: 'Other', label: 'Other' },
];

export const NO_GST_PREFIX = 'NO_GST:';

export function isNoGstValue(value: string) {
  return value?.startsWith(NO_GST_PREFIX);
}

export function getNoGstReason(value: string) {
  return isNoGstValue(value) ? value.slice(NO_GST_PREFIX.length) : '';
}

interface BasicInfoTabProps {
  formData: {
    clientGst: string;
    client: string;
    contactPerson: string;
    contactPhone: string;
    contactEmail: string;
    address: string;
    city: string;
    state: string;
    pincode: string;
    rateBasis?: string;
    basisDays?: string | number;
  };
  handleChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  handleSelectChange: (value: string, name: string) => void;
  onGstFetch?: (data: { client: string; address: string; pincode: string; state: string }) => void;
  onClientSelect?: (fields: {
    client: string;
    clientGst: string;
    contactPerson: string;
    contactPhone: string;
    contactEmail: string;
    address: string;
    city: string;
    state: string;
    pincode: string;
  }) => void;
}

export function BasicInfoTab({ formData, handleChange, handleSelectChange, onGstFetch, onClientSelect }: BasicInfoTabProps) {
  const [gstLoading, setGstLoading] = useState(false);
  const [gstFetched, setGstFetched] = useState(false);
  const [gstError, setGstError] = useState("");
  const [gstStatus, setGstStatus] = useState("");

  const [noGstOpen, setNoGstOpen] = useState(false);
  const noGstRef = useRef<HTMLDivElement>(null);

  const [clientPickerOpen, setClientPickerOpen] = useState(false);
  const [clientSearch, setClientSearch] = useState("");
  const clientPickerRef = useRef<HTMLDivElement>(null);
  const { workOrders } = useWorkOrdersData();

  const regularClients = useMemo(() => {
    const seen = new Map<string, {
      name: string; clientGst: string; contactPerson: string;
      contactPhone: string; contactEmail: string;
      address: string; city: string; state: string; pincode: string;
    }>();
    for (const wo of workOrders as any[]) {
      const raw = (wo.clientName || wo.companyName || '').trim();
      if (!raw) continue;
      const key = raw.toLowerCase().replace(/\s+/g, ' ');
      if (seen.has(key)) continue;
      seen.set(key, {
        name: raw,
        clientGst: wo.clientGst || '',
        contactPerson: wo.contactPerson || '',
        contactPhone: wo.contactPhone || '',
        contactEmail: wo.contactEmail || '',
        address: wo.address || '',
        city: wo.city || '',
        state: wo.state || '',
        pincode: wo.pincode || '',
      });
    }
    return Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [workOrders]);

  const visibleClients = useMemo(() => {
    const q = clientSearch.trim().toLowerCase();
    if (!q) return regularClients;
    return regularClients.filter(c =>
      [c.name, c.contactPerson, c.city, c.contactPhone]
        .filter(Boolean)
        .some(field => field.toLowerCase().includes(q))
    );
  }, [regularClients, clientSearch]);

  useEffect(() => {
    function handleOutsideClick(e: MouseEvent) {
      if (noGstRef.current && !noGstRef.current.contains(e.target as Node)) {
        setNoGstOpen(false);
      }
    }
    if (noGstOpen) document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [noGstOpen]);

  useEffect(() => {
    function handleOutsideClick(e: MouseEvent) {
      if (clientPickerRef.current && !clientPickerRef.current.contains(e.target as Node)) {
        setClientPickerOpen(false);
      }
    }
    if (clientPickerOpen) document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [clientPickerOpen]);

  const applyClient = (c: typeof regularClients[number]) => {
    onClientSelect?.({
      client: c.name,
      clientGst: c.clientGst,
      contactPerson: c.contactPerson,
      contactPhone: c.contactPhone,
      contactEmail: c.contactEmail,
      address: c.address,
      city: c.city,
      state: c.state,
      pincode: c.pincode,
    });
    setClientPickerOpen(false);
    setClientSearch("");
    setGstFetched(false);
    setGstError("");
  };

  const isNoGst = isNoGstValue(formData.clientGst);
  const noGstReason = getNoGstReason(formData.clientGst);

  const autoFetchGst = async (gstin: string) => {
    if (!gstin || gstin.length < 15) { setGstError("Enter a valid 15-character GSTIN"); return; }
    setGstLoading(true); setGstError(""); setGstFetched(false);
    try {
      const res = await fetch(`/api/gst-lookup?gstin=${gstin}`);
      const json = await res.json();
      if (!res.ok || !json.success) { setGstError(json.error || "GST lookup failed"); return; }
      const { legalName, tradeName, address, pincode, status } = json.data;
      setGstStatus(status || '');
      const stateCodeMap: Record<string, string> = {
        '01': 'Jammu & Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab',
        '04': 'Chandigarh', '05': 'Uttarakhand', '06': 'Haryana',
        '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh',
        '10': 'Bihar', '11': 'Sikkim', '12': 'Arunachal Pradesh',
        '13': 'Nagaland', '14': 'Manipur', '15': 'Mizoram',
        '16': 'Tripura', '17': 'Meghalaya', '18': 'Assam',
        '19': 'West Bengal', '20': 'Jharkhand', '21': 'Odisha',
        '22': 'Chhattisgarh', '23': 'Madhya Pradesh', '24': 'Gujarat',
        '26': 'Dadra & Nagar Haveli', '27': 'Maharashtra', '29': 'Karnataka',
        '30': 'Goa', '31': 'Lakshadweep', '32': 'Kerala',
        '33': 'Tamil Nadu', '34': 'Puducherry', '35': 'Andaman & Nicobar',
        '36': 'Telangana', '37': 'Andhra Pradesh',
      };
      const stateName = stateCodeMap[gstin.substring(0, 2)] || '';
      if (onGstFetch) onGstFetch({ client: tradeName || legalName || '', address: address || '', pincode: pincode || '', state: stateName });
      setGstFetched(true);
    } catch (err: any) {
      setGstError(err.message || "Network error");
    } finally {
      setGstLoading(false);
    }
  };

  return (
    <div className="grid grid-cols-2 gap-6">
      {/* ─── Section 1: Client Details ─── */}
      <div className="space-y-4 border-r pr-6">
        <div className="flex items-center justify-between border-b pb-2">
          <h4 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">Client Details</h4>

          {/* Existing-client picker */}
          <div ref={clientPickerRef} className="relative">
            <button
              type="button"
              onClick={() => setClientPickerOpen(prev => !prev)}
              className="flex items-center gap-1.5 rounded-md border border-dashed px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800 transition-colors"
              title="Auto-fill from an existing regular client"
            >
              <UserCheck className="h-3.5 w-3.5" />
              Existing Client
              <ChevronDown className={`h-3 w-3 transition-transform duration-200 ${clientPickerOpen ? 'rotate-180' : ''}`} />
            </button>

            {clientPickerOpen && (
              <div className="absolute right-0 top-full mt-1 z-50 w-72 rounded-md border bg-white dark:bg-gray-900 shadow-xl">
                <div className="flex items-center gap-2 border-b px-3 py-2">
                  <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <input
                    autoFocus
                    type="text"
                    value={clientSearch}
                    onChange={e => setClientSearch(e.target.value)}
                    placeholder="Search client…"
                    className="flex-1 bg-transparent text-sm outline-hidden placeholder:text-muted-foreground"
                  />
                </div>
                <div className="max-h-60 overflow-y-auto py-1">
                  {visibleClients.length === 0 ? (
                    <div className="flex flex-col items-center gap-1.5 py-6 text-center">
                      <Building2 className="h-5 w-5 text-muted-foreground/40" />
                      <p className="text-sm text-muted-foreground">
                        {regularClients.length === 0 ? 'No regular clients yet' : 'No match found'}
                      </p>
                    </div>
                  ) : (
                    visibleClients.map(c => {
                      const isSelected = formData.client?.toLowerCase().trim() === c.name.toLowerCase().trim();
                      return (
                        <button
                          key={c.name}
                          type="button"
                          onClick={() => applyClient(c)}
                          className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{c.name}</p>
                            {(c.contactPerson || c.city) && (
                              <p className="truncate text-[11px] text-muted-foreground">
                                {[c.contactPerson, c.city].filter(Boolean).join(' · ')}
                              </p>
                            )}
                          </div>
                          {isSelected && <Check className="h-3.5 w-3.5 shrink-0 text-safend-red" />}
                        </button>
                      );
                    })
                  )}
                </div>
                {regularClients.length > 0 && (
                  <p className="border-t px-3 py-1.5 text-[10px] text-muted-foreground">
                    {regularClients.length} regular client{regularClients.length !== 1 ? 's' : ''}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* GST */}
        <div className="space-y-2">
          <Label htmlFor="clientGst">Client GST Number *</Label>
          <div className="relative">
            <input
              id="clientGst"
              name="clientGst"
              value={isNoGst ? '' : formData.clientGst}
              onChange={(e) => {
                const upper = e.target.value.toUpperCase();
                const syntheticEvent = { ...e, target: { ...e.target, value: upper, name: 'clientGst' } } as React.ChangeEvent<HTMLInputElement>;
                handleChange(syntheticEvent);
                setGstFetched(false);
                setGstError("");
                if (upper.trim().length === 15) autoFetchGst(upper.trim());
              }}
              placeholder={isNoGst ? `No GST — ${noGstReason}` : "e.g. 22AAAAA0000A1Z5"}
              className={`flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm font-mono uppercase shadow-xs transition-colors pr-24 focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring ${gstFetched ? 'border-green-500' : ''} ${isNoGst ? 'placeholder:text-orange-500 placeholder:font-sans placeholder:not-italic placeholder:text-xs' : ''}`}
              maxLength={15}
              disabled={isNoGst}
            />
            {gstLoading && <Loader2 className="absolute right-22 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />}
            {gstFetched && !gstLoading && <CheckCircle2 className="absolute right-22 top-1/2 -translate-y-1/2 h-4 w-4 text-green-600" />}

            <div ref={noGstRef} className="absolute right-1 top-1/2 -translate-y-1/2">
              <button
                type="button"
                onClick={() => {
                  if (isNoGst) { handleSelectChange('', 'clientGst'); setGstFetched(false); setGstError(''); setNoGstOpen(false); }
                  else setNoGstOpen(prev => !prev);
                }}
                className={`flex items-center gap-1 rounded px-2 py-1 text-[11px] font-semibold transition-colors ${isNoGst ? 'bg-orange-100 text-orange-600 hover:bg-orange-200 border border-orange-300' : 'bg-gray-100 text-gray-600 hover:bg-gray-200 border border-gray-200'}`}
                title={isNoGst ? 'Click to re-enter a GST number' : 'Client has no GST number'}
              >
                {isNoGst ? <><Ban className="h-3 w-3" /> No GST</> : <>No GST <ChevronDown className="h-3 w-3" /></>}
              </button>
              {noGstOpen && !isNoGst && (
                <div className="absolute right-0 top-full mt-1 z-50 w-56 rounded-md border bg-white dark:bg-gray-900 shadow-lg py-1">
                  <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground border-b">Reason (GST still charged)</p>
                  {NO_GST_REASONS.map((reason) => (
                    <button key={reason.value} type="button"
                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                      onClick={() => { handleSelectChange(`${NO_GST_PREFIX}${reason.value}`, 'clientGst'); setGstFetched(false); setGstError(''); setNoGstOpen(false); }}
                    >{reason.label}</button>
                  ))}
                </div>
              )}
            </div>
          </div>
          {gstError && <p className="text-xs text-red-500">{gstError}</p>}
          {gstFetched && !isNoGst && (
            <p className={`text-xs font-medium ${gstStatus?.toLowerCase() === 'active' ? 'text-green-600' : 'text-orange-600'}`}>
              GSTIN Status: {gstStatus || 'Unknown'}
            </p>
          )}
          {isNoGst && (
            <p className="text-xs text-orange-600 font-medium flex items-center gap-1">
              <Ban className="h-3 w-3" />No GST — {noGstReason}. GST will still be charged on all transactions.
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="client">Client Name *</Label>
          <Input id="client" name="client" value={formData.client} onChange={handleChange} placeholder="Enter client name" required />
        </div>

        <div className="space-y-2">
          <Label htmlFor="contactPerson">Contact Person *</Label>
          <Input id="contactPerson" name="contactPerson" value={formData.contactPerson} onChange={handleChange} placeholder="Enter contact person" />
        </div>

        <div className="space-y-2">
          <Label htmlFor="contactPhone">Contact Phone *</Label>
          <Input id="contactPhone" name="contactPhone" value={formData.contactPhone} onChange={handleChange} placeholder="Enter contact phone" />
        </div>

        <div className="space-y-2">
          <Label htmlFor="contactEmail">Contact Email</Label>
          <Input id="contactEmail" name="contactEmail" type="email" value={formData.contactEmail} onChange={handleChange} placeholder="Enter contact email" />
        </div>
      </div>

      {/* ─── Section 2: Billing Details ─── */}
      <div className="space-y-4">
        <h4 className="text-sm font-bold text-muted-foreground uppercase tracking-wider border-b pb-2">Billing Details</h4>

        <div className="space-y-2">
          <Label htmlFor="address">Billing Address *</Label>
          <Textarea id="address" name="address" value={formData.address} onChange={handleChange} placeholder="Enter billing address" rows={4} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="city">City</Label>
          <Input id="city" name="city" value={formData.city} onChange={handleChange} placeholder="City" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="state">State</Label>
            <Input id="state" name="state" value={formData.state} onChange={handleChange} placeholder="State" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pincode">PIN Code</Label>
            <Input id="pincode" name="pincode" value={formData.pincode} onChange={handleChange} placeholder="PIN Code" />
          </div>
        </div>

        {/* ── Billing rate basis ─────────────────────────────────────────────
            This is a contractual invoicing rule, not a service-rate input. It
            tells invoicing how to turn an agreed monthly price into a per-duty
            rate and is saved with the work order for every later invoice. */}
        <div className="space-y-2 pt-2">
          <div className="space-y-1">
            <Label htmlFor="rateBasis">
              Billing Rate Basis <span className="text-red-500">*</span>
              <span className="text-muted-foreground font-normal"> — as agreed with the client</span>
            </Label>
            <p className="text-[11px] text-muted-foreground">
              This does not change the <strong>Rate (₹/mo)</strong> under Security Posts. It defines how the agreed monthly price becomes a per-duty invoice rate and is saved on this Work Order.
            </p>
          </div>
          <Select
            value={formData.rateBasis || ''}
            onValueChange={(v) => handleSelectChange(v, 'rateBasis')}
          >
            <SelectTrigger id="rateBasis">
              <SelectValue placeholder="Select the billing rule agreed with the client" />
            </SelectTrigger>
            <SelectContent>
              {RATE_BASIS_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                  <span className="ml-1.5 text-[11px] text-muted-foreground">· {o.hint}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {formData.rateBasis === 'calendar_month' && (
            <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-[11px] text-blue-900">
              <strong>Invoice calculation:</strong> monthly price ÷ the actual number of days in that billed month. For example, ₹30,000 bills at ₹1,000 per duty in a 30-day month and ₹967.74 in a 31-day month.
            </div>
          )}

          {formData.rateBasis === 'fixed_days' && (
            <div className="space-y-2 rounded-md border border-blue-200 bg-blue-50 p-3">
              <p className="text-[11px] text-blue-900">
                <strong>Invoice calculation:</strong> monthly price ÷ the exact number of days agreed in the contract, regardless of the calendar month. Duties beyond that figure bill at the same per-duty rate.
              </p>
              <div className="space-y-1">
                <Label htmlFor="basisDays" className="text-xs">Agreed billing days per month <span className="text-red-500">*</span></Label>
                <Input
                  id="basisDays"
                  name="basisDays"
                  type="number"
                  min={1}
                  max={31}
                  step={1}
                  value={formData.basisDays ?? ''}
                  onChange={handleChange}
                  placeholder={`e.g. ${CONVENTIONAL_BASIS_DAYS}`}
                />
                <p className="text-[11px] text-muted-foreground">Enter the client-approved divisor, commonly {CONVENTIONAL_BASIS_DAYS} days. This value is required before the Work Order can be saved.</p>
              </div>
            </div>
          )}

          {formData.rateBasis === 'per_duty' && (
            <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-[11px] text-blue-900">
              <strong>Invoice calculation:</strong> the agreed price is already a per-duty rate, so no monthly divisor is applied. Use this only when the contract explicitly quotes a per-duty amount.
            </div>
          )}

          {!formData.rateBasis && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
              Select the contractual billing rule before saving. This prevents Safend from guessing a divisor and ensures future invoices use the client-approved rate.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
