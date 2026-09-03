'use client';
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Building2, User, Mail, Phone, MapPin, FileText, Calendar, IndianRupee,
  Clock, CheckCircle2, XCircle, PlayCircle, PauseCircle, AlertCircle,
  Shield, Users, ExternalLink, FileCheck, Navigation, Receipt, Briefcase,
  ClipboardList, Layers, FileClock, Hash, Fingerprint,
} from "lucide-react";
import { useAgreementsData } from "@/contexts/AgreementsDataContext";
import {
  distributePerPostValues,
  isGroupedPerPostRecord,
} from "../utils/workOrderRows";

interface WorkOrderDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  workOrder: any;
}

const SERVICE_LABELS: Record<string, string> = {
  unarmedGuards: 'Unarmed Guards', armedGuards: 'Armed Guards',
  supervisors: 'Supervisors', patrolOfficers: 'Patrol Officers',
  pso: 'PSO', bouncers: 'Bouncers', manpower: 'Manpower',
};
const SHIFT_LABELS: Record<string, string> = { day: 'Day', afternoon: 'Afternoon', night: 'Night' };

const getStatusConfig = (status: string) => {
  switch (status) {
    case "Draft":       return { color: "bg-gray-500",    icon: FileText,     textColor: "text-gray-500" };
    case "Scheduled":   return { color: "bg-blue-500",    icon: Clock,        textColor: "text-blue-500" };
    case "In Progress": return { color: "bg-amber-500",   icon: PlayCircle,   textColor: "text-amber-500" };
    case "Completed":   return { color: "bg-green-500",   icon: CheckCircle2, textColor: "text-green-500" };
    case "On Hold":     return { color: "bg-orange-500",  icon: PauseCircle,  textColor: "text-orange-500" };
    case "Cancelled":   return { color: "bg-red-500",     icon: XCircle,      textColor: "text-red-500" };
    default:            return { color: "bg-gray-500",    icon: AlertCircle,  textColor: "text-gray-500" };
  }
};

const formatDate = (date: any) => {
  if (!date) return "—";
  try {
    const d = date.toDate ? date.toDate() : new Date(date);
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return "—"; }
};

const formatDateTime = (date: any) => {
  if (!date) return "—";
  try {
    const d = date.toDate ? date.toDate() : new Date(date);
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return "—"; }
};

const fmtINR = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

const parseAmount = (v: any): number => {
  const n = parseFloat(String(v ?? '0').replace(/[₹,\s]/g, ''));
  return Number.isFinite(n) ? n : 0;
};

function postsOf(workOrder: any): any[] {
  const locs = workOrder?.locations;
  if (Array.isArray(locs) && locs.length) return locs;
  return Array.isArray(workOrder?.posts) ? workOrder.posts : [];
}

function guardsOf(post: any): number {
  return Number(post?.guards ?? post?.totalGuards ?? 0) || 0;
}

/** Service instances for a single post (post-indexed map or flat) */
function getPostInstances(workOrder: any, idx: number): any {
  const perPost = workOrder?.perPostServiceInstances;
  if (perPost?.[String(idx)]) return perPost[String(idx)];
  return workOrder?.serviceInstances || {};
}

interface ServiceLine { type: string; shift: string; qty: number; rate: number; total: number; }

function buildServiceLines(instances: any): ServiceLine[] {
  if (!instances) return [];
  const lines: ServiceLine[] = [];
  Object.entries(instances).forEach(([key, arr]: [string, any]) => {
    if (!Array.isArray(arr)) return;
    arr.forEach((inst: any) => {
      ['day', 'afternoon', 'night'].forEach(shift => {
        const s = inst.shifts?.[shift];
        if (s?.enabled && Number(s.quantity) > 0) {
          const qty = Number(s.quantity) || 0;
          const rate = Number(s.rate) || 0;
          lines.push({ type: SERVICE_LABELS[key] || key, shift: SHIFT_LABELS[shift] || shift, qty, rate, total: qty * rate });
        }
      });
    });
  });
  return lines;
}

export function WorkOrderDetailModal({ isOpen, onClose, workOrder }: WorkOrderDetailModalProps) {
  const { agreements } = useAgreementsData();
  const [activeTab, setActiveTab] = useState("overview");

  if (!workOrder) return null;

  const agreementDisplayId = (() => {
    const agId = workOrder.linkedAgreementId;
    if (!agId) return "—";
    const found = agreements.find((a: any) => a.id === agId);
    return found?.agreementId || agId;
  })();

  const statusConfig = getStatusConfig(workOrder.status);
  const posts = postsOf(workOrder);
  const totalGuards = posts.reduce((s: number, p: any) => s + guardsOf(p), 0);
  const isGrouped = isGroupedPerPostRecord(workOrder);
  const perPostDetails = workOrder.perPostDetails || {};
  const perPostIds = workOrder.perPostWorkOrderIds || {};
  const perPostRefs = workOrder.clientWoRefPerPost || {};
  const perPostDocs = workOrder.clientApprovalPerPost || {};

  // Financial summary
  const recordTotal = parseAmount(workOrder.value);
  const gstPct = workOrder.gstExempt ? 0 : (workOrder.gstPercentage ?? 18);
  const subtotal = gstPct > 0 ? recordTotal / (1 + gstPct / 100) : recordTotal;
  const gstAmount = recordTotal - subtotal;

  // Per-post values distributed the same way the list does
  const postValues = isGrouped
    ? distributePerPostValues(recordTotal, perPostDetails, posts.length)
    : posts.map((_p: any, i: number) => parseAmount(perPostDetails[String(i)]?.value) || recordTotal);

  // Aggregate service lines across all posts for the Services tab
  const allServiceLines = posts.length > 0
    ? posts.flatMap((_p: any, i: number) => buildServiceLines(getPostInstances(workOrder, i)))
    : buildServiceLines(workOrder.serviceInstances);

  const serviceSubtotal = allServiceLines.reduce((s, l) => s + l.total, 0);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-[1200px] w-[95vw] max-h-[85vh] overflow-hidden p-0" preventOutsideClose={true}>

        {/* ─── HEADER ─────────────────────────────────────────────────────── */}
        <div className="px-6 pt-6 pb-4 border-b">
          <DialogHeader>
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3 min-w-0">
                <div className="p-2.5 bg-[#D71920]/10 rounded-xl shrink-0">
                  <Briefcase className="h-6 w-6 text-[#D71920]" />
                </div>
                <div className="min-w-0">
                  <DialogTitle className="text-xl font-bold">{workOrder.workOrderId || 'Work Order'}</DialogTitle>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">{workOrder.clientName || workOrder.companyName}</span>
                    {workOrder.customerId && (
                      <span className="inline-flex items-center gap-1 font-mono text-xs bg-[#D71920]/10 text-[#D71920] px-1.5 py-0.5 rounded">
                        <Fingerprint className="h-3 w-3" />{workOrder.customerId}
                      </span>
                    )}
                    {workOrder.clientWoRef && <span>· Client Ref: <strong>{workOrder.clientWoRef}</strong></span>}
                    {workOrder.batchId && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-blue-600">
                        <Layers className="h-3 w-3" />per-post batch
                      </span>
                    )}
                  </div>
                  {isGrouped && (
                    <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">
                      This record holds {posts.length} work orders inside one row — each is shown below. Split it from the list to make them independent.
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <Badge className={`${statusConfig.color} text-white px-3 py-1`}>{workOrder.status}</Badge>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Contract Value</p>
                  <p className="text-lg font-bold text-[#D71920] flex items-center gap-0.5">
                    <IndianRupee className="h-4 w-4" />{recordTotal.toLocaleString('en-IN')}
                  </p>
                </div>
              </div>
            </div>
          </DialogHeader>

          {/* Quick stats strip */}
          <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            {posts.length > 0 && (
              <span className="flex items-center gap-1.5">
                <Shield className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-muted-foreground">Posts:</span>
                <strong>{posts.length}</strong>
              </span>
            )}
            {totalGuards > 0 && (
              <span className="flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-muted-foreground">Guards:</span>
                <strong>{totalGuards}</strong>
              </span>
            )}
            <span className="flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-muted-foreground">Period:</span>
              <strong>{formatDate(workOrder.startDate)}</strong>
              <span className="text-muted-foreground">→</span>
              <strong>{workOrder.endDate ? formatDate(workOrder.endDate) : 'open'}</strong>
            </span>
            <span className="flex items-center gap-1.5">
              <Receipt className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-muted-foreground">GST:</span>
              <strong>{workOrder.gstExempt ? 'Exempt' : `${gstPct}%`}</strong>
            </span>
          </div>
        </div>

        {/* ─── BODY ────────────────────────────────────────────────────────── */}
        <div className="px-6 py-4 overflow-y-auto max-h-[calc(85vh-200px)]">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="mb-4">
              <TabsTrigger value="overview"><Building2 className="h-3.5 w-3.5 mr-1.5" />Overview</TabsTrigger>
              <TabsTrigger value="posts"><Shield className="h-3.5 w-3.5 mr-1.5" />Posts {posts.length > 0 && `(${posts.length})`}</TabsTrigger>
              <TabsTrigger value="services"><Users className="h-3.5 w-3.5 mr-1.5" />Services</TabsTrigger>
              <TabsTrigger value="documents"><FileText className="h-3.5 w-3.5 mr-1.5" />Documents</TabsTrigger>
            </TabsList>

            {/* ── Overview ─────────────────────────────────────────────────── */}
            <TabsContent value="overview" className="space-y-5 mt-2">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

                {/* Client */}
                <div className="rounded-xl border p-5 space-y-4">
                  <h4 className="text-sm font-semibold flex items-center gap-2 text-muted-foreground">
                    <Building2 className="h-4 w-4 text-[#D71920]" />Client Information
                  </h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Client</p>
                      <p className="font-semibold mt-0.5">{workOrder.clientName || "—"}</p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Customer ID</p>
                      <p className="font-mono font-semibold mt-0.5 text-[#D71920]">{workOrder.customerId || "Not assigned"}</p>
                    </div>
                    {workOrder.clientGst && (
                      <div className="col-span-2">
                        <p className="text-[11px] uppercase tracking-wider text-muted-foreground">GSTIN</p>
                        <p className="font-mono font-medium mt-0.5">{workOrder.clientGst}</p>
                      </div>
                    )}
                  </div>
                  <Separator />
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {workOrder.contactPerson && (
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-muted-foreground shrink-0" />
                        <div><p className="text-[10px] text-muted-foreground">Contact</p><p className="text-sm font-medium">{workOrder.contactPerson}</p></div>
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div><p className="text-[10px] text-muted-foreground">Phone</p><p className="text-sm font-medium">{workOrder.contactPhone || "—"}</p></div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div><p className="text-[10px] text-muted-foreground">Email</p><p className="text-sm font-medium truncate">{workOrder.contactEmail || "—"}</p></div>
                    </div>
                  </div>
                </div>

                {/* Address + References */}
                <div className="rounded-xl border p-5 space-y-4">
                  <h4 className="text-sm font-semibold flex items-center gap-2 text-muted-foreground">
                    <MapPin className="h-4 w-4 text-[#D71920]" />Billing Address
                  </h4>
                  <div>
                    <p className="font-medium">{workOrder.address || "—"}</p>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {[workOrder.city, workOrder.state, workOrder.pincode].filter(Boolean).join(', ') || '—'}
                    </p>
                  </div>
                  <Separator />
                  <h4 className="text-sm font-semibold flex items-center gap-2 text-muted-foreground">
                    <ClipboardList className="h-4 w-4 text-[#D71920]" />References
                  </h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Agreement</p>
                      <p className="font-semibold text-[#D71920] mt-0.5">{agreementDisplayId}</p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Quotation</p>
                      <p className="font-semibold text-blue-600 mt-0.5">{workOrder.linkedQuoteId || "—"}</p>
                    </div>
                    {workOrder.clientWoRef && (
                      <div className="col-span-2">
                        <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Client WO Reference</p>
                        <p className="font-mono font-semibold mt-0.5">{workOrder.clientWoRef}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Financial summary */}
              <div className="rounded-xl border p-5">
                <h4 className="text-sm font-semibold flex items-center gap-2 text-muted-foreground mb-4">
                  <IndianRupee className="h-4 w-4 text-[#D71920]" />Financial Summary
                </h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Contract Value</p>
                    <p className="text-xl font-bold text-[#D71920] mt-0.5">{fmtINR(recordTotal)}</p>
                    <p className="text-[11px] text-muted-foreground">per month, excl. GST</p>
                  </div>
                  {!workOrder.gstExempt && gstPct > 0 && (
                    <>
                      <div>
                        <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Subtotal (excl. GST)</p>
                        <p className="text-lg font-semibold mt-0.5">{fmtINR(subtotal)}</p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-wider text-muted-foreground">GST ({gstPct}%)</p>
                        <p className="text-lg font-semibold mt-0.5">{fmtINR(gstAmount)}</p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Total with GST</p>
                        <p className="text-lg font-bold text-emerald-600 mt-0.5">{fmtINR(subtotal + gstAmount + (subtotal + gstAmount - recordTotal))}</p>
                      </div>
                    </>
                  )}
                  {workOrder.gstExempt && (
                    <div>
                      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">GST</p>
                      <Badge variant="outline" className="mt-1">Exempt</Badge>
                    </div>
                  )}
                </div>
              </div>

              {/* Timeline */}
              <div className="rounded-xl border p-5">
                <h4 className="text-sm font-semibold flex items-center gap-2 text-muted-foreground mb-4">
                  <Clock className="h-4 w-4 text-[#D71920]" />Timeline
                </h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { label: "Created", value: formatDateTime(workOrder.createdAt), dot: "bg-blue-500" },
                    { label: "Start Date", value: formatDate(workOrder.startDate), dot: "bg-amber-500" },
                    { label: "End Date", value: workOrder.endDate ? formatDate(workOrder.endDate) : "Open-ended", dot: "bg-purple-500" },
                    { label: "Last Updated", value: formatDateTime(workOrder.updatedAt), dot: "bg-green-500" },
                  ].map(({ label, value, dot }) => (
                    <div key={label} className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full ${dot} shrink-0`} />
                      <div>
                        <p className="text-[10px] text-muted-foreground uppercase">{label}</p>
                        <p className="text-sm font-medium">{value}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {workOrder.serviceDetails && (
                <div className="rounded-xl border p-5">
                  <h4 className="text-sm font-semibold flex items-center gap-2 text-muted-foreground mb-2">
                    <FileText className="h-4 w-4 text-[#D71920]" />Service Description
                  </h4>
                  <p className="text-sm leading-relaxed">{workOrder.serviceDetails}</p>
                </div>
              )}
            </TabsContent>

            {/* ── Security Posts ───────────────────────────────────────────── */}
            <TabsContent value="posts" className="mt-2">
              {posts.length === 0 ? (
                <div className="rounded-xl border border-dashed p-12 text-center">
                  <Shield className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
                  <p className="text-muted-foreground">No security posts defined</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {posts.map((post: any, idx: number) => {
                    const postName = post.name || post.postName || `Post ${idx + 1}`;
                    const guards = guardsOf(post);
                    const hasCoords = !!(post.lat && post.lng);
                    const detail = perPostDetails[String(idx)] || {};
                    const postWoId = perPostIds[String(idx)];
                    const postRef = perPostRefs[String(idx)];
                    const postValue = postValues[idx] ?? 0;
                    const lines = buildServiceLines(getPostInstances(workOrder, idx));
                    const postSubtotal = lines.reduce((s, l) => s + l.total, 0);
                    const gstOnPost = workOrder.gstExempt ? 0 : (postSubtotal * gstPct / 100);

                    return (
                      <div key={idx} className="rounded-xl border overflow-hidden">
                        {/* Post header */}
                        <div className="flex items-center justify-between gap-3 px-4 py-3 bg-muted/40">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-[#D71920]/10 text-[#D71920] font-bold text-sm shrink-0">{idx + 1}</div>
                            <div className="min-w-0">
                              <p className="font-semibold truncate">{postName}</p>
                              {postWoId && (
                                <p className="font-mono text-[11px] text-muted-foreground">{postWoId}{postRef && ` · ${postRef}`}</p>
                              )}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            {guards > 0 && <Badge variant="secondary" className="text-xs mb-1">{guards} guards</Badge>}
                            {postValue > 0 && <p className="text-sm font-bold text-[#D71920]">{fmtINR(postValue)}</p>}
                          </div>
                        </div>

                        {/* Post body */}
                        <div className="px-4 py-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
                          {(post.address || post.postAddress) && (
                            <div className="flex items-start gap-2">
                              <MapPin className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                              <div>
                                <p className="text-[11px] text-muted-foreground">Address</p>
                                <p className="font-medium">{post.address || post.postAddress}</p>
                                <p className="text-xs text-muted-foreground">
                                  {[post.city || post.district, post.state, post.pincode].filter(Boolean).join(', ')}
                                </p>
                              </div>
                            </div>
                          )}
                          {(detail.startDate || detail.endDate) && (
                            <div className="flex items-start gap-2">
                              <Calendar className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                              <div>
                                <p className="text-[11px] text-muted-foreground">Contract Period</p>
                                <p className="font-medium">
                                  {detail.startDate || '—'}{detail.endDate ? ` → ${detail.endDate}` : ''}
                                </p>
                              </div>
                            </div>
                          )}
                          {detail.quotationRef && (
                            <div className="flex items-start gap-2">
                              <Hash className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                              <div>
                                <p className="text-[11px] text-muted-foreground">Quotation Ref</p>
                                <p className="font-medium font-mono">{detail.quotationRef}</p>
                              </div>
                            </div>
                          )}
                          {hasCoords && (
                            <div className="flex items-center gap-2">
                              <Navigation className="h-3.5 w-3.5 text-green-600 shrink-0" />
                              <span className="text-[11px] font-mono text-muted-foreground">
                                {parseFloat(post.lat).toFixed(5)}, {parseFloat(post.lng).toFixed(5)}
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Per-post service mini-table */}
                        {lines.length > 0 && (
                          <div className="border-t px-4 py-3">
                            <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">Services</p>
                            <div className="overflow-x-auto">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="text-muted-foreground border-b">
                                    <th className="text-left py-1 font-medium">Category</th>
                                    <th className="text-left py-1 font-medium">Shift</th>
                                    <th className="text-right py-1 font-medium">Qty</th>
                                    <th className="text-right py-1 font-medium">Rate/Month</th>
                                    <th className="text-right py-1 font-medium">Amount</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {lines.map((l, li) => (
                                    <tr key={li} className="border-b last:border-0">
                                      <td className="py-1">{l.type}</td>
                                      <td className="py-1">{l.shift}</td>
                                      <td className="py-1 text-right">{l.qty}</td>
                                      <td className="py-1 text-right font-mono">{fmtINR(l.rate)}</td>
                                      <td className="py-1 text-right font-mono font-semibold">{fmtINR(l.total)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                                <tfoot>
                                  <tr className="font-semibold">
                                    <td colSpan={4} className="pt-2 text-right text-muted-foreground">Monthly subtotal</td>
                                    <td className="pt-2 text-right font-mono">{fmtINR(postSubtotal)}</td>
                                  </tr>
                                  {!workOrder.gstExempt && gstPct > 0 && (
                                    <tr className="text-muted-foreground">
                                      <td colSpan={4} className="pt-0.5 text-right">GST ({gstPct}%)</td>
                                      <td className="pt-0.5 text-right font-mono">{fmtINR(gstOnPost)}</td>
                                    </tr>
                                  )}
                                </tfoot>
                              </table>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </TabsContent>

            {/* ── Services summary ─────────────────────────────────────────── */}
            <TabsContent value="services" className="mt-2 space-y-4">
              {allServiceLines.length === 0 ? (
                <div className="rounded-xl border border-dashed p-12 text-center">
                  <Users className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
                  <p className="text-muted-foreground">No service structure defined</p>
                </div>
              ) : (
                <>
                  <div className="rounded-xl border overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-muted/40 text-muted-foreground">
                          <th className="text-left px-4 py-2.5 font-medium">Category</th>
                          <th className="text-left px-4 py-2.5 font-medium">Shift</th>
                          <th className="text-right px-4 py-2.5 font-medium">Qty</th>
                          <th className="text-right px-4 py-2.5 font-medium">Rate / Month</th>
                          <th className="text-right px-4 py-2.5 font-medium">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {allServiceLines.map((l, i) => (
                          <tr key={i} className="border-t">
                            <td className="px-4 py-2.5">{l.type}</td>
                            <td className="px-4 py-2.5">{l.shift}</td>
                            <td className="px-4 py-2.5 text-right">{l.qty}</td>
                            <td className="px-4 py-2.5 text-right font-mono">{fmtINR(l.rate)}</td>
                            <td className="px-4 py-2.5 text-right font-mono font-semibold">{fmtINR(l.total)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t bg-muted/20">
                          <td colSpan={4} className="px-4 py-2.5 font-semibold text-right">Monthly Subtotal</td>
                          <td className="px-4 py-2.5 text-right font-mono font-bold">{fmtINR(serviceSubtotal)}</td>
                        </tr>
                        {!workOrder.gstExempt && gstPct > 0 && (
                          <>
                            <tr className="border-t text-muted-foreground">
                              <td colSpan={4} className="px-4 py-2 text-right">GST ({gstPct}%)</td>
                              <td className="px-4 py-2 text-right font-mono">{fmtINR(serviceSubtotal * gstPct / 100)}</td>
                            </tr>
                            <tr className="border-t bg-[#D71920]/5">
                              <td colSpan={4} className="px-4 py-2.5 font-bold text-right text-[#D71920]">Total with GST</td>
                              <td className="px-4 py-2.5 text-right font-mono font-bold text-[#D71920]">{fmtINR(serviceSubtotal * (1 + gstPct / 100))}</td>
                            </tr>
                          </>
                        )}
                      </tfoot>
                    </table>
                  </div>

                  <div className="flex flex-wrap gap-4">
                    <div className="rounded-xl border p-4 flex-1 min-w-[150px]">
                      <p className="text-xs text-muted-foreground">Total Personnel</p>
                      <p className="text-2xl font-bold text-[#D71920]">{allServiceLines.reduce((s, l) => s + l.qty, 0)}</p>
                    </div>
                    <div className="rounded-xl border p-4 flex-1 min-w-[150px]">
                      <p className="text-xs text-muted-foreground">Monthly Value</p>
                      <p className="text-2xl font-bold">{fmtINR(serviceSubtotal)}</p>
                    </div>
                    {posts.length > 0 && (
                      <div className="rounded-xl border p-4 flex-1 min-w-[150px]">
                        <p className="text-xs text-muted-foreground">Security Posts</p>
                        <p className="text-2xl font-bold">{posts.length}</p>
                      </div>
                    )}
                  </div>
                </>
              )}
            </TabsContent>

            {/* ── Documents ────────────────────────────────────────────────── */}
            <TabsContent value="documents" className="mt-2 space-y-4">
              {/* Unified signed doc */}
              {workOrder.clientApproval && workOrder.clientApprovalMode !== 'per-post' && (
                <a href={workOrder.clientApproval} target="_blank" rel="noopener noreferrer"
                  className="rounded-xl border p-5 hover:border-green-400/40 hover:shadow-xs transition-all flex items-center gap-4 group">
                  <div className="p-3 bg-green-500/10 rounded-xl"><FileCheck className="h-6 w-6 text-green-600" /></div>
                  <div className="flex-1">
                    <p className="font-semibold group-hover:text-green-600 transition-colors">Signed Work Order</p>
                    <p className="text-sm text-muted-foreground">Received from the client</p>
                  </div>
                  <ExternalLink className="h-4 w-4 text-muted-foreground" />
                </a>
              )}

              {/* Generated WO PDF */}
              {workOrder.documentUrl && (
                <a href={workOrder.documentUrl} target="_blank" rel="noopener noreferrer"
                  className="rounded-xl border p-5 hover:border-[#D71920]/40 hover:shadow-xs transition-all flex items-center gap-4 group">
                  <div className="p-3 bg-[#D71920]/10 rounded-xl"><FileText className="h-6 w-6 text-[#D71920]" /></div>
                  <div className="flex-1">
                    <p className="font-semibold group-hover:text-[#D71920] transition-colors">Generated Work Order PDF</p>
                    <p className="text-sm text-muted-foreground">Issued to the client for signing</p>
                  </div>
                  <ExternalLink className="h-4 w-4 text-muted-foreground" />
                </a>
              )}

              {/* Per-post work orders */}
              {workOrder.clientApprovalMode === 'per-post' && posts.length > 0 && (
                <div className="rounded-xl border overflow-hidden">
                  <div className="flex items-center gap-2 border-b bg-muted/30 px-5 py-3">
                    <FileCheck className="h-4 w-4 text-green-600" />
                    <p className="font-semibold text-sm">Per-Post Work Orders</p>
                    <span className="ml-auto text-xs text-muted-foreground">
                      {Object.values(perPostDocs).filter(Boolean).length} / {posts.length} signed
                    </span>
                  </div>
                  <div className="divide-y">
                    {posts.map((post: any, idx: number) => {
                      const postName = post?.name?.trim() || `Post ${idx + 1}`;
                      const signedUrl = perPostDocs[String(idx)];
                      const detail = perPostDetails[String(idx)] || {};
                      const postWoId = perPostIds[String(idx)];
                      const clientRef = perPostRefs[String(idx)];
                      return (
                        <div key={idx} className={`px-5 py-4 ${signedUrl ? 'bg-emerald-50/50 dark:bg-emerald-900/10' : ''}`}>
                          <div className="flex items-center gap-3">
                            {signedUrl
                              ? <FileCheck className="h-4 w-4 text-emerald-600 shrink-0" />
                              : <FileClock className="h-4 w-4 text-amber-500 shrink-0" />}
                            <span className="font-medium text-sm flex-1 truncate">{postName}</span>
                            {postWoId && <span className="font-mono text-[11px] text-muted-foreground shrink-0">{postWoId}</span>}
                          </div>
                          <div className="mt-2 ml-7 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                            {detail.startDate && <span><Calendar className="h-3 w-3 inline mr-0.5" />{detail.startDate}{detail.endDate ? ` → ${detail.endDate}` : ''}</span>}
                            {detail.value && <span><IndianRupee className="h-3 w-3 inline mr-0.5" />{Number(detail.value).toLocaleString('en-IN')}</span>}
                            {detail.quotationRef && <span>Quote: {detail.quotationRef}</span>}
                            {clientRef && <span>Ref: {clientRef}</span>}
                          </div>
                          <div className="mt-2 ml-7 flex flex-wrap gap-3">
                            {detail.documentUrl && (
                              <a href={detail.documentUrl} target="_blank" rel="noopener noreferrer"
                                className="text-[11px] text-blue-600 hover:underline inline-flex items-center gap-1">
                                <FileText className="h-3 w-3" />Generated PDF <ExternalLink className="h-3 w-3" />
                              </a>
                            )}
                            {signedUrl ? (
                              <a href={signedUrl} target="_blank" rel="noopener noreferrer"
                                className="text-[11px] text-emerald-700 dark:text-emerald-400 hover:underline inline-flex items-center gap-1">
                                <FileCheck className="h-3 w-3" />Signed document <ExternalLink className="h-3 w-3" />
                              </a>
                            ) : (
                              <span className="text-[11px] text-amber-600">Signed document pending</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {!workOrder.documentUrl && !workOrder.clientApproval
                && Object.values(perPostDocs).filter(Boolean).length === 0
                && Object.values(perPostDetails).every((d: any) => !d?.documentUrl) && (
                <div className="rounded-xl border border-dashed p-12 text-center">
                  <FileText className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
                  <p className="text-muted-foreground">No documents on file for this work order</p>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>

        {/* Footer warning */}
        {workOrder.pendingAgreementUpload && (
          <div className="px-6 pb-4">
            <div className="bg-red-50 dark:bg-red-900/20 rounded-xl p-4 border border-red-200 dark:border-red-800 flex items-center gap-3">
              <div className="p-2 bg-red-500/20 rounded-full animate-pulse">
                <AlertCircle className="h-5 w-5 text-red-500" />
              </div>
              <div>
                <p className="font-semibold text-red-600 dark:text-red-400">Pending Agreement Upload</p>
                <p className="text-sm text-red-500">The signed agreement for this work order is pending upload.</p>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
