'use client';

import { useState, useEffect, useCallback, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { BasicInfoTab } from "./workorder/BasicInfoTab";
import { DocumentsTab, type WorkOrderUploadMode } from "./workorder/DocumentsTab";
import {
  SecurityPostsEditor,
  createEmptyServiceInstances,
  ensurePerPostInstances,
  getPostServiceInstances,
  calculatePostMonthlySubtotal,
  type ServiceInstancesMap,
  type PerPostServiceInstances,
} from "./SecurityPostsEditor";
import { isNoGstValue } from "./workorder/BasicInfoTab";
import { uploadWorkorderDocument } from "@/lib/r2-storage";
import {
  addWorkOrder,
  updateWorkOrder,
  generateUniqueWorkOrderId,
  type PerPostWorkOrderDetail,
} from "@/services/supabase/WorkOrderFirebaseService";
import { ensureClient } from "@/services/supabase/ClientService";
import { getQuotationByDisplayId } from "@/services/supabase/QuotationFirebaseService";
import { useAgreementsData } from "@/contexts/AgreementsDataContext";
import { saveFormDraft, loadFormDraft, clearFormDraft } from "@/utils/formDraft";

// Form draft key
const WORKORDER_FORM_DRAFT_KEY = 'workorder_form';

/** A work order runs for 12 months, so a post's value = its monthly value × 12 */
const CONTRACT_MONTHS = 12;

/** Tags the work orders raised together in one save (one per post). */
const newBatchId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Older browsers: good enough for a grouping tag
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;
};

/**
 * Roll up per-post Start Date / End Date / Value into the overall WO totals:
 * earliest start, latest end, and the sum of all posts' values. Empty results
 * (e.g. no posts filled in yet) are returned blank so callers can fall back to
 * the current value rather than wiping a required field.
 */
const computePerPostRollup = (perPostDetails: Record<string, PerPostWorkOrderDetail>) => {
  const entries = Object.values(perPostDetails);
  const startDates = entries.map(d => d.startDate).filter(Boolean) as string[];
  const endDates = entries.map(d => d.endDate).filter(Boolean) as string[];
  const total = entries.reduce((sum, d) => sum + (parseFloat(d.value || '0') || 0), 0);
  return {
    startDate: startDates.length ? startDates.sort()[0] : '',
    endDate: endDates.length ? endDates.sort().slice(-1)[0] : '',
    value: total > 0 ? String(total) : '',
  };
};

/**
 * Reserve a full, independent Work Order ID for every security post.
 *
 * Per-post work orders are NOT children of a parent work order — each one is a
 * work order in its own right (WO-2026-5624, WO-2026-5625, …) linked to the
 * customer, so no ID is derived from another. IDs already reserved are never
 * reassigned; only posts without one get a fresh ID.
 *
 * Each candidate is checked against the database, and against the IDs reserved
 * earlier in this same pass (which aren't in the database yet).
 */
const reservePerPostWorkOrderIds = async (
  current: Record<string, string>,
  postCount: number
): Promise<Record<string, string>> => {
  const next = { ...current };
  const taken = new Set(Object.values(next).filter(Boolean));

  for (let i = 0; i < postCount; i++) {
    if (next[String(i)]) continue;

    let candidate = await generateUniqueWorkOrderId();
    for (let attempt = 0; attempt < 10 && taken.has(candidate); attempt++) {
      candidate = await generateUniqueWorkOrderId();
    }

    next[String(i)] = candidate;
    taken.add(candidate);
  }
  return next;
};

interface WorkorderFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: any) => void;
  editData: any | null;
}

export function WorkorderForm({ isOpen, onClose, onSubmit, editData }: WorkorderFormProps) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("basic");
  const { agreements } = useAgreementsData();

  // Collapsible state for the security posts editor
  const [expandedPostIndex, setExpandedPostIndex] = useState<number | null>(0);
  const [servicesExpandedForPost, setServicesExpandedForPost] = useState<number | null>(null);

  // Convert legacy work-order `posts` array into quotation-style `locations`
  const legacyPostsToLocations = (posts: any[]): any[] =>
    (posts || []).map((p: any) => ({
      name: p.name || p.postName || "",
      address: p.location?.address || p.postAddress || p.address || "",
      city: p.location?.city || p.city || "",
      district: p.location?.district || p.district || "",
      state: p.location?.state || p.state || "",
      pincode: p.location?.pincode || p.pincode || "",
      // Preserve pinned coordinates when reloading an existing work order so
      // the map pin picker shows the saved position instead of resetting.
      lat: p.lat ?? p.location?.latitude ?? "",
      lng: p.lng ?? p.location?.longitude ?? "",
      guards: p.totalGuards || p.guards || 0,
      asPerStateMinWage: p.asPerStateMinWage || false,
      profitMargin: p.profitMargin || "",
    }));

  // Security posts (quotation-style): locations + per-post serviceInstances
  const [locations, setLocations] = useState<any[]>(
    editData?.locations?.length ? editData.locations : legacyPostsToLocations(editData?.posts || [])
  );

  // Build initial per-post instances from editData
  const buildInitialPerPostInstances = (): PerPostServiceInstances => {
    const initialLocations = editData?.locations?.length
      ? editData.locations
      : legacyPostsToLocations(editData?.posts || []);

    // New format: perPostServiceInstances already stored per-post
    if (editData?.perPostServiceInstances && Object.keys(editData.perPostServiceInstances).length) {
      return ensurePerPostInstances(editData.perPostServiceInstances, initialLocations.length);
    }

    // Legacy format: single serviceInstances → apply to all existing posts
    if (editData?.serviceInstances && Object.keys(editData.serviceInstances).length) {
      const perPost: PerPostServiceInstances = {};
      const count = Math.max(1, initialLocations.length);
      for (let i = 0; i < count; i++) {
        perPost[String(i)] = editData.serviceInstances;
      }
      return perPost;
    }

    // Fresh form
    return ensurePerPostInstances({}, Math.max(1, initialLocations.length));
  };

  const [perPostServiceInstances, setPerPostServiceInstances] = useState<PerPostServiceInstances>(
    buildInitialPerPostInstances
  );
  const [gstPercentage, setGstPercentage] = useState<number>(editData?.gstPercentage ?? 18);
  const [gstExempt, setGstExempt] = useState<boolean>(editData?.gstExempt ?? false);

  // Form state
  const [formData, setFormData] = useState({
    // Basic information
    id: editData?.workOrderId || editData?.id || generateWorkorderId(),
    // Customer identity — the anchor every work order hangs off. clientId is the
    // clients.id FK; customerId is the display ID (SF<seq>-YYMMDD, e.g. SF01-260801).
    // Both are resolved from the client name, and created on save if this is a new client.
    clientId: editData?.clientId || "",
    customerId: editData?.customerId || "",
    /** Set when this work order was raised alongside siblings, one per post */
    batchId: editData?.batchId || "",
    client: editData?.client || editData?.clientName || "",
    clientWoRef: editData?.clientWoRef || "",
    clientGst: editData?.clientGst || "",
    quotationRef: editData?.quotationRef || editData?.linkedQuoteId || "",
    agreementRef: editData?.agreementRef || (() => {
      // Resolve agreement UUID to display ID
      const agId = editData?.linkedAgreementId;
      if (!agId) return "";
      const found = agreements.find((a: any) => a.id === agId);
      return found?.agreementId || agId;
    })(),
    service: editData?.service || editData?.serviceDetails || "",
    startDate: editData?.startDate || getCurrentDate(),
    endDate: editData?.endDate || "",
    value: (editData?.value || "").replace("₹", "") || "",
    status: editData?.status || "Draft",
    contactPerson: editData?.contactPerson || "",
    contactPhone: editData?.contactPhone || "",
    contactEmail: editData?.contactEmail || "",
    // Client address
    address: editData?.address || "",
    city: editData?.city || "",
    state: editData?.state || "",
    pincode: editData?.pincode || "",

    // Contracted billing rate basis (see BasicInfoTab). Deliberately blank when
    // unset so invoicing blocks instead of guessing a divisor.
    rateBasis: editData?.rateBasis || "",
    basisDays: editData?.basisDays != null ? String(editData.basisDays) : "",

    // Document uploads
    documentUrl: editData?.documentUrl || "",
    clientApproval: editData?.clientApproval || "",
    clientApprovalMode: (editData?.clientApprovalMode || 'unified') as WorkOrderUploadMode,
    clientApprovalPerPost: (editData?.clientApprovalPerPost || {}) as Record<string, string>,
    clientWoRefPerPost: (editData?.clientWoRefPerPost || {}) as Record<string, string>,
    // Per-post Start Date / End Date / Contract Value / Quotation Ref and the
    // PDF generated for that post — only used when clientApprovalMode =
    // 'per-post' (each post has its own signed WO)
    perPostDetails: (editData?.perPostDetails || {}) as Record<string, PerPostWorkOrderDetail>,
    // Per-post Work Order IDs — auto-generated when per-post mode is selected
    perPostWorkOrderIds: (editData?.perPostWorkOrderIds || {}) as Record<string, string>,
  });

  // Fetch posts & services from the linked quotation when none are present yet.
  useEffect(() => {
    const quoteRef = formData.quotationRef;
    if (!isOpen || !quoteRef) return;
    const hasLocations = locations && locations.length > 0;
    const hasServices = Object.values(perPostServiceInstances).some(svcMap =>
      Object.values(svcMap).some(arr =>
        arr.some(inst => Object.values(inst.shifts).some((s: any) => s.enabled))
      )
    );

    let cancelled = false;
    (async () => {
      const result = await getQuotationByDisplayId(quoteRef);
      if (cancelled || !result.success || !result.data) return;
      const q = result.data;
      if (!hasLocations && q.locations?.length) {
        setLocations(q.locations);
      }
      if (!hasServices && q.serviceInstances && Object.keys(q.serviceInstances).length) {
        // Apply quotation's single serviceInstances to all posts as starting point
        const qLocs = q.locations?.length ? q.locations : locations;
        const newPerPost: PerPostServiceInstances = {};
        for (let i = 0; i < Math.max(1, qLocs.length); i++) {
          newPerPost[String(i)] = q.serviceInstances;
        }
        setPerPostServiceInstances(newPerPost);
      }
      if (q.gstPercentage !== undefined) setGstPercentage(q.gstPercentage);
      if (q.gstExempt !== undefined) setGstExempt(q.gstExempt);

      const firstLoc = (q.locations && q.locations[0]) || {};
      const fallbackAddress = q.address || firstLoc.address || "";
      const fallbackCity = q.city || firstLoc.city || firstLoc.district || "";
      const fallbackState = q.state || firstLoc.state || "";
      const fallbackPincode = q.pincode || firstLoc.pincode || "";

      setFormData(prev => ({
        ...prev,
        client: prev.client || q.client || q.companyName || "",
        contactPerson: prev.contactPerson || q.contactPerson || "",
        contactEmail: prev.contactEmail || q.contactEmail || "",
        contactPhone: prev.contactPhone || q.contactPhone || "",
        address: prev.address || fallbackAddress,
        city: prev.city || fallbackCity,
        state: prev.state || fallbackState,
        pincode: prev.pincode || fallbackPincode,
        service: prev.service || q.service || "",
      }));
    })();
    return () => { cancelled = true; };
  }, [isOpen, formData.quotationRef]);

  // Load draft on open (only for new workorders)
  useEffect(() => {
    if (isOpen && !editData) {
      const draft = loadFormDraft<any>(WORKORDER_FORM_DRAFT_KEY);
      if (draft) {
        const { _locations, _perPostServiceInstances, _serviceInstances, ...formFields } = draft;
        // A restored draft gets a fresh WO ID. Its per-post IDs are dropped too:
        // they were reserved in the previous session and are re-reserved below,
        // which also re-checks them against the database.
        setFormData(prev => ({
          ...prev,
          ...formFields,
          id: generateWorkorderId(),
          perPostWorkOrderIds: {},
        }));
        if (_locations && _locations.length > 0) setLocations(_locations);
        if (_perPostServiceInstances && Object.keys(_perPostServiceInstances).length > 0) {
          setPerPostServiceInstances(_perPostServiceInstances);
        } else if (_serviceInstances && Object.keys(_serviceInstances).length > 0) {
          // Legacy draft: single serviceInstances
          const count = _locations?.length || 1;
          const newPerPost: PerPostServiceInstances = {};
          for (let i = 0; i < count; i++) newPerPost[String(i)] = _serviceInstances;
          setPerPostServiceInstances(newPerPost);
        }
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, !!editData]);

  // Save draft on form data change (debounced, only for new workorders)
  useEffect(() => {
    if (isOpen && !editData) {
      const timeoutId = setTimeout(() => {
        if (formData.client || formData.value || locations.length > 0) {
          saveFormDraft(WORKORDER_FORM_DRAFT_KEY, {
            ...formData,
            _locations: locations,
            _perPostServiceInstances: perPostServiceInstances,
          });
        }
      }, 500);
      return () => clearTimeout(timeoutId);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData, locations, perPostServiceInstances, isOpen, !!editData]);

  // Ensure perPostServiceInstances stays in sync when locations change.
  // Per-post WO IDs for any new post are reserved by the effect below.
  const handleLocationsChange = (newLocations: any[]) => {
    setLocations(newLocations);
    setPerPostServiceInstances(prev => ensurePerPostInstances(prev, newLocations.length));
  };

  // Monthly value of each post's services, before GST
  const postMonthlyValues = useMemo(() => {
    const totals: Record<string, number> = {};
    for (let i = 0; i < locations.length; i++) {
      totals[String(i)] = calculatePostMonthlySubtotal(
        getPostServiceInstances(perPostServiceInstances, i)
      );
    }
    return totals;
  }, [locations.length, perPostServiceInstances]);

  // Auto-fill each post's contract value from its services (monthly × 12).
  // Only fills blanks, so a value typed by hand is never overwritten.
  useEffect(() => {
    if (!isOpen || formData.clientApprovalMode !== 'per-post') return;
    setFormData(prev => {
      const nextDetails = { ...(prev.perPostDetails || {}) };
      let changed = false;

      Object.entries(postMonthlyValues).forEach(([key, monthly]) => {
        if (monthly <= 0) return;
        if (nextDetails[key]?.value) return;
        nextDetails[key] = { ...(nextDetails[key] || {}), value: String(monthly * CONTRACT_MONTHS) };
        changed = true;
      });

      if (!changed) return prev;
      const rollup = computePerPostRollup(nextDetails);
      return {
        ...prev,
        perPostDetails: nextDetails,
        value: rollup.value || prev.value,
      };
    });
  }, [isOpen, formData.clientApprovalMode, postMonthlyValues]);

  /**
   * Reserve an independent Work Order ID per post while per-post mode is active.
   * Each is checked against the database, so the IDs shown on the cards are the
   * IDs the work orders will actually be created with.
   */
  useEffect(() => {
    if (!isOpen || formData.clientApprovalMode !== 'per-post') return;

    const postCount = locations.length;
    if (postCount === 0) return;

    const current = formData.perPostWorkOrderIds || {};
    const missing = Array.from({ length: postCount }, (_, i) => String(i))
      .some(key => !current[key]);
    if (!missing) return;

    let cancelled = false;
    (async () => {
      const reserved = await reservePerPostWorkOrderIds(current, postCount);
      if (cancelled) return;
      setFormData(prev => ({ ...prev, perPostWorkOrderIds: reserved }));
    })();
    return () => { cancelled = true; };
  }, [isOpen, formData.clientApprovalMode, formData.perPostWorkOrderIds, locations.length]);

  // New work orders: make sure the generated display ID isn't already in use
  useEffect(() => {
    if (!isOpen || editData) return;
    let cancelled = false;
    (async () => {
      const currentId = formData.id;
      const uniqueId = await generateUniqueWorkOrderId(currentId);
      if (cancelled || uniqueId === currentId) return;
      setFormData(prev => {
        if (prev.id !== currentId) return prev; // user or draft changed it meanwhile
        return { ...prev, id: uniqueId };
      });
    })();
    return () => { cancelled = true; };
  // Re-checks whenever the ID changes (e.g. a restored draft brings its own)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, !!editData, formData.id]);

  /**
   * Posts whose work order was already created in this dialog session. Per-post
   * saves happen row by row, so if one fails halfway the next attempt must not
   * create duplicates for the rows that already went through.
   */
  const [savedPostIndices, setSavedPostIndices] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (isOpen) setSavedPostIndices(new Set());
  }, [isOpen]);

  /**
   * Resolve the customer behind the typed client name so the form can show the
   * Customer ID before saving. Read-only: the customer record is created (and
   * its ID minted) on submit, never while typing.
   */
  useEffect(() => {
    if (!isOpen) return;
    const name = formData.client?.trim();
    if (!name) return;

    let cancelled = false;
    const timeoutId = setTimeout(async () => {
      const { getClientByName } = await import('@/services/supabase/ClientService');
      const existing = await getClientByName(name);
      if (cancelled) return;
      setFormData(prev => {
        // Don't fight a name the user has since changed
        if (prev.client?.trim() !== name) return prev;
        const nextId = existing?.id || '';
        const nextCustomerId = existing?.customerId || '';
        if (prev.clientId === nextId && prev.customerId === nextCustomerId) return prev;
        return { ...prev, clientId: nextId, customerId: nextCustomerId };
      });
    }, 400);

    return () => { cancelled = true; clearTimeout(timeoutId); };
  }, [isOpen, formData.client]);

  // Update service instances for a single post
  const handlePostServiceInstancesChange = (postIndex: number, next: ServiceInstancesMap) => {
    setPerPostServiceInstances(prev => ({
      ...prev,
      [String(postIndex)]: next,
    }));
  };

  // Handle close
  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);
  
  // Generate workorder ID
  function generateWorkorderId() {
    const year = new Date().getFullYear();
    const randomNum = Math.floor(1000 + Math.random() * 9000);
    return `WO-${year}-${randomNum.toString().padStart(4, '0')}`;
  }
  
  // Get current date in YYYY-MM-DD format
  function getCurrentDate() {
    const now = new Date();
    return now.toISOString().split('T')[0];
  }
  
  // Handle input changes
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };
  
  // Handle select changes
  const handleSelectChange = (value: string, name: string) => {
    setFormData(prev => {
      if (name === 'rateBasis') {
        // A fixed-day divisor is meaningful only for the fixed-days basis.
        // Clearing it for every other basis prevents stale terms being saved.
        return {
          ...prev,
          rateBasis: value,
          basisDays: value === 'fixed_days' ? prev.basisDays : '',
        };
      }
      return { ...prev, [name]: value };
    });
  };
  
  // Pincode lookup - fetch district and state from PIN code for a post
  const fetchPincodeDetails = async (locationIndex: number, pincode: string) => {
    try {
      const response = await fetch(`/api/pincode-lookup?pincode=${pincode}`);
      const result = await response.json();
      if (response.ok && result.success) {
        const { district, state } = result.data;
        setLocations(prev => {
          const updated = [...prev];
          updated[locationIndex] = {
            ...updated[locationIndex],
            district: district || updated[locationIndex].district,
            state: state || updated[locationIndex].state,
          };
          return updated;
        });
      }
    } catch {
      // Silently fail - user can manually enter district/state
    }
  };
  
  // Handle file upload
  const handleFileUpload = async (field: string) => {
    // Create a file input and trigger it
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf,.jpg,.jpeg,.png,.doc,.docx';
    
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      
      toast({
        title: "Uploading...",
        description: `Uploading ${file.name}`,
      });
      
      try {
        const result = await uploadWorkorderDocument(file, formData.id || `wo_${Date.now()}`);
        
        if (result.success && result.url) {
          setFormData(prev => ({
            ...prev,
            [field]: result.url
          }));
          
          toast({
            title: "Upload Successful",
            description: `${file.name} has been uploaded`,
          });
        } else {
          throw new Error(result.error || 'Upload failed');
        }
      } catch (error: any) {
        toast({
          title: "Upload Failed",
          description: error.message || "Failed to upload document",
          variant: "destructive",
        });
      }
    };
    
    input.click();
  };

  // Handle per-post file upload (per-post mode)
  const handlePerPostUpload = async (postIndex: number) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf,.jpg,.jpeg,.png,.doc,.docx';

    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      toast({ title: "Uploading...", description: `Uploading for ${locations[postIndex]?.name || `Post ${postIndex + 1}`}` });

      try {
        // Store under this post's own WO ID so the file is traceable to it
        const postWoId = formData.perPostWorkOrderIds?.[String(postIndex)]
          || `${formData.id || `wo_${Date.now()}`}_post${postIndex}`;
        const result = await uploadWorkorderDocument(file, postWoId);
        if (result.success && result.url) {
          setFormData(prev => ({
            ...prev,
            clientApprovalPerPost: {
              ...(prev.clientApprovalPerPost || {}),
              [String(postIndex)]: result.url!,
            },
          }));
          toast({ title: "Upload Successful", description: `${file.name} uploaded for ${locations[postIndex]?.name || `Post ${postIndex + 1}`}` });
        } else {
          throw new Error(result.error || 'Upload failed');
        }
      } catch (error: any) {
        toast({ title: "Upload Failed", description: error.message || "Failed to upload document", variant: "destructive" });
      }
    };

    input.click();
  };

  // Handle upload mode change — non-destructive: the inactive mode's documents
  // and refs are kept so toggling back restores them (and uploaded files in R2
  // are never orphaned). Only the active mode is read downstream.
  const handleUploadModeChange = (mode: WorkOrderUploadMode) => {
    setFormData(prev => {
      // Switching to per-post only flips the mode; the effect above reserves an
      // independent Work Order ID for each post.
      return { ...prev, clientApprovalMode: mode };
    });
  };

  // Handle WO number changes — per-post only (unified uses clientWoRef in Section 1)
  const handleWoNumberChange = (postIndex: number, value: string) => {
    setFormData(prev => ({
      ...prev,
      clientWoRefPerPost: { ...(prev.clientWoRefPerPost || {}), [String(postIndex)]: value },
    }));
  };

  // Handle per-post Start Date / End Date / Contract Value / Quotation Ref (per-post upload mode)
  const handlePerPostDetailChange = (
    postIndex: number,
    field: 'startDate' | 'endDate' | 'value' | 'quotationRef',
    value: string
  ) => {
    setFormData(prev => {
      const nextPerPostDetails = {
        ...(prev.perPostDetails || {}),
        [String(postIndex)]: {
          ...(prev.perPostDetails?.[String(postIndex)] || {}),
          [field]: value,
        },
      };
      // Quotation ref is post-scoped — it never feeds the WO-level rollup
      if (field === 'quotationRef') {
        return { ...prev, perPostDetails: nextPerPostDetails };
      }
      const rollup = computePerPostRollup(nextPerPostDetails);
      return {
        ...prev,
        perPostDetails: nextPerPostDetails,
        // Work Order Identity totals stay in sync with the per-post values
        // whenever the client sends a separate signed WO for each post.
        startDate: rollup.startDate || prev.startDate,
        endDate: rollup.endDate || prev.endDate,
        value: rollup.value || prev.value,
      };
    });
  };

  /**
   * Build a WO PDF, hand it to the user as a download, and archive a copy in R2
   * so the link survives the session. Returns the stored URL, or null when the
   * PDF could not be built (archiving failures still keep the download).
   */
  const requestWorkOrderPdf = async (payload: Record<string, any>, fileLabel: string): Promise<string | null> => {
    try {
      const res = await fetch('/api/workorder-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        toast({ title: 'Error', description: 'Failed to generate PDF', variant: 'destructive' });
        return null;
      }

      const blob = await res.blob();

      // Download for the client to sign
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = `${fileLabel}.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 10000);

      // Archive so the "generated PDF" link keeps working after this session
      const stored = await uploadWorkorderDocument(
        new File([blob], `${fileLabel}.pdf`, { type: 'application/pdf' }),
        `${fileLabel}_generated`
      );

      if (stored.success && stored.url) {
        toast({ title: 'PDF Generated', description: `${fileLabel} downloaded and saved` });
        return stored.url;
      }

      toast({
        title: 'PDF Downloaded',
        description: 'The PDF was downloaded but could not be saved to storage',
      });
      return null;
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'PDF generation failed', variant: 'destructive' });
      return null;
    }
  };

  /** Shared client/service details every WO PDF needs */
  const basePdfPayload = () => ({
    client: formData.client,
    clientGst: formData.clientGst,
    clientWoRef: formData.clientWoRef,
    contactPerson: formData.contactPerson,
    contactPhone: formData.contactPhone,
    contactEmail: formData.contactEmail,
    address: formData.address,
    city: formData.city,
    state: formData.state,
    pincode: formData.pincode,
    // Include the commercial billing rule in the client-facing document so the
    // rate conversion is explicit, not an internal-only setting.
    rateBasis: formData.rateBasis || null,
    basisDays: formData.rateBasis === 'fixed_days' ? Number(formData.basisDays) || null : null,
  });

  // Combined PDF covering every post on this work order
  const handleGenerateWorkOrderPdf = async (): Promise<string | null> => {
    const url = await requestWorkOrderPdf({
      ...basePdfPayload(),
      workOrderId: formData.id,
      quotationRef: formData.quotationRef,
      startDate: formData.startDate,
      endDate: formData.endDate,
      value: formData.value,
      // Monthly figure the rate table adds up to, so the PDF can state both
      monthlyValue: Object.values(postMonthlyValues).reduce((s, v) => s + v, 0),
      contractMonths: CONTRACT_MONTHS,
      locations,
      serviceInstances: getPostServiceInstances(perPostServiceInstances, 0),
      perPostServiceInstances,
      perPostWorkOrderIds: formData.clientApprovalMode === 'per-post'
        ? formData.perPostWorkOrderIds
        : undefined,
    }, formData.id || 'WorkOrder');

    if (url) setFormData(prev => ({ ...prev, documentUrl: url }));
    return url;
  };

  // PDF scoped to a single post, carrying that post's own WO ID, dates and value
  const handleGeneratePostPdf = async (postIndex: number): Promise<string | null> => {
    const post = locations[postIndex];
    if (!post) return null;

    const detail = formData.perPostDetails?.[String(postIndex)] || {};
    // The ID reserved for this post's work order; falls back to the form's own
    // ID only if reservation hasn't landed yet.
    const postWoId = formData.perPostWorkOrderIds?.[String(postIndex)] || formData.id;

    const url = await requestWorkOrderPdf({
      ...basePdfPayload(),
      workOrderId: postWoId,
      clientWoRef: formData.clientWoRefPerPost?.[String(postIndex)] || formData.clientWoRef,
      quotationRef: detail.quotationRef || formData.quotationRef,
      startDate: detail.startDate || formData.startDate,
      endDate: detail.endDate || formData.endDate,
      value: detail.value || '',
      monthlyValue: postMonthlyValues[String(postIndex)] || 0,
      contractMonths: CONTRACT_MONTHS,
      locations: [post],
      serviceInstances: getPostServiceInstances(perPostServiceInstances, postIndex),
    }, postWoId);

    if (url) {
      setFormData(prev => ({
        ...prev,
        perPostDetails: {
          ...(prev.perPostDetails || {}),
          [String(postIndex)]: { ...(prev.perPostDetails?.[String(postIndex)] || {}), documentUrl: url },
        },
      }));
    }
    return url;
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate mandatory fields
    const missing = [];
    if (!formData.clientGst?.trim() && !isNoGstValue(formData.clientGst)) missing.push('Client GST');
    if (!formData.client?.trim()) missing.push('Client Name');
    if (!formData.contactPerson?.trim()) missing.push('Contact Person');
    if (!formData.contactPhone?.trim()) missing.push('Contact Phone');
    if (!formData.startDate) missing.push('Start Date');
    if (!formData.address?.trim()) missing.push('Billing Address');
    if (!formData.value?.trim()) missing.push('Contract Value');
    if (!formData.rateBasis) missing.push('Billing Rate Basis');
    if (formData.rateBasis === 'fixed_days' && !String(formData.basisDays || '').trim()) {
      missing.push('Days per Month');
    }
    
    if (missing.length > 0) {
      toast({
        title: "Required Fields Missing",
        description: missing.join(', '),
        variant: "destructive",
      });
      return;
    }

    const basisDays = Number(formData.basisDays);
    if (formData.rateBasis === 'fixed_days' && (!Number.isInteger(basisDays) || basisDays < 1 || basisDays > 31)) {
      toast({
        title: 'Invalid billing basis',
        description: 'Days per Month must be a whole number from 1 to 31 for a fixed-days contract.',
        variant: 'destructive',
      });
      return;
    }
    
    // Ensure all posts have a name and address
    if (locations.some((loc: any) => !loc.name || !loc.address)) {
      toast({
        title: "Error",
        description: "All posts must have a name and address.",
        variant: "destructive",
      });
      return;
    }
    
    try {
      clearFormDraft(WORKORDER_FORM_DRAFT_KEY);

      // ── Customer identity ────────────────────────────────────────────────
      // Every work order hangs off a customer, so resolve (or create) it first.
      // A brand-new client gets its Customer ID minted here.
      const customerResult = await ensureClient({
        name: formData.client.trim(),
        companyName: formData.client.trim(),
        clientType: 'regular',
        gstin: formData.clientGst,
        contactPerson: formData.contactPerson,
        contactEmail: formData.contactEmail,
        contactPhone: formData.contactPhone,
        address: formData.address,
        city: formData.city,
        state: formData.state,
        pincode: formData.pincode,
      });

      if (!customerResult.success || !customerResult.data) {
        toast({
          title: "Customer could not be saved",
          description: customerResult.error || 'Unable to resolve the customer for this work order',
          variant: "destructive",
        });
        return;
      }

      const customer = customerResult.data;
      setFormData(prev => ({ ...prev, clientId: customer.id, customerId: customer.customerId }));

      // Map quotation-style locations into the legacy posts shape consumed
      // by Operations sync and the work order detail view.
      const mappedPosts = locations.map((loc: any, idx: number) => ({
        id: loc.id || `post-${idx}`,
        name: loc.name || `Post ${idx + 1}`,
        postName: loc.name || `Post ${idx + 1}`,
        address: loc.address || "",
        postAddress: loc.address || "",
        city: loc.city || "",
        district: loc.district || "",
        state: loc.state || "",
        pincode: loc.pincode || "",
        // Map-pinned coordinates — these flow through to
        // operational_posts.location.latitude/longitude and drive the fleet map.
        lat: loc.lat ?? "",
        lng: loc.lng ?? "",
        totalGuards: loc.guards || 0,
        guards: loc.guards || 0,
        asPerStateMinWage: loc.asPerStateMinWage || false,
        profitMargin: loc.profitMargin || "",
      }));

      const formattedData = {
        ...formData,
        clientId: customer.id,
        customerId: customer.customerId,
        value: formData.value ? `₹${formData.value}` : "₹0",
        locations,
        // Save both formats: per-post (new) and flattened first-post (legacy compatibility)
        serviceInstances: getPostServiceInstances(perPostServiceInstances, 0),
        perPostServiceInstances,
        gstPercentage,
        gstExempt,
        posts: mappedPosts,
      };

      // Details shared by every work order raised in this save, whether that is
      // one unified work order or one per post.
      const customerFields = {
        clientId: customer.id,
        customerId: customer.customerId,
        clientName: formattedData.client,
        companyName: formattedData.client,
        clientGst: formattedData.clientGst,
        contactPerson: formattedData.contactPerson,
        contactEmail: formattedData.contactEmail,
        contactPhone: formattedData.contactPhone,
        address: formattedData.address,
        city: formattedData.city,
        state: formattedData.state,
        pincode: formattedData.pincode,
        serviceDetails: formattedData.service,
        gstPercentage,
        gstExempt,
        rateBasis: (formData.rateBasis || null) as 'calendar_month' | 'fixed_days' | 'per_duty' | null,
        basisDays: formData.rateBasis === 'fixed_days' ? Number(formData.basisDays) || null : null,
        status: formattedData.status,
      };

      // ── Per post: one independent work order per security post ───────────
      //
      // These are siblings, not children: each row is a complete single-post
      // work order with its own ID, dates, value, refs and signed document, all
      // linked to the customer and tagged with a shared batch id. Because each
      // row holds exactly one post, none of them needs the per-post maps —
      // clientApprovalMode goes back to 'unified' on every row.
      if (formData.clientApprovalMode === 'per-post' && locations.length > 0) {
        const batchId = formData.batchId || newBatchId();
        const failures: string[] = [];
        const createdIds: string[] = [];
        const savedNow = new Set(savedPostIndices);

        for (let idx = 0; idx < locations.length; idx++) {
          if (savedNow.has(idx)) continue; // already created by an earlier attempt

          const detail = formData.perPostDetails?.[String(idx)] || {};
          const postName = locations[idx]?.name?.trim() || `Post ${idx + 1}`;
          const postInstances = getPostServiceInstances(perPostServiceInstances, idx);
          const postValue = detail.value
            || String((postMonthlyValues[String(idx)] || 0) * CONTRACT_MONTHS);
          const postWorkOrderId = formData.perPostWorkOrderIds?.[String(idx)]
            || await generateUniqueWorkOrderId();

          const payload = {
            ...customerFields,
            linkedAgreementId: '',
            linkedQuoteId: detail.quotationRef || formattedData.quotationRef || '',
            workOrderId: postWorkOrderId,
            batchId,
            clientWoRef: formData.clientWoRefPerPost?.[String(idx)] || '',
            value: `₹${postValue || '0'}`,
            startDate: detail.startDate || formattedData.startDate,
            endDate: detail.endDate || formattedData.endDate,
            posts: [mappedPosts[idx]],
            locations: [locations[idx]],
            serviceInstances: postInstances,
            perPostServiceInstances: { '0': postInstances },
            documentUrl: detail.documentUrl || '',
            clientApproval: formData.clientApprovalPerPost?.[String(idx)] || '',
            clientApprovalMode: 'unified' as const,
          };

          // Reuse the row being edited for the first post rather than orphaning it
          const rowResult = (idx === 0 && editData?.id)
            ? await updateWorkOrder(editData.id, payload)
            : await addWorkOrder(payload);

          if (rowResult.success) {
            savedNow.add(idx);
            createdIds.push(postWorkOrderId);
          } else {
            failures.push(`${postName}: ${rowResult.error || 'save failed'}`);
            break; // stop on first failure so the report stays accurate
          }
        }

        setSavedPostIndices(savedNow);

        if (failures.length > 0) {
          toast({
            title: createdIds.length > 0 ? "Partly saved" : "Failed to save work orders",
            description: createdIds.length > 0
              ? `Created ${createdIds.length} of ${locations.length}. ${failures[0]}. Saving again will only retry the rest.`
              : failures[0],
            variant: "destructive",
          });
          return;
        }

        toast({
          title: `${locations.length} work orders created`,
          description: `${createdIds.join(', ')} — all linked to ${customer.customerId}`,
        });

        onSubmit(formattedData);
        handleClose();

        if (formattedData.status === 'Completed') {
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent('navigateToTab', { detail: { tab: 'contracts' } }));
            window.dispatchEvent(new CustomEvent('switchContractSubTab', { detail: { tab: 'agreements' } }));
          }, 300);
        }
        return;
      }

      let result;

      if (editData?.id) {
        // Editing existing work order — update and mark as Completed
        result = await updateWorkOrder(editData.id, {
          ...customerFields,
          workOrderId: formattedData.id,
          clientWoRef: formattedData.clientWoRef,
          value: formattedData.value,
          startDate: formattedData.startDate,
          endDate: formattedData.endDate,
          posts: mappedPosts,
          locations,
          serviceInstances: formattedData.serviceInstances,
          perPostServiceInstances,
          documentUrl: formattedData.documentUrl,
          clientApproval: formattedData.clientApproval,
          clientApprovalMode: formattedData.clientApprovalMode,
          clientApprovalPerPost: formattedData.clientApprovalPerPost,
          clientWoRefPerPost: formattedData.clientWoRefPerPost,
          perPostDetails: formattedData.perPostDetails,
          perPostWorkOrderIds: formattedData.perPostWorkOrderIds,
          // Honour the Status picked in the Workorder Details tab
          status: formattedData.status,
        });
      } else {
        // Creating new work order
        result = await addWorkOrder({
          ...customerFields,
          linkedAgreementId: '',
          linkedQuoteId: formattedData.quotationRef || '',
          workOrderId: formattedData.id,
          clientWoRef: formattedData.clientWoRef,
          value: formattedData.value,
          posts: mappedPosts,
          locations,
          serviceInstances: formattedData.serviceInstances,
          perPostServiceInstances,
          documentUrl: formattedData.documentUrl,
          clientApproval: formattedData.clientApproval,
          clientApprovalMode: formattedData.clientApprovalMode,
          clientApprovalPerPost: formattedData.clientApprovalPerPost,
          clientWoRefPerPost: formattedData.clientWoRefPerPost,
          perPostDetails: formattedData.perPostDetails,
          perPostWorkOrderIds: formattedData.perPostWorkOrderIds,
          startDate: formattedData.startDate,
          endDate: formattedData.endDate,
        });
      }

      if (result.success) {
        onSubmit(formattedData);
        handleClose();
        
        // Completed work orders move on to the agreement stage — auto-navigate
        // there. Drafts stay put, they aren't ready for an agreement yet.
        if (formattedData.status === 'Completed') {
          // Small delay to let the form close first
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent('navigateToTab', { detail: { tab: 'contracts' } }));
            // Also switch to agreements sub-tab
            window.dispatchEvent(new CustomEvent('switchContractSubTab', { detail: { tab: 'agreements' } }));
          }, 300);
        }
      } else {
        toast({
          title: "Error",
          description: result.error || "Failed to save work order",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Error saving work order:', error);
      toast({
        title: "Error",
        description: "Failed to save work order: " + (error as Error).message,
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-[1400px]" preventOutsideClose={true}>
        <DialogHeader>
          <DialogTitle>{editData ? "Edit Work Order" : "Create New Work Order"}</DialogTitle>
          <DialogDescription>
            {editData ? "Update work order details and security posts" : "Create a new work order with security post assignments and staff requirements"}
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4 mt-4 max-h-[70vh] overflow-y-auto pr-2">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid grid-cols-3 mb-4">
              <TabsTrigger value="basic">Basic Info</TabsTrigger>
              <TabsTrigger value="posts">Security Posts</TabsTrigger>
              <TabsTrigger value="documents">Workorder Details</TabsTrigger>
            </TabsList>
            
            {/* Basic Information Tab */}
            <TabsContent value="basic">
              <BasicInfoTab 
                formData={formData} 
                handleChange={handleChange} 
                handleSelectChange={handleSelectChange}
                onGstFetch={(data) => {
                  // When the lookup returned a structured place of business, use
                  // its fields directly — no fragile string parsing needed.
                  if (data.structured) {
                    setFormData(prev => ({
                      ...prev,
                      client: data.client || prev.client,
                      address: data.structured!.address || prev.address,
                      city: data.structured!.city || prev.city,
                      state: data.structured!.state || prev.state,
                      pincode: data.structured!.pincode || prev.pincode,
                    }));
                    return;
                  }

                  // Parse the full address string into separate fields
                  let streetAddress = data.address || '';
                  let city = '';
                  let extractedPincode = data.pincode || '';
                  const gstState = data.state || '';

                  if (streetAddress) {
                    // Remove pincode from address if present
                    const pincodeMatch = streetAddress.match(/\b(\d{6})\b/);
                    if (pincodeMatch) {
                      extractedPincode = extractedPincode || pincodeMatch[1];
                      streetAddress = streetAddress.replace(pincodeMatch[0], '').trim();
                    }

                    // Remove state name from address if present
                    if (gstState) {
                      const stateRegex = new RegExp(`[,\\s]*${gstState}[,\\s]*`, 'i');
                      streetAddress = streetAddress.replace(stateRegex, ', ').trim();
                    }

                    // Split remaining by commas, last part is likely the city/district
                    const parts = streetAddress.split(',').map(p => p.trim()).filter(Boolean);
                    if (parts.length >= 2) {
                      city = parts[parts.length - 1];
                      streetAddress = parts.slice(0, -1).join(', ');
                    }

                    // Clean trailing commas/spaces
                    streetAddress = streetAddress.replace(/[,\s]+$/, '').trim();
                  }

                  setFormData(prev => ({
                    ...prev,
                    client: data.client || prev.client,
                    address: streetAddress || prev.address,
                    city: city || prev.city,
                    pincode: extractedPincode || prev.pincode,
                    state: gstState || prev.state,
                  }));
                }}
                onClientSelect={(fields) => {
                  setFormData(prev => ({
                    ...prev,
                    client: fields.client,
                    clientGst: fields.clientGst || prev.clientGst,
                    contactPerson: fields.contactPerson || prev.contactPerson,
                    contactPhone: fields.contactPhone || prev.contactPhone,
                    contactEmail: fields.contactEmail || prev.contactEmail,
                    address: fields.address || prev.address,
                    city: fields.city || prev.city,
                    state: fields.state || prev.state,
                    pincode: fields.pincode || prev.pincode,
                  }));
                }}
              />
            </TabsContent>
            
            {/* Security Posts Tab */}
            <TabsContent value="posts">
              <SecurityPostsEditor
                locations={locations}
                perPostServiceInstances={ensurePerPostInstances(perPostServiceInstances, locations.length)}
                gstPercentage={gstPercentage}
                gstExempt={gstExempt}
                expandedPostIndex={expandedPostIndex}
                servicesExpandedForPost={servicesExpandedForPost}
                onExpandedPostChange={setExpandedPostIndex}
                onServicesExpandedChange={setServicesExpandedForPost}
                onLocationsChange={handleLocationsChange}
                onPostServiceInstancesChange={handlePostServiceInstancesChange}
                fetchPincodeDetails={fetchPincodeDetails}
              />
            </TabsContent>
            
            {/* Documents Tab */}
            <TabsContent value="documents">
              <DocumentsTab 
                formData={formData}
                locations={locations}
                isEditing={!!editData?.id}
                handleChange={handleChange}
                handleSelectChange={handleSelectChange}
                handleFileUpload={handleFileUpload}
                handlePerPostUpload={handlePerPostUpload}
                onModeChange={handleUploadModeChange}
                onWoNumberChange={handleWoNumberChange}
                onPerPostDetailChange={handlePerPostDetailChange}
                onGeneratePdf={handleGenerateWorkOrderPdf}
                onGeneratePostPdf={handleGeneratePostPdf}
                postMonthlyValues={postMonthlyValues}
              />
            </TabsContent>
          </Tabs>
          
          <DialogFooter className="pt-4">
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" className="bg-safend-red hover:bg-red-700">
              {formData.clientApprovalMode === 'per-post' && locations.length > 0
                ? `${editData ? 'Save' : 'Create'} ${locations.length} Work Order${locations.length === 1 ? '' : 's'}`
                : editData ? "Update Work Order" : "Create Work Order"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
