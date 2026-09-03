'use client';

import { useState } from 'react';
import { useClientProfile, useClientInvoices, useClientPosts } from '../hooks/useClientData';
import { getSupabaseClient } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { VirtualList } from '@/components/ui/virtual-list';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle
} from '@/components/ui/dialog';
import {
  Search, Download, FileText, AlertTriangle
} from 'lucide-react';

interface Invoice {
  id: string;
  category: string;
  description: string;
  client_name: string;
  amount: number;
  gst_amount: number | null;
  total_amount: number;
  due_date: string | null;
  status: string;
  reference_number: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  /** Proper DB column — 'cgst_sgst' | 'igst' | 'exempt'. Replaces notes string-sniffing. */
  gst_type?: 'cgst_sgst' | 'igst' | 'exempt' | null;
  place_of_supply?: string | null;
}

export default function ClientInvoices() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: profile } = useClientProfile();
  const { data: invoices, isLoading } = useClientInvoices(profile?.client_name);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [disputeInvoice, setDisputeInvoice] = useState<Invoice | null>(null);
  const [disputeReason, setDisputeReason] = useState('');
  const [submittingDispute, setSubmittingDispute] = useState(false);

  const filtered = (invoices || []).filter((inv: Invoice) => {
    const matchesSearch =
      !search ||
      inv.reference_number?.toLowerCase().includes(search.toLowerCase()) ||
      inv.description?.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' || inv.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // Check if dispute can be raised (within 3 days of issue)
  const canRaiseDispute = (inv: Invoice) => {
    const issueDate = new Date(inv.created_at);
    const now = new Date();
    const diffDays = (now.getTime() - issueDate.getTime()) / (1000 * 60 * 60 * 24);
    return diffDays <= 3 && inv.status !== 'cancelled';
  };

  // Parse description to get service name
  const getServiceName = (desc: string) => {
    const parts = desc.split(' | ');
    return parts[0] || '—';
  };

  // Get GST details — reads gst_type DB column; falls back to notes sniffing for legacy rows
  const getGstInfo = (inv: Invoice) => {
    const gst = inv.gst_amount || (inv.total_amount - inv.amount);
    if (!gst || gst <= 0) return null;
    const gstPct = inv.amount > 0 ? Math.round((gst / inv.amount) * 100) : 0;
    const isIGST = inv.gst_type
      ? inv.gst_type === 'igst'
      : (inv.notes || '').toLowerCase().includes('igst');
    return { amount: gst, pct: gstPct, isIGST };
  };

  // Handle download invoice (placeholder — triggers print or PDF generation)
  const handleDownload = (inv: Invoice) => {
    // Open a printable view or trigger PDF download
    const printContent = `
      Invoice: ${inv.reference_number || 'N/A'}
      Client: ${inv.client_name}
      Service: ${getServiceName(inv.description)}
      Amount: ₹${inv.amount?.toLocaleString('en-IN')}
      GST: ₹${(inv.gst_amount || 0).toLocaleString('en-IN')}
      Total: ₹${inv.total_amount?.toLocaleString('en-IN')}
      Due Date: ${inv.due_date ? new Date(inv.due_date).toLocaleDateString('en-IN') : 'N/A'}
      Status: ${inv.status}
      Issue Date: ${new Date(inv.created_at).toLocaleDateString('en-IN')}
    `;
    const blob = new Blob([printContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Invoice_${inv.reference_number || inv.id.slice(0, 8)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Handle raise dispute
  const handleRaiseDispute = async () => {
    if (!disputeInvoice || !disputeReason.trim() || !profile) return;
    setSubmittingDispute(true);
    try {
      const client = getSupabaseClient();
      // Create an incident of type "other" linked to the invoice
      const { error } = await client.from('client_incidents').insert({
        client_user_id: profile.id,
        client_name: profile.client_name,
        post_id: null,
        post_name: null,
        incident_type: 'other',
        severity: 'medium',
        title: `Invoice Dispute: ${disputeInvoice.reference_number || disputeInvoice.id.slice(0, 8)}`,
        description: `Dispute raised for Invoice #${disputeInvoice.reference_number || 'N/A'} (₹${disputeInvoice.total_amount.toLocaleString('en-IN')})\n\nReason: ${disputeReason}`,
      });
      if (error) throw error;

      setDisputeInvoice(null);
      setDisputeReason('');
      queryClient.invalidateQueries({ queryKey: ['client-incidents'] });
      toast({ title: 'Dispute submitted', description: 'Our team will review and get back to you within 2 business days.' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to submit dispute', variant: 'destructive' });
    } finally {
      setSubmittingDispute(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-10 w-full rounded-lg bg-gray-100" />
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-16 rounded-lg bg-gray-100" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search by invoice number or description..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {['all', 'pending', 'overdue', 'received', 'cancelled'].map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-2 text-xs font-medium rounded-lg border transition-colors capitalize ${
                statusFilter === s
                  ? 'bg-[#D71920] text-white border-[#D71920]'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-[#D71920]/50'
              }`}
            >
              {s === 'all' ? 'All' : s}
            </button>
          ))}
        </div>
      </div>

      {/* Invoice Table */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400 bg-white rounded-xl border border-gray-200">
          <FileText className="h-12 w-12 mb-3 opacity-40" />
          <p className="font-medium">No invoices found</p>
          <p className="text-sm mt-1">Invoices will appear here once generated</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          {/* Table Header */}
          <div className="hidden lg:grid grid-cols-[1fr_auto_1.5fr_1fr_1fr_1fr_1fr_auto] gap-3 px-4 py-3 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700 text-xs font-medium text-gray-500 uppercase tracking-wide">
            <span>Invoice No.</span>
            <span>Date</span>
            <span>Services</span>
            <span className="text-right">Amount</span>
            <span className="text-right">GST</span>
            <span className="text-right">Due Date</span>
            <span>Status</span>
            <span className="text-right">Actions</span>
          </div>

          {/* Rows — Virtualized for performance with large invoice lists */}
          <VirtualList
            items={filtered}
            height="calc(100vh - 320px)"
            estimateSize={72}
            overscan={10}
            getKey={(inv: Invoice) => inv.id}
            renderItem={(inv: Invoice) => {
              const gstInfo = getGstInfo(inv);
              const isOverdue = inv.status === 'overdue' ||
                (inv.status === 'pending' && inv.due_date && new Date(inv.due_date) < new Date());

              return (
                <div
                  onClick={() => setSelectedInvoice(inv)}
                  className={`grid grid-cols-1 lg:grid-cols-[1fr_auto_1.5fr_1fr_1fr_1fr_1fr_auto] gap-2 lg:gap-3 px-4 py-4 hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors cursor-pointer border-b border-gray-100 dark:border-gray-700 ${
                    isOverdue ? 'bg-red-50/50 dark:bg-red-950/10' : ''
                  }`}
                >
                  {/* Invoice No */}
                  <div className="font-medium text-gray-900 dark:text-white text-sm">
                    {inv.reference_number || '—'}
                  </div>

                  {/* Date */}
                  <div className="text-sm text-gray-500 tabular-nums whitespace-nowrap">
                    {new Date(inv.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </div>

                  {/* Services */}
                  <div className="text-sm text-gray-600 dark:text-gray-300 truncate">
                    {getServiceName(inv.description)}
                  </div>

                  {/* Amount */}
                  <div className="text-sm font-semibold text-gray-900 dark:text-white text-right tabular-nums">
                    ₹{inv.total_amount.toLocaleString('en-IN')}
                  </div>

                  {/* GST */}
                  <div className="text-right text-xs">
                    {gstInfo ? (
                      <div>
                        <span className="font-medium text-gray-700 dark:text-gray-300">
                          ₹{gstInfo.amount.toLocaleString('en-IN')}
                        </span>
                        <br />
                        <span className="text-gray-400">
                          {gstInfo.isIGST ? `IGST ${gstInfo.pct}%` : `CGST ${gstInfo.pct / 2}% + SGST ${gstInfo.pct / 2}%`}
                        </span>
                      </div>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </div>

                  {/* Due Date */}
                  <div className="text-sm text-right tabular-nums">
                    {inv.due_date ? (
                      <span className={isOverdue ? 'text-red-600 font-medium' : 'text-gray-500'}>
                        {new Date(inv.due_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </span>
                    ) : '—'}
                  </div>

                  {/* Status */}
                  <div>
                    <Badge className={`text-[10px] ${
                      inv.status === 'received' ? 'bg-green-100 text-green-700 border-green-200' :
                      isOverdue ? 'bg-red-100 text-red-700 border-red-200' :
                      inv.status === 'cancelled' ? 'bg-gray-100 text-gray-500 border-gray-200' :
                      'bg-amber-100 text-amber-700 border-amber-200'
                    }`}>
                      {isOverdue && inv.status === 'pending' ? 'overdue' : inv.status}
                    </Badge>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 justify-end" onClick={(e) => e.stopPropagation()}>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-green-600 hover:text-green-700 hover:bg-green-50"
                      onClick={() => handleDownload(inv)}
                      title="Download Invoice"
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                    {canRaiseDispute(inv) && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                        onClick={() => setDisputeInvoice(inv)}
                        title="Raise Dispute (within 3 days of issue)"
                      >
                        <AlertTriangle className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            }}
          />
        </div>
      )}

      {/* Summary */}
      {filtered.length > 0 && (
        <div className="flex items-center justify-between bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
          <span className="text-sm text-gray-500">
            Showing {filtered.length} invoice{filtered.length !== 1 ? 's' : ''}
          </span>
          <div className="text-sm font-semibold text-gray-900 dark:text-white">
            Total Outstanding: ₹
            {filtered
              .filter((i: Invoice) => i.status === 'pending' || i.status === 'overdue')
              .reduce((s: number, i: Invoice) => s + (i.total_amount || 0), 0)
              .toLocaleString('en-IN')}
          </div>
        </div>
      )}

      {/* ─── Invoice Detail Modal ─── */}
      <Dialog open={!!selectedInvoice} onOpenChange={() => setSelectedInvoice(null)}>
        <DialogContent className="max-w-5xl w-[95vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <FileText className="h-5 w-5 text-[#D71920]" />
              Invoice #{selectedInvoice?.reference_number || 'N/A'}
            </DialogTitle>
          </DialogHeader>
          {selectedInvoice && <InvoiceDetailContent invoice={selectedInvoice} onDownload={handleDownload} onDispute={() => { setSelectedInvoice(null); setDisputeInvoice(selectedInvoice); }} canDispute={canRaiseDispute(selectedInvoice)} />}
        </DialogContent>
      </Dialog>

      {/* ─── Raise Dispute Modal ─── */}
      <Dialog open={!!disputeInvoice} onOpenChange={() => { setDisputeInvoice(null); setDisputeReason(''); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              Raise Invoice Dispute
            </DialogTitle>
          </DialogHeader>
          {disputeInvoice && (
            <div className="space-y-4 pt-2">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <p className="text-sm font-medium text-amber-800">
                  Invoice #{disputeInvoice.reference_number || 'N/A'}
                </p>
                <p className="text-xs text-amber-600 mt-1">
                  Amount: ₹{disputeInvoice.total_amount.toLocaleString('en-IN')} · Issued: {new Date(disputeInvoice.created_at).toLocaleDateString('en-IN')}
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700">Reason for Dispute *</label>
                <textarea
                  value={disputeReason}
                  onChange={(e) => setDisputeReason(e.target.value)}
                  placeholder="Explain why you're disputing this invoice (incorrect amount, wrong service period, duplicate charge, etc.)"
                  required
                  rows={4}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm resize-none focus:outline-hidden focus:ring-2 focus:ring-amber-200 focus:border-amber-400"
                />
              </div>

              <p className="text-xs text-gray-400">
                Disputes must be raised within 3 days of invoice issue date. Our accounts team will review and respond within 2 business days.
              </p>

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => { setDisputeInvoice(null); setDisputeReason(''); }}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleRaiseDispute}
                  disabled={submittingDispute || !disputeReason.trim()}
                  className="flex-1 bg-amber-600 hover:bg-amber-700 text-white"
                >
                  {submittingDispute ? (
                    <div className="flex items-center gap-2">
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      Submitting...
                    </div>
                  ) : 'Submit Dispute'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function InfoField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">{label}</p>
      <div className="text-sm text-gray-900 dark:text-white mt-0.5">{value}</div>
    </div>
  );
}

/**
 * Parses the notes string from invoices.
 * Format: "Billing Period: 2026-05-01 to 2026-05-31 | GST: 0% | Services: Unarmed Guards: 2 duties"
 */
function parseInvoiceNotes(notes: string | null) {
  if (!notes) return {};
  const parts = notes.split(' | ').map((s) => s.trim());
  const parsed: Record<string, string> = {};
  parts.forEach((part) => {
    const colonIdx = part.indexOf(':');
    if (colonIdx > 0) {
      const key = part.slice(0, colonIdx).trim();
      const val = part.slice(colonIdx + 1).trim();
      parsed[key] = val;
    }
  });
  return parsed;
}

function InvoiceDetailContent({
  invoice,
  onDownload,
  onDispute,
  canDispute,
}: {
  invoice: Invoice;
  onDownload: (inv: Invoice) => void;
  onDispute: () => void;
  canDispute: boolean;
}) {
  const { data: profile } = useClientProfile();
  const { data: posts } = useClientPosts(profile?.post_ids);

  const gstInfo = (() => {
    const gst = invoice.gst_amount || (invoice.total_amount - invoice.amount);
    if (!gst || gst <= 0) return null;
    const gstPct = invoice.amount > 0 ? Math.round((gst / invoice.amount) * 100) : 0;
    // Use gst_type DB column; fall back to notes string sniffing for legacy rows
    const isIGST = invoice.gst_type
      ? invoice.gst_type === 'igst'
      : (invoice.notes || '').toLowerCase().includes('igst');
    return { amount: gst, pct: gstPct, isIGST };
  })();

  // Parse description: "PostName | Inv#: XXXX"
  const descParts = invoice.description.split(' | ');
  const postName = descParts[0] || '—';

  // Find the linked post
  const linkedPost = posts?.find((p: any) => p.post_name === postName || p.post_code === postName);

  // Parse notes for extra details
  const notesParsed = parseInvoiceNotes(invoice.notes);
  const billingPeriod = notesParsed['Billing Period'] || null;
  const gstFromNotes = notesParsed['GST'] || null;
  const servicesFromNotes = notesParsed['Services'] || null;

  const isOverdue = invoice.status === 'overdue' ||
    (invoice.status === 'pending' && invoice.due_date && new Date(invoice.due_date) < new Date());

  return (
    <div className="space-y-5 pt-2">
      {/* Status Banner */}
      <div className={`flex items-center justify-between p-3 rounded-lg border ${
        invoice.status === 'received' ? 'bg-green-50 border-green-200' :
        isOverdue ? 'bg-red-50 border-red-200' :
        invoice.status === 'cancelled' ? 'bg-gray-50 border-gray-200' :
        'bg-amber-50 border-amber-200'
      }`}>
        <div className="flex items-center gap-2">
          <Badge className={`text-xs ${
            invoice.status === 'received' ? 'bg-green-100 text-green-700 border-green-200' :
            isOverdue ? 'bg-red-100 text-red-700 border-red-200' :
            invoice.status === 'cancelled' ? 'bg-gray-100 text-gray-500 border-gray-200' :
            'bg-amber-100 text-amber-700 border-amber-200'
          }`}>
            {isOverdue && invoice.status === 'pending' ? 'OVERDUE' : invoice.status.toUpperCase()}
          </Badge>
          {invoice.status === 'received' && <span className="text-xs text-green-700">Payment received</span>}
          {isOverdue && <span className="text-xs text-red-600">Payment past due date</span>}
        </div>
        <span className="text-2xl font-bold text-gray-900">₹{invoice.total_amount.toLocaleString('en-IN')}</span>
      </div>

      {/* Two Column Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left Column: Invoice & Client Details */}
        <div className="space-y-5">
          {/* Invoice Information */}
          <Section title="Invoice Information">
            <div className="grid grid-cols-2 gap-3">
              <InfoField label="Invoice Number" value={invoice.reference_number || 'N/A'} />
              <InfoField label="Category" value={invoice.category} />
              <InfoField label="Issue Date" value={new Date(invoice.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} />
              <InfoField label="Due Date" value={invoice.due_date ? new Date(invoice.due_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A'} />
              {billingPeriod && <InfoField label="Billing Period" value={billingPeriod} />}
            </div>
          </Section>

          {/* Client Details */}
          <Section title="Client Details">
            <div className="grid grid-cols-2 gap-3">
              <InfoField label="Client Name" value={invoice.client_name || '—'} />
              {profile?.company_name && <InfoField label="Company" value={profile.company_name} />}
              {profile?.email && <InfoField label="Email" value={profile.email} />}
              {profile?.phone && <InfoField label="Phone" value={profile.phone} />}
            </div>
          </Section>

          {/* Post / Site Details */}
          <Section title="Post / Site Details">
            {linkedPost ? (
              <div className="grid grid-cols-2 gap-3">
                <InfoField label="Post Name" value={linkedPost.post_name || '—'} />
                <InfoField label="Post Code" value={linkedPost.post_code || '—'} />
                <InfoField label="Total Guards" value={linkedPost.total_guards?.toString() || '—'} />
                <InfoField label="Shift Type" value={linkedPost.shift_type || '—'} />
                <InfoField label="Post Status" value={
                  <Badge className={linkedPost.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}>
                    {linkedPost.status}
                  </Badge>
                } />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <InfoField label="Post/Site" value={postName} />
                {servicesFromNotes && <InfoField label="Services" value={servicesFromNotes} />}
              </div>
            )}
          </Section>
        </div>

        {/* Right Column: Financial Details */}
        <div className="space-y-5">
          {/* Service Details */}
          <Section title="Service Details">
            <div className="space-y-2">
              <InfoField label="Description" value={invoice.description} />
              {servicesFromNotes && <InfoField label="Service Type" value={servicesFromNotes} />}
              {billingPeriod && <InfoField label="Service Period" value={billingPeriod} />}
            </div>
          </Section>

          {/* GST Information */}
          <Section title="GST & Tax Information">
            <div className="space-y-2">
              {gstInfo ? (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <InfoField label="GST Rate" value={`${gstInfo.pct}%`} />
                    <InfoField label="GST Type" value={gstInfo.isIGST ? 'IGST (Inter-State)' : 'CGST + SGST (Intra-State)'} />
                    {!gstInfo.isIGST && (
                      <>
                        <InfoField label="CGST" value={`₹${(gstInfo.amount / 2).toLocaleString('en-IN')} (${gstInfo.pct / 2}%)`} />
                        <InfoField label="SGST" value={`₹${(gstInfo.amount / 2).toLocaleString('en-IN')} (${gstInfo.pct / 2}%)`} />
                      </>
                    )}
                    {gstInfo.isIGST && (
                      <InfoField label="IGST" value={`₹${gstInfo.amount.toLocaleString('en-IN')} (${gstInfo.pct}%)`} />
                    )}
                  </div>
                </>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <InfoField label="GST Rate" value={gstFromNotes || '0% (Exempt)'} />
                  <InfoField label="GST Amount" value="₹0.00" />
                </div>
              )}
              {linkedPost?.gst_number && <InfoField label="GSTIN" value={linkedPost.gst_number} />}
            </div>
          </Section>

          {/* Payment / Amount Breakdown */}
          <Section title="Payment Summary">
            <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Base Amount (Taxable)</span>
                <span className="font-medium tabular-nums">₹{invoice.amount.toLocaleString('en-IN')}</span>
              </div>
              {gstInfo && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">
                    GST ({gstInfo.isIGST ? `IGST ${gstInfo.pct}%` : `CGST ${gstInfo.pct / 2}% + SGST ${gstInfo.pct / 2}%`})
                  </span>
                  <span className="font-medium tabular-nums">₹{gstInfo.amount.toLocaleString('en-IN')}</span>
                </div>
              )}
              <div className="flex justify-between text-base pt-2 border-t border-dashed border-gray-300 dark:border-gray-600">
                <span className="font-bold text-gray-900 dark:text-white">Total Payable</span>
                <span className="font-bold text-gray-900 dark:text-white tabular-nums">₹{invoice.total_amount.toLocaleString('en-IN')}</span>
              </div>
              {invoice.status === 'received' && (
                <div className="flex justify-between text-sm pt-1">
                  <span className="text-green-600 font-medium">Amount Paid</span>
                  <span className="text-green-600 font-medium tabular-nums">₹{invoice.total_amount.toLocaleString('en-IN')}</span>
                </div>
              )}
              {(invoice.status === 'pending' || isOverdue) && (
                <div className="flex justify-between text-sm pt-1">
                  <span className={`font-medium ${isOverdue ? 'text-red-600' : 'text-amber-600'}`}>Balance Due</span>
                  <span className={`font-medium tabular-nums ${isOverdue ? 'text-red-600' : 'text-amber-600'}`}>₹{invoice.total_amount.toLocaleString('en-IN')}</span>
                </div>
              )}
            </div>
          </Section>

          {/* Debit/Credit Note info */}
          {invoice.category !== 'Invoices' && (
            <Section title="Note Details">
              <InfoField label="Type" value={invoice.category} />
              <InfoField label="Reference" value={invoice.reference_number || '—'} />
            </Section>
          )}
        </div>
      </div>

      {/* Notes */}
      {invoice.notes && (
        <Section title="Additional Notes">
          <p className="text-sm text-gray-600 dark:text-gray-300 whitespace-pre-wrap bg-gray-50 dark:bg-gray-800/30 p-3 rounded-lg border border-gray-100 dark:border-gray-700">
            {invoice.notes}
          </p>
        </Section>
      )}

      {/* Actions */}
      <div className="flex gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
        <Button
          onClick={() => onDownload(invoice)}
          className="flex-1 bg-green-600 hover:bg-green-700 text-white h-11"
        >
          <Download className="h-4 w-4 mr-2" />
          Download Invoice
        </Button>
        {canDispute ? (
          <Button
            variant="outline"
            onClick={onDispute}
            className="flex-1 border-amber-300 text-amber-700 hover:bg-amber-50 h-11"
          >
            <AlertTriangle className="h-4 w-4 mr-2" />
            Raise Dispute
          </Button>
        ) : invoice.status !== 'cancelled' && (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-xs text-gray-400">
              Dispute window expired (3 days from issue)
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
        <span className="h-px flex-1 bg-gray-200 dark:bg-gray-700" />
        {title}
        <span className="h-px flex-1 bg-gray-200 dark:bg-gray-700" />
      </h4>
      {children}
    </div>
  );
}
