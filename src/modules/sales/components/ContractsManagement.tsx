'use client';
import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  FileSignature, 
  ClipboardList, 
  AlertTriangle,
  RefreshCw,
  Bell,
  Upload,
  CheckCircle2,
  FileText
} from "lucide-react";
import { AgreementsTable } from "./AgreementsTable";
import { WorkordersTable } from "./WorkordersTable";
import { toWorkOrderRows } from "../utils/workOrderRows";
import { AgreementDraftModal } from "./AgreementDraftModal";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { calculateDaysUntilExpiry } from "@/services/supabase/ContractRenewalService";
import { useAgreementsData } from "@/contexts/AgreementsDataContext";
import { useWorkOrdersData } from "@/contexts/WorkOrdersDataContext";
import { useToast } from "@/hooks/use-toast";
import { CountUp } from "@/components/dashboard/CountUp";

interface ContractsManagementProps {
  filter: string;
  searchTerm: string;
  onEdit: (item: any, type: string) => void;
}

export function ContractsManagement({ filter, searchTerm, onEdit }: ContractsManagementProps) {
  const [activeSubTab, setActiveSubTab] = useState("workorders");
  const [skippingIds, setSkippingIds] = useState<Set<string>>(new Set());
  const [agreementDraftWO, setAgreementDraftWO] = useState<any | null>(null);
  // Skip-for-now reminder dialog state
  const [skipTarget, setSkipTarget] = useState<any | null>(null);
  const [skipReminderDate, setSkipReminderDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7); // default reminder in 7 days
    return d.toISOString().split('T')[0];
  });
  const { agreements } = useAgreementsData();
  const { workOrders } = useWorkOrdersData();
  const { toast } = useToast();

  // Ref-based handler to always read latest setActiveSubTab without re-subscribing
  const setActiveSubTabRef = useRef(setActiveSubTab);
  setActiveSubTabRef.current = setActiveSubTab;

  // Listen for sub-tab switch events (e.g., after work order form submit)
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ tab: string }>).detail;
      if (detail?.tab) {
        setActiveSubTabRef.current(detail.tab);
      }
    };
    window.addEventListener('switchContractSubTab', handler);
    return () => window.removeEventListener('switchContractSubTab', handler);
  }, []);

  // Shared: does a completed work order still need an agreement?
  const woNeedsAgreement = useCallback((wo: any) => {
    if (wo.status !== "Completed") return false;
    const linked = agreements.some(a => {
      const agr = a as any;
      if (wo.linkedAgreementId && agr.id && agr.id === wo.linkedAgreementId) return true;
      if (wo.linkedQuoteId && agr.linkedQuoteId && agr.linkedQuoteId === wo.linkedQuoteId) return true;
      if (agr.workOrderId && (agr.workOrderId === wo.id || agr.workOrderId === wo.workOrderId)) return true;
      if (wo.clientName && agr.clientName && agr.clientName === wo.clientName) return true;
      return false;
    });
    return !linked;
  }, [agreements]);

  // Derived data
  const stats = useMemo(() => {
    // Count actual work orders, not records: a record that still holds several
    // per-post work orders counts once per post, matching the list below.
    const rows = toWorkOrderRows(workOrders as any[]);
    const woTotal = rows.length;
    const woCompleted = rows.filter(row => row.status === "Completed").length;
    
    const agrTotal = agreements.length;
    const agrActive = agreements.filter(a => a.status === "Active" || a.status === "Signed").length;
    
    // Work orders completed but no corresponding agreement created yet
    const pendingAgreement = workOrders.filter(woNeedsAgreement).length;

    let expiring = 0;
    agreements.forEach(agreement => {
      if (agreement.status === "Signed" || agreement.status === "Active") {
        const contractDuration = parseInt((agreement as any).legalTerms?.contractDuration || '12', 10);
        let endDate: Date;
        if ((agreement as any).validUntil) {
          endDate = new Date((agreement as any).validUntil);
        } else if ((agreement as any).signedOn) {
          endDate = new Date((agreement as any).signedOn);
          endDate.setMonth(endDate.getMonth() + contractDuration);
        } else {
          endDate = new Date();
          endDate.setMonth(endDate.getMonth() + 3);
        }
        const days = calculateDaysUntilExpiry(endDate);
        if (days <= 30) expiring++;
      }
    });

    const totalValue = workOrders.reduce((sum, wo) => {
      return sum + (parseFloat((wo.value || '0').replace(/[₹,]/g, '')) || 0);
    }, 0);

    return { woTotal, woCompleted, agrTotal, agrActive, pendingAgreement, expiring, totalValue };
  }, [workOrders, agreements, woNeedsAgreement]);

  // Open Agreement form with inherited data from a completed Work Order
  const handleOpenAgreementForm = (workOrder: any) => {
    const agreementData = {
      linkedQuoteId: workOrder.linkedQuoteId || '',
      quotationRef: workOrder.linkedQuoteId || '',
      clientName: workOrder.clientName || '',
      companyName: workOrder.companyName || workOrder.clientName || '',
      contactPerson: workOrder.contactPerson || '',
      contactEmail: workOrder.contactEmail || '',
      contactPhone: workOrder.contactPhone || '',
      address: workOrder.address || '',
      city: workOrder.city || '',
      state: workOrder.state || '',
      pincode: workOrder.pincode || '',
      serviceDetails: workOrder.serviceDetails || '',
      value: workOrder.value || '₹0',
      posts: workOrder.posts || [],
      workOrderId: workOrder.id,
    };
    onEdit(agreementData, "agreement");
  };

  // Upload Manual — opens a simple upload dialog
  const handleUploadManual = (workOrder: any) => {
    onEdit({ ...workOrder, _uploadOnly: true }, "agreement_upload");
  };

  // Sync a work order's posts directly into Operations (used when no quotation exists)
  const syncPostsToOperations = async (workOrder: any) => {
    try {
      const {
        createOperationalPost, deletePostsByWorkOrder,
        resolvePostServiceInstances, countGuardsForInstances, deriveShiftTypeForInstances,
      } = await import("@/services/supabase/OperationalPostService");
      const { generatePostCodeFromLocation } = await import("@/utils/generatePostCode");
      // Locations carry the map-pinned coordinates; `posts` is the legacy shape.
      const posts: any[] = (workOrder.locations?.length ? workOrder.locations : workOrder.posts) || [];
      if (!posts.length) return;

      // Clear any existing posts for this WO to avoid duplicates
      const woKey = workOrder.id || workOrder.workOrderId;
      if (woKey) await deletePostsByWorkOrder(woKey);

      for (let i = 0; i < posts.length; i++) {
        const p = posts[i];
        const postLocation = {
          address: p.address || p.postAddress || '',
          city: p.city || '',
          state: p.state || '',
          pincode: p.pincode || '',
          // Preserve pinned coordinates — these were previously dropped on this
          // path, so posts deployed via "Skip agreement" had no geofence anchor.
          latitude: p.lat ? parseFloat(p.lat) : undefined,
          longitude: p.lng ? parseFloat(p.lng) : undefined,
        };
        // Per-post configuration, resolved the same way as the quotation-backed
        // sync. This path previously wrote the work order's single global
        // serviceInstances map onto every post.
        const instances = resolvePostServiceInstances(workOrder, null, i) || {};
        const guards = countGuardsForInstances(instances);
        await createOperationalPost({
          quotationId: workOrder.linkedQuoteId || '',
          workOrderId: woKey,
          workOrderStatus: workOrder.status || 'Completed',
          postCode: generatePostCodeFromLocation(i + 1, postLocation),
          postName: p.name || p.postName || `Post ${i + 1}`,
          clientName: workOrder.clientName || '',
          contactPerson: workOrder.contactPerson || '',
          contactEmail: workOrder.contactEmail || '',
          contactPhone: workOrder.contactPhone || '',
          location: postLocation,
          totalGuards: guards > 0 ? guards : Number(p.totalGuards || p.guards || 0),
          shiftType: deriveShiftTypeForInstances(instances),
          securityServices: {},
          serviceInstances: Object.keys(instances).length > 0 ? instances : undefined,
          status: 'active',
        } as any);
      }
    } catch (err) {
      console.error('[syncPostsToOperations]', err);
    }
  };

  // Skip for Now — mark skipped, set reminder date, and deploy posts to Operations
  const handleConfirmSkip = async () => {
    const workOrder = skipTarget;
    if (!workOrder) return;
    const woId = workOrder.id || workOrder.workOrderId;
    if (skippingIds.has(woId)) return;
    setSkippingIds(prev => new Set(prev).add(woId));

    try {
      const { addAgreement } = await import("@/services/supabase/AgreementFirebaseService");
      const { updateWorkOrder } = await import("@/services/supabase/WorkOrderFirebaseService");
      const { supabaseClient } = await import("@/integrations/supabase/client");

      const result = await addAgreement({
        linkedQuoteId: workOrder.linkedQuoteId || '',
        quotationRef: workOrder.linkedQuoteId || '',
        clientName: workOrder.clientName || '',
        companyName: workOrder.companyName || workOrder.clientName || '',
        contactPerson: workOrder.contactPerson || '',
        contactEmail: workOrder.contactEmail || '',
        contactPhone: workOrder.contactPhone || '',
        address: workOrder.address || '',
        city: workOrder.city || '',
        state: workOrder.state || '',
        pincode: workOrder.pincode || '',
        serviceDetails: workOrder.serviceDetails || '',
        value: workOrder.value || '₹0',
        status: 'pending_signature',
        posts: workOrder.posts || [],
        notes: `Agreement skipped on ${new Date().toLocaleDateString('en-IN')}. Follow-up reminder set for ${new Date(skipReminderDate).toLocaleDateString('en-IN')}.`,
        reminderDate: skipReminderDate,
      } as any);

      if (!result.success) {
        toast({ title: "Could not skip", description: result.error || "Please try again.", variant: "destructive" });
        return;
      }

      // Link agreement back to WO so it leaves the pending list
      if (workOrder.id) await updateWorkOrder(workOrder.id, { linkedAgreementId: result.id } as any);

      // Deploy posts to Operations
      await syncPostsToOperations(workOrder);

      // Create a follow-up reminder notification
      try {
        await supabaseClient.from('notifications').insert({
          type: 'AGREEMENT_FOLLOWUP',
          title: `Agreement Pending — ${workOrder.clientName}`,
          message: `Agreement for ${workOrder.clientName} (WO ${workOrder.workOrderId || woId}) was skipped. Follow up to complete the formal agreement.`,
          target_role: 'sales',
          status: 'unread',
          entity_type: 'agreement',
          entity_id: result.id ?? woId,
          remind_at: skipReminderDate,
        });
      } catch { /* non-critical */ }

      toast({
        title: "Skipped & Deployed",
        description: `${workOrder.clientName || 'Client'} posts deployed to Operations. Reminder set for ${new Date(skipReminderDate).toLocaleDateString('en-IN')}.`,
      });
      setSkipTarget(null);
    } finally {
      setSkippingIds(prev => {
        const next = new Set(prev);
        next.delete(woId);
        return next;
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-linear-to-r from-red-50 to-gray-50 dark:from-red-900/20 dark:to-gray-900/20 p-6 rounded-lg border border-red-100 dark:border-red-800/30">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-medium mb-2">Contract Management</h3>
            <p className="text-muted-foreground text-sm">
              Quotation → <strong>Work Order</strong> (upload signed document) → <strong>Agreement</strong> (capture details or upload)
            </p>
          </div>
          {stats.expiring > 0 && (
            <div className="flex items-center gap-2 bg-red-100 dark:bg-red-900/30 px-4 py-2 rounded-lg border border-red-300">
              <Bell className="h-5 w-5 text-red-600 animate-pulse" />
              <span className="font-semibold text-red-700 dark:text-red-400">{stats.expiring} expiring</span>
            </div>
          )}
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card className="p-5 border-t-4 border-t-blue-500">
          <h4 className="font-semibold text-gray-600 dark:text-gray-300 text-sm">Work Orders</h4>
          <p className="text-3xl font-bold text-blue-600 dark:text-blue-400 mt-1"><CountUp to={stats.woTotal} duration={2} separator="," /></p>
          <p className="text-xs text-muted-foreground mt-1"><CountUp to={stats.woCompleted} duration={2} separator="," /> completed</p>
        </Card>
        <Card className="p-5 border-t-4 border-t-indigo-500">
          <h4 className="font-semibold text-gray-600 dark:text-gray-300 text-sm">Total Value</h4>
          <p className="text-3xl font-bold text-indigo-600 dark:text-indigo-400 mt-1">₹{(stats.totalValue / 100000).toFixed(1)}L</p>
          <p className="text-xs text-muted-foreground mt-1">Contract value</p>
        </Card>
        <Card className={`p-5 border-t-4 ${stats.pendingAgreement > 0 ? 'border-t-purple-500 bg-purple-50/50 dark:bg-purple-900/10' : 'border-t-purple-300'}`}>
          <h4 className="font-semibold text-gray-600 dark:text-gray-300 text-sm">Pending Agreement</h4>
          <p className="text-3xl font-bold text-purple-600 dark:text-purple-400 mt-1"><CountUp to={stats.pendingAgreement} duration={2} separator="," /></p>
          <p className="text-xs text-muted-foreground mt-1">Need agreement</p>
        </Card>
        <Card className={`p-5 border-t-4 ${stats.expiring > 0 ? 'border-t-orange-500 bg-orange-50/50 dark:bg-orange-900/10' : 'border-t-orange-300'}`}>
          <h4 className="font-semibold text-orange-600 dark:text-orange-400 text-sm flex items-center gap-1">
            {stats.expiring > 0 && <AlertTriangle className="h-3 w-3 animate-pulse" />}Expiring
          </h4>
          <p className="text-3xl font-bold text-orange-600 dark:text-orange-400 mt-1"><CountUp to={stats.expiring} duration={2} separator="," /></p>
          <p className="text-xs text-muted-foreground mt-1">Need renewal WO</p>
        </Card>
        <Card className="p-5 border-t-4 border-t-green-500">
          <h4 className="font-semibold text-gray-600 dark:text-gray-300 text-sm">Agreements</h4>
          <p className="text-3xl font-bold text-green-600 dark:text-green-400 mt-1"><CountUp to={stats.agrTotal} duration={2} separator="," /></p>
          <p className="text-xs text-muted-foreground mt-1"><CountUp to={stats.agrActive} duration={2} separator="," /> active</p>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeSubTab} onValueChange={setActiveSubTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="workorders" className="flex gap-2">
            <ClipboardList className="h-4 w-4" />Work Orders
          </TabsTrigger>
          <TabsTrigger value="agreements" className="flex gap-2">
            <FileSignature className="h-4 w-4" />Agreements
          </TabsTrigger>
        </TabsList>

        {/* ─── WORK ORDERS TAB ─────────────────────────────────────── */}
        <TabsContent value="workorders" className="space-y-4">
          <WorkordersTable filter="All Workorders" searchTerm={searchTerm} onEdit={(item) => onEdit(item, "workorder")} />
        </TabsContent>

        {/* ─── AGREEMENTS TAB ──────────────────────────────────────── */}
        <TabsContent value="agreements" className="space-y-4">
          {/* Incomplete tasks: Work orders completed but agreement not yet created */}
          {stats.pendingAgreement > 0 && (
            <Card className="p-4 border-purple-200 bg-purple-50/50 dark:bg-purple-900/10 dark:border-purple-800/30">
              <h4 className="font-medium text-purple-800 dark:text-purple-300 mb-3 flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Incomplete — Agreement Required ({stats.pendingAgreement})
              </h4>
              <p className="text-sm text-muted-foreground mb-3">
                Work order completed. Capture agreement details or upload a signed agreement document.
              </p>
              <div className="space-y-3">
                {workOrders
                  .filter(woNeedsAgreement)
                  .map(wo => {
                    const postsArr = (wo as any).posts || (wo as any).locations || [];
                    const postCount = postsArr.length;
                    const totalGuards = postsArr.reduce((s: number, p: any) => s + (Number(p.totalGuards ?? p.guards) || 0), 0);
                    const startDate = (wo as any).startDate ? new Date((wo as any).startDate) : null;
                    const daysPending = startDate ? Math.max(0, Math.floor((Date.now() - startDate.getTime()) / 86400000)) : null;
                    const busy = skippingIds.has(wo.id || wo.workOrderId);
                    return (
                      <div key={wo.id} className="bg-white dark:bg-gray-800 rounded-lg border p-4">
                        <div className="flex items-start justify-between gap-4 flex-wrap">
                          {/* Left: identity + details */}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-[15px] truncate">{wo.clientName}</span>
                              <span className="text-xs font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{wo.workOrderId}</span>
                              {daysPending !== null && (
                                <Badge className={`text-[10px] ${daysPending > 7 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                                  Pending {daysPending}d
                                </Badge>
                              )}
                            </div>
                            {/* Detail chips */}
                            <div className="flex items-center gap-x-5 gap-y-1 mt-2 flex-wrap text-xs text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <span className="font-semibold text-foreground">{wo.value}</span>/month
                              </span>
                              <span>{postCount} post{postCount !== 1 ? 's' : ''}</span>
                              <span>{totalGuards} guard{totalGuards !== 1 ? 's' : ''}</span>
                              {startDate && <span>Since {startDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span>}
                              {wo.contactPerson && <span>Contact: {wo.contactPerson}{wo.contactPhone ? ` · ${wo.contactPhone}` : ''}</span>}
                            </div>
                          </div>
                          {/* Right: actions */}
                          <div className="flex items-center gap-2 shrink-0">
                            <Button size="sm" onClick={() => setAgreementDraftWO(wo)}>
                              <FileSignature className="h-4 w-4 mr-1" />Generate
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => handleUploadManual(wo)}>
                              <Upload className="h-4 w-4 mr-1" />Upload
                            </Button>
                            <Button 
                              size="sm" 
                              variant="ghost" 
                              className="text-muted-foreground" 
                              onClick={() => setSkipTarget(wo)}
                              disabled={busy}
                            >
                              {busy ? 'Skipping...' : 'Skip'}
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                }
              </div>
            </Card>
          )}

          {/* Expiring agreements needing renewal via new work order */}
          {stats.expiring > 0 && (
            <Card className="p-4 border-orange-200 bg-orange-50/50 dark:bg-orange-900/10 dark:border-orange-800/30">
              <h4 className="font-medium text-orange-800 dark:text-orange-300 mb-3 flex items-center gap-2">
                <RefreshCw className="h-4 w-4" />
                Renewal Required — Upload Renewed Work Order ({stats.expiring})
              </h4>
              <p className="text-sm text-muted-foreground mb-3">
                These agreements are expiring. Upload a renewed work order to extend.
              </p>
              <div className="space-y-2">
                {agreements
                  .filter(a => {
                    if (a.status !== "Signed" && a.status !== "Active") return false;
                    const contractDuration = parseInt((a as any).legalTerms?.contractDuration || '12', 10);
                    let endDate: Date;
                    if ((a as any).validUntil) endDate = new Date((a as any).validUntil);
                    else if ((a as any).signedOn) { endDate = new Date((a as any).signedOn); endDate.setMonth(endDate.getMonth() + contractDuration); }
                    else return false;
                    return calculateDaysUntilExpiry(endDate) <= 30;
                  })
                  .map(a => {
                    let endDate: Date;
                    const contractDuration = parseInt((a as any).legalTerms?.contractDuration || '12', 10);
                    if ((a as any).validUntil) endDate = new Date((a as any).validUntil);
                    else { endDate = new Date((a as any).signedOn); endDate.setMonth(endDate.getMonth() + contractDuration); }
                    const days = calculateDaysUntilExpiry(endDate);
                    return (
                      <div key={a.id} className="flex items-center justify-between bg-white dark:bg-gray-800 p-3 rounded border">
                        <div className="flex items-center gap-3">
                          <AlertTriangle className="h-4 w-4 text-orange-500" />
                          <span className="font-medium">{a.clientName}</span>
                          <Badge variant="destructive" className="text-xs">
                            {days < 0 ? `Expired ${Math.abs(days)}d ago` : `${days}d left`}
                          </Badge>
                          <Badge variant="outline" className="text-xs">{a.value}</Badge>
                        </div>
                        <Button size="sm" variant="outline" className="text-orange-600 border-orange-300" onClick={() => onEdit(a, "renewal")}>
                          <Upload className="h-4 w-4 mr-1" />Upload Renewed WO
                        </Button>
                      </div>
                    );
                  })
                }
              </div>
            </Card>
          )}

          <AgreementsTable filter="All Agreements" searchTerm={searchTerm} onEdit={(item) => onEdit(item, "agreement")} />
        </TabsContent>
      </Tabs>

      {/* Agreement Draft Generation Modal */}
      <AgreementDraftModal
        isOpen={!!agreementDraftWO}
        onClose={() => setAgreementDraftWO(null)}
        workOrder={agreementDraftWO}
      />

      {/* Skip for Now — Reminder Date Dialog */}
      <Dialog open={!!skipTarget} onOpenChange={(open) => !open && setSkipTarget(null)}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>Skip Agreement for Now</DialogTitle>
            <DialogDescription>
              {skipTarget?.clientName} — {skipTarget?.workOrderId || skipTarget?.id}. The posts will be deployed to Operations now, and the formal agreement will be marked as pending with a follow-up reminder.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="reminderDate">Next Reminder Date</Label>
            <Input
              id="reminderDate"
              type="date"
              value={skipReminderDate}
              min={new Date().toISOString().split('T')[0]}
              onChange={(e) => setSkipReminderDate(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">You&apos;ll be reminded on this date to complete the agreement.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSkipTarget(null)}>Cancel</Button>
            <Button
              onClick={handleConfirmSkip}
              disabled={!skipReminderDate || skippingIds.has(skipTarget?.id || skipTarget?.workOrderId)}
              className="bg-safend-red hover:bg-red-700 text-white"
            >
              {skippingIds.has(skipTarget?.id || skipTarget?.workOrderId) ? 'Processing...' : 'Skip & Deploy Posts'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
