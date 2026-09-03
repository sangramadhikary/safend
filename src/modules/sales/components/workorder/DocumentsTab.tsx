'use client';

import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  FileText, Download, Upload, Loader2, CheckCircle2,
  Layers, AlignJustify, ExternalLink, ClipboardList,
  Calendar, FileCheck, AlertCircle, ChevronDown, ChevronRight,
  Building2,
} from "lucide-react";
import { IndianRupee } from "@/components/icons/IndianRupee";

export type WorkOrderUploadMode = 'unified' | 'per-post';

/** Statuses offered in the Status select (termination states are driven by their own flow) */
const STATUS_OPTIONS = [
  'Draft', 'Pending', 'Scheduled', 'Active', 'In Progress', 'Completed', 'On Hold', 'Cancelled',
];

function sumPerPostValues(d: Record<string, { value?: string }>): number {
  return Object.values(d).reduce((s, v) => s + (parseFloat(v.value || '0') || 0), 0);
}
function fmtINR(n: number) { return `₹${n.toLocaleString('en-IN')}`; }

interface PerPostDetail {
  startDate?: string;
  endDate?: string;
  value?: string;
  quotationRef?: string;
  documentUrl?: string;
}

export type PerPostDetailField = 'startDate' | 'endDate' | 'value' | 'quotationRef';

interface DocumentsTabProps {
  formData: {
    id: string; status: string; clientWoRef: string;
    quotationRef: string; agreementRef: string;
    startDate: string; endDate: string; value: string;
    documentUrl: string; clientApproval: string;
    /** Display Customer ID (SF<seq>-YYMMDD, e.g. SF01-260801) — blank until the customer exists */
    customerId?: string;
    client?: string;
    clientApprovalMode?: WorkOrderUploadMode;
    clientApprovalPerPost?: Record<string, string>;
    clientWoRefPerPost?: Record<string, string>;
    perPostDetails?: Record<string, PerPostDetail>;
    /** The Work Order ID reserved for each post, keyed by post index */
    perPostWorkOrderIds?: Record<string, string>;
  };
  locations?: Array<{ name?: string }>;
  /** True when an existing work order is being edited rather than created */
  isEditing?: boolean;
  handleChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  handleSelectChange: (value: string, name: string) => void;
  handleFileUpload: (field: string) => void;
  handlePerPostUpload: (postIndex: number) => void;
  onModeChange: (mode: WorkOrderUploadMode) => void;
  onWoNumberChange: (postIndex: number, value: string) => void;
  onPerPostDetailChange: (postIndex: number, field: PerPostDetailField, value: string) => void;
  onGeneratePdf?: () => Promise<string | null>;
  /** Generate a WO PDF scoped to a single post (per-post mode) */
  onGeneratePostPdf?: (postIndex: number) => Promise<string | null>;
  /** Monthly value of each post's services (before GST), keyed by post index */
  postMonthlyValues?: Record<string, number>;
}

/** Contract length used to turn a post's monthly value into its work order value */
const CONTRACT_MONTHS = 12;

export function DocumentsTab({
  formData,
  locations = [],
  isEditing = false,
  handleChange,
  handleSelectChange,
  handleFileUpload,
  handlePerPostUpload,
  onModeChange,
  onWoNumberChange,
  onPerPostDetailChange,
  onGeneratePdf,
  onGeneratePostPdf,
  postMonthlyValues = {},
}: DocumentsTabProps) {
  const [generating, setGenerating] = useState(false);
  const [generatingPost, setGeneratingPost] = useState<number | null>(null);
  const [generatingAll, setGeneratingAll] = useState(false);
  // Post cards start collapsed — expand the ones you're working on
  const [expandedPosts, setExpandedPosts] = useState<Set<number>>(new Set());

  const togglePost = (idx: number) => {
    setExpandedPosts(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  };

  const mode: WorkOrderUploadMode = formData.clientApprovalMode ?? 'unified';
  const perPost = formData.clientApprovalPerPost ?? {};
  const perPostWoRefs = formData.clientWoRefPerPost ?? {};
  const perPostDetails = formData.perPostDetails ?? {};
  const perPostIds = formData.perPostWorkOrderIds ?? {};
  const unifiedDocUrl = formData.clientApproval || '';
  const uploadedCount = Object.keys(perPost).filter(k => perPost[k]).length;
  const refsCount = Object.keys(perPostWoRefs).filter(k => perPostWoRefs[k]).length;
  const total = sumPerPostValues(perPostDetails);

  const handleGenerate = async () => {
    if (!onGeneratePdf) return;
    setGenerating(true);
    try { await onGeneratePdf(); } finally { setGenerating(false); }
  };

  // One PDF per post, downloaded one after another
  const handleGenerateAllPosts = async () => {
    if (!onGeneratePostPdf || locations.length === 0) return;
    setGeneratingAll(true);
    try {
      for (let i = 0; i < locations.length; i++) {
        setGeneratingPost(i);
        await onGeneratePostPdf(i);
      }
    } finally {
      setGeneratingPost(null);
      setGeneratingAll(false);
    }
  };

  // Statuses always include whatever the record currently holds (e.g. Terminated)
  const statusOptions = Array.from(new Set([...STATUS_OPTIONS, formData.status].filter(Boolean)));

  // Reusable: shows existing doc or upload prompt
  const DocRow = ({ url, label, onReplace }: { url: string; label: string; onReplace: () => void }) =>
    url ? (
      <div className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 dark:border-emerald-800/40 dark:bg-emerald-900/20 px-3 py-2.5">
        <FileCheck className="h-4 w-4 shrink-0 text-emerald-600" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">{label}</p>
          <a href={url} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[11px] text-blue-600 hover:underline mt-0.5">
            View document <ExternalLink className="h-3 w-3" />
          </a>
        </div>
        <Button type="button" variant="outline" size="sm"
          className="h-7 text-xs shrink-0 border-emerald-300 text-emerald-700 hover:bg-emerald-100"
          onClick={onReplace}>
          <Upload className="h-3 w-3 mr-1" />Replace
        </Button>
      </div>
    ) : (
      <button type="button" onClick={onReplace}
        className="flex w-full items-center justify-center gap-2 h-10 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 text-sm text-muted-foreground hover:border-blue-400 hover:text-blue-600 transition-colors">
        <Upload className="h-4 w-4" />Choose file to upload
      </button>
    );

  return (
    <div className="space-y-5">

      {/* ── 1. Identity — the customer is the anchor ─────────────────────────── */}
      <section className="rounded-xl border bg-card shadow-xs overflow-hidden">
        <div className="flex items-center gap-2 border-b bg-muted/30 px-5 py-3">
          <Building2 className="h-4 w-4 text-safend-red" />
          <h4 className="text-sm font-semibold">Customer &amp; Work Order Identity</h4>
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-4 p-5">
          {/* Customer ID: what every work order for this client hangs off */}
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Customer ID</Label>
            <Input
              value={formData.customerId || ''}
              readOnly disabled
              placeholder="Assigned when saved"
              className="h-9 bg-muted cursor-not-allowed font-mono text-sm"
            />
            <p className="text-[11px] text-muted-foreground pt-0.5">
              {formData.customerId
                ? `${formData.client || 'This client'} — every work order below is linked to this customer.`
                : 'A new customer will be created for this client when you save.'}
            </p>
          </div>

          {/* One work order, or one per post — never a parent with children */}
          {mode === 'unified' ? (
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Work Order ID</Label>
              <Input value={formData.id} readOnly disabled
                className="h-9 bg-muted cursor-not-allowed font-mono text-sm" />
              <p className="text-[11px] text-muted-foreground pt-0.5">
                One work order covering {locations.length || 'all'} post{locations.length === 1 ? '' : 's'}.
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Work Orders</Label>
              <div className="flex min-h-9 flex-wrap items-center gap-1.5 rounded-md border bg-muted px-3 py-1.5">
                {locations.length === 0 ? (
                  <span className="text-xs text-muted-foreground">No posts added yet</span>
                ) : (
                  locations.map((_, idx) => (
                    <Badge key={idx} variant="outline" className="bg-background font-mono text-[10px]">
                      {perPostIds[String(idx)] || '…'}
                    </Badge>
                  ))
                )}
              </div>
              <p className="text-[11px] text-muted-foreground pt-0.5">
                {locations.length > 0
                  ? `${locations.length} separate work order${locations.length === 1 ? '' : 's'} — one per post, each linked to this customer.`
                  : 'Add security posts to reserve a work order for each.'}
              </p>
            </div>
          )}

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Status</Label>
            <Select value={formData.status} onValueChange={v => handleSelectChange(v, 'status')}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Select status" /></SelectTrigger>
              <SelectContent>
                {statusOptions.map(s => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground pt-0.5">
              {formData.status === 'Completed'
                ? 'Completed moves this work order to the agreement stage.'
                : 'Draft keeps it editable and out of the agreement stage.'}
            </p>
          </div>
        </div>
      </section>

      {/* ── 2. Generate PDF — unified only; per-post PDFs live on each post ─── */}
      {mode === 'unified' && (
        <section className="rounded-xl border bg-card shadow-xs overflow-hidden">
          <div className="flex items-center gap-2 border-b bg-muted/30 px-5 py-3">
            <FileText className="h-4 w-4 text-safend-red" />
            <div>
              <h4 className="text-sm font-semibold">Generate Work Order PDF</h4>
              <p className="text-[11px] text-muted-foreground">Create a formatted PDF for the client to sign and return</p>
            </div>
          </div>
          <div className="p-5">
            <Button type="button" onClick={handleGenerate} disabled={generating}
              className="bg-safend-red hover:bg-red-700 text-white">
              {generating
                ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Generating…</>
                : <><FileText className="h-4 w-4 mr-2" />Generate PDF</>}
            </Button>
            {formData.documentUrl && (
              <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                Previously generated —{' '}
                <a href={formData.documentUrl} target="_blank" rel="noopener noreferrer"
                  className="text-blue-600 hover:underline flex items-center gap-0.5">
                  view <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── 3. Upload Signed Work Order ─────────────────────────────────────── */}
      <section className="rounded-xl border bg-card shadow-xs overflow-hidden">
        {/* Header + toggle */}
        <div className="flex items-center justify-between border-b bg-muted/30 px-5 py-3">
          <div className="flex items-center gap-2">
            <Upload className="h-4 w-4 text-blue-600" />
            <div>
              <h4 className="text-sm font-semibold">Upload Signed Work Order</h4>
              <p className="text-[11px] text-muted-foreground">Upload the signed document received from the client</p>
            </div>
          </div>
          <div className="flex items-center gap-0.5 p-0.5 bg-gray-100 dark:bg-gray-800 rounded-lg">
            <button type="button" onClick={() => onModeChange('unified')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all
                ${mode === 'unified' ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-xs' : 'text-muted-foreground hover:text-foreground'}`}>
              <AlignJustify className="h-3.5 w-3.5" />Unified
            </button>
            <button type="button" onClick={() => onModeChange('per-post')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all
                ${mode === 'per-post' ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-xs' : 'text-muted-foreground hover:text-foreground'}`}>
              <Layers className="h-3.5 w-3.5" />Per Post
            </button>
          </div>
        </div>

        <div className="p-5 space-y-5">

          {/* ── UNIFIED ──────────────────────────────────────────────────────── */}
          {mode === 'unified' && (
            <>
              <p className="text-xs text-muted-foreground">
                Client signed one document covering all posts. Fill in the details below and upload it.
              </p>

              {/* Per-post data is preserved, just not used while Unified is active */}
              {(uploadedCount > 0 || refsCount > 0) && (
                <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800/40 dark:bg-blue-900/20 p-3">
                  <AlertCircle className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
                  <p className="text-xs text-blue-700 dark:text-blue-400">
                    Per-post details are still on file and will be kept — switch back to{' '}
                    <strong>Per Post</strong> any time. Only the unified document is used while this mode is active.
                  </p>
                </div>
              )}

              {/* WO details for this document */}
              <div className="grid grid-cols-2 gap-x-5 gap-y-4">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground flex items-center gap-1">
                    <Calendar className="h-3 w-3" />Start Date *
                  </Label>
                  <Input id="startDate" name="startDate" type="date"
                    value={formData.startDate} onChange={handleChange} required className="h-9" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground flex items-center gap-1">
                    <Calendar className="h-3 w-3" />End Date
                  </Label>
                  <Input id="endDate" name="endDate" type="date"
                    value={formData.endDate} onChange={handleChange} className="h-9" />
                </div>
                <div className="col-span-2 space-y-1">
                  <Label className="text-xs text-muted-foreground flex items-center gap-1">
                    <IndianRupee className="h-3 w-3" />Contract Value (₹) *
                  </Label>
                  <Input id="value" name="value" value={formData.value}
                    onChange={handleChange} placeholder="e.g. 125000" className="h-9" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Quotation Ref</Label>
                  <Input id="quotationRef" name="quotationRef" value={formData.quotationRef}
                    onChange={handleChange} placeholder="e.g. QT-2026-0042" className="h-9" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Agreement Ref</Label>
                  <Input id="agreementRef" name="agreementRef" value={formData.agreementRef}
                    onChange={handleChange} placeholder="e.g. AGR-2026-0012" className="h-9" />
                </div>
                <div className="col-span-2 space-y-1">
                  <Label className="text-xs text-muted-foreground">Client WO Reference No.</Label>
                  <Input id="clientWoRef" name="clientWoRef" value={formData.clientWoRef}
                    onChange={handleChange}
                    placeholder="WO reference number on the client's signed document"
                    className="h-9 font-mono" />
                </div>
              </div>

              {/* Upload */}
              <div className="pt-1">
                <DocRow
                  url={unifiedDocUrl}
                  label="Signed work order uploaded"
                  onReplace={() => handleFileUpload('clientApproval')}
                />
              </div>
            </>
          )}

          {/* ── PER POST ─────────────────────────────────────────────────────── */}
          {mode === 'per-post' && (
            <>
              {/* Saving in this mode writes one work order per post, so say so
                  plainly before it happens — especially when editing. */}
              {locations.length > 0 && (
                <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800/40 dark:bg-blue-900/20 p-3">
                  <Layers className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
                  <p className="text-xs text-blue-700 dark:text-blue-400">
                    Saving will {isEditing ? 'split this into' : 'create'}{' '}
                    <strong>{locations.length} separate work order{locations.length === 1 ? '' : 's'}</strong>
                    {' '}— one per post, each linked to{' '}
                    {formData.customerId
                      ? <strong>{formData.customerId}</strong>
                      : 'this customer'}
                    {isEditing && '. The work order you opened becomes the first post; the rest are created alongside it'}.
                  </p>
                </div>
              )}

              <div className="flex items-start justify-between gap-3">
                <p className="text-xs text-muted-foreground">
                  Client signed a separate document for each post — each post gets its own Work Order ID,
                  its own PDF and its own signed copy.
                </p>
                {onGeneratePostPdf && locations.length > 0 && (
                  <Button type="button" variant="outline" size="sm"
                    className="h-8 px-3 text-xs shrink-0"
                    disabled={generatingAll || generatingPost !== null}
                    onClick={handleGenerateAllPosts}>
                    {generatingAll
                      ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Generating…</>
                      : <><Download className="h-3.5 w-3.5 mr-1.5" />Generate all {locations.length} PDFs</>}
                  </Button>
                )}
              </div>

              {/* Unified doc is preserved, just not used while Per Post is active */}
              {unifiedDocUrl && (
                <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800/40 dark:bg-blue-900/20 p-3">
                  <AlertCircle className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
                  <p className="text-xs text-blue-700 dark:text-blue-400">
                    A unified signed document is still on file and will be kept —{' '}
                    <a href={unifiedDocUrl} target="_blank" rel="noopener noreferrer" className="underline">view it</a>.
                    Only the per-post documents are used while this mode is active.
                  </p>
                </div>
              )}

              {/* Computed totals badge */}
              {total > 0 && (
                <div className="flex flex-wrap gap-3 text-xs">
                  <Badge variant="outline" className="text-blue-600 border-blue-300 bg-blue-50 dark:bg-blue-900/20 gap-1">
                    <IndianRupee className="h-3 w-3" />Total {fmtINR(total)}
                  </Badge>
                  {formData.startDate && (
                    <Badge variant="outline" className="text-blue-600 border-blue-300 bg-blue-50 dark:bg-blue-900/20 gap-1">
                      <Calendar className="h-3 w-3" />{formData.startDate} → {formData.endDate || '…'}
                    </Badge>
                  )}
                </div>
              )}

              {locations.length === 0 ? (
                <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800/40 dark:bg-amber-900/20 p-3">
                  <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    Add security posts in the <strong>Security Posts</strong> tab first, then come back here to fill in each post's details.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {locations.map((loc, idx) => {
                    const postName = loc.name?.trim() || `Post ${idx + 1}`;
                    const uploadedUrl = perPost[String(idx)] || '';
                    const woRef = perPostWoRefs[String(idx)] ?? '';
                    const detail = perPostDetails[String(idx)] ?? {};
                    const postId = perPostIds[String(idx)] ?? '';
                    const isComplete = !!uploadedUrl && !!woRef;
                    // Started but not finished — tells the user exactly what is missing
                    const isPartial = !isComplete && (!!uploadedUrl || !!woRef);
                    const missing = [!uploadedUrl && 'signed document', !woRef && "client's WO ref"]
                      .filter(Boolean).join(' and ');
                    const isExpanded = expandedPosts.has(idx);
                    const monthly = postMonthlyValues[String(idx)] || 0;
                    const suggestedValue = monthly > 0 ? String(monthly * CONTRACT_MONTHS) : '';
                    const currentValue = detail.value ?? '';

                    return (
                      <div key={idx} className={`rounded-xl border overflow-hidden transition-colors ${
                        isComplete ? 'border-emerald-200 dark:border-emerald-800/40'
                          : isPartial ? 'border-amber-200 dark:border-amber-800/40'
                          : 'border-border'
                      }`}>
                        {/* Post header — click to expand / collapse */}
                        <button type="button"
                          onClick={() => togglePost(idx)}
                          aria-expanded={isExpanded}
                          aria-controls={`post-panel-${idx}`}
                          className={`w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left transition-colors hover:brightness-[0.98] ${
                            isComplete ? 'bg-emerald-50 dark:bg-emerald-900/20'
                              : isPartial ? 'bg-amber-50 dark:bg-amber-900/20'
                              : 'bg-muted/40'
                          }`}>
                          <div className="flex items-center gap-2 min-w-0">
                            {isExpanded
                              ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                              : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
                            {isComplete
                              ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                              : isPartial
                                ? <AlertCircle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                                : <div className="h-3.5 w-3.5 rounded-full border-2 border-muted-foreground/40 shrink-0" />}
                            <p className="text-sm font-medium truncate">{postName}</p>
                            {postId && (
                              <Badge variant="outline" className="shrink-0 font-mono text-[10px] px-1.5 py-0">
                                {postId}
                              </Badge>
                            )}
                          </div>

                          {/* Collapsed summary so the card is useful shut */}
                          <div className="flex items-center gap-3 shrink-0 text-[11px] text-muted-foreground">
                            {generatingPost === idx && (
                              <span className="inline-flex items-center gap-1">
                                <Loader2 className="h-3 w-3 animate-spin" />Generating PDF…
                              </span>
                            )}
                            {currentValue && <span className="font-mono">{fmtINR(Number(currentValue) || 0)}</span>}
                            {detail.startDate && (
                              <span className="hidden sm:inline">{detail.startDate}{detail.endDate ? ` → ${detail.endDate}` : ''}</span>
                            )}
                            {uploadedUrl && (
                              <span className="inline-flex items-center gap-1 text-blue-600">
                                <FileCheck className="h-3 w-3" />Signed
                              </span>
                            )}
                          </div>
                        </button>

                        {isPartial && (
                          <p className="px-4 pt-2 text-[11px] text-amber-700 dark:text-amber-400">
                            Still needs the {missing}.
                          </p>
                        )}

                        {/* Post fields */}
                        <div id={`post-panel-${idx}`} hidden={!isExpanded} className="px-4 py-3 space-y-3">

                          {/* Per-post Work Order ID — system-generated, read-only */}
                          <div className="space-y-1">
                            <Label className="text-[11px] text-muted-foreground flex items-center gap-1">
                              <ClipboardList className="h-3 w-3" />Work Order ID for this post
                            </Label>
                            <Input
                              type="text"
                              value={postId}
                              readOnly
                              disabled
                              className="h-8 bg-muted cursor-not-allowed font-mono text-xs"
                              placeholder="Auto-generated"
                            />
                          </div>

                          {/* Start / End / Value */}
                          <div className="grid grid-cols-3 gap-3">
                            <div className="space-y-1">
                              <Label className="text-[11px] text-muted-foreground flex items-center gap-1">
                                <Calendar className="h-3 w-3" />Start Date
                              </Label>
                              <Input type="date" value={detail.startDate ?? ''}
                                onChange={e => onPerPostDetailChange(idx, 'startDate', e.target.value)}
                                className="h-8 text-xs" />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[11px] text-muted-foreground flex items-center gap-1">
                                <Calendar className="h-3 w-3" />End Date
                              </Label>
                              <Input type="date" value={detail.endDate ?? ''}
                                onChange={e => onPerPostDetailChange(idx, 'endDate', e.target.value)}
                                className="h-8 text-xs" />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[11px] text-muted-foreground flex items-center gap-1">
                                <IndianRupee className="h-3 w-3" />Value (₹)
                              </Label>
                              <Input type="text" placeholder="0" value={currentValue}
                                onChange={e => onPerPostDetailChange(idx, 'value', e.target.value.replace(/[^\d]/g, ''))}
                                className="h-8 text-xs font-mono" />
                            </div>
                          </div>

                          {/* Auto-filled from this post's services: monthly × 12 */}
                          {monthly > 0 && (
                            <p className="text-[11px] text-muted-foreground -mt-1">
                              {fmtINR(monthly)}/month × {CONTRACT_MONTHS} months = {fmtINR(monthly * CONTRACT_MONTHS)}
                              {' '}(excl. GST)
                              {currentValue !== suggestedValue && (
                                <button type="button"
                                  onClick={() => onPerPostDetailChange(idx, 'value', suggestedValue)}
                                  className="ml-2 text-blue-600 hover:underline">
                                  use this
                                </button>
                              )}
                            </p>
                          )}

                          <div className="space-y-1">
                            <Label className="text-[11px] text-muted-foreground">Quotation Ref</Label>
                            <Input
                              id={`quotationRef-${idx}`}
                              type="text"
                              value={detail.quotationRef ?? ''}
                              onChange={e => onPerPostDetailChange(idx, 'quotationRef', e.target.value)}
                              placeholder={formData.quotationRef || 'e.g. QT-2026-0042'}
                              className="h-8 text-xs"
                            />
                          </div>

                          <div className="flex items-center gap-2">
                            <Input
                              type="text"
                              placeholder="Client WO Ref No. for this post"
                              value={woRef}
                              onChange={e => onWoNumberChange(idx, e.target.value)}
                              className="flex-1 font-mono text-xs h-9"
                            />
                            <Button type="button" size="sm"
                              variant={uploadedUrl ? 'outline-solid' : 'secondary'}
                              className="h-9 px-3 text-xs shrink-0"
                              onClick={() => handlePerPostUpload(idx)}>
                              <Upload className="h-3.5 w-3.5 mr-1.5" />
                              {uploadedUrl ? 'Replace' : 'Upload'}
                            </Button>
                          </div>

                          {/* This post's generated WO PDF, produced by "Generate all PDFs" */}
                          {detail.documentUrl && (
                            <div className="border-t pt-3">
                              <a href={detail.documentUrl} target="_blank" rel="noopener noreferrer"
                                className="text-[11px] text-blue-600 hover:underline inline-flex items-center gap-1">
                                <Download className="h-3 w-3" />Generated PDF for this post
                              </a>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {/* Summary strip */}
                  <div className="flex flex-wrap items-center gap-3 rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                    <span className={`flex items-center gap-1 font-medium ${uploadedCount === locations.length ? 'text-emerald-600' : ''}`}>
                      <FileCheck className="h-3.5 w-3.5" />
                      {uploadedCount} / {locations.length} uploaded
                    </span>
                    {refsCount > 0 && (
                      <span>{refsCount} WO ref{refsCount !== 1 ? 's' : ''} entered</span>
                    )}
                    {total > 0 && (
                      <span className="font-medium text-foreground">{fmtINR(total)} total</span>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </section>
    </div>
  );
}
