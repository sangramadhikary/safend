'use client';
import { useState, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue, 
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Search, Loader2, CheckCircle2 } from "lucide-react";
import { addQuotation, updateQuotation } from "@/services/supabase/QuotationFirebaseService";
import { saveFormDraft, loadFormDraft, clearFormDraft } from "@/utils/formDraft";
import {
  SecurityPostsEditor,
  createEmptyServiceInstances,
  ensurePerPostInstances,
  getPostServiceInstances,
  type ServiceInstancesMap,
  type PerPostServiceInstances,
} from "./SecurityPostsEditor";

// Form draft key
const QUOTATION_FORM_DRAFT_KEY = 'quotation_form';

// Minimum wage daily gross rates per service category
// Wage categories per industry standard (FICCI / PSARA / CLC Watch & Ward notification):
//   Unarmed Guards  → Semi-Skilled  (PSARA-certified, trained — not unskilled)
//   Armed Guards    → Skilled       (weapon licence, higher training)
//   Supervisors     → Highly Skilled (supervisory role, PSARA-certified)
//   Patrol Officers → Skilled       (mobile patrol, trained)
// Rates: Odisha 2026 notification (₹/day incl. VDA), effective 1 April 2026
// Source: Govt. of Odisha / ETHRWorld notification:
//   Unskilled ₹472 · Semi-Skilled ₹522 · Skilled ₹572 · Highly Skilled ₹622
const MIN_WAGE_DAILY: Record<string, number> = {
  unarmedGuards:  522,  // Semi-Skilled
  armedGuards:    572,  // Skilled
  supervisors:    622,  // Highly Skilled
  patrolOfficers: 572,  // Skilled
};

// Manpower role → daily rate mapping (kept in sync with SecurityPostsEditor)
// Odisha 2026: Unskilled ₹472 · Semi-Skilled ₹522 · Skilled ₹572 · Highly Skilled ₹622
const MANPOWER_DAILY_RATE: Record<string, number> = {
  // Unskilled — ₹472/day: basic physical/errand tasks, no prior experience needed
  Peon: 472, OfficeBoy: 472, Labor: 472,
  DeliveryBoy: 472, Housekeeping: 472, Attendant: 472,
  // Semi-Skilled — ₹522/day: requires experience, responsibility, or domain familiarity
  Cook: 522, Driver: 522, Gardner: 522, Servant: 522,
  CareTaker: 522, BabySitter: 522, 'Pet-CareTaker': 522,
  Pujari: 522, OfficeAssistant: 522,
  // Skilled — ₹572/day: ITI-level trade qualification or equivalent
  Plumber: 572, Carpenter: 572, Electrician: 572, Technician: 572,
  Welder: 572, Mason: 572, Painter: 572, Mechanic: 572,
  // Highly Skilled — ₹622/day: professional qualification or supervisory role
  Accountant: 622, Supervisor: 622, DataEntryOp: 622,
};

const STATUTORY_RATE = 0.1611;
const WORKING_DAYS_PER_MONTH = 26;

const computeMinWageMonthlyRate = (serviceType: string, shiftType: string, margin: number, manpowerRole?: string): number => {
  let dailyWage: number;
  if (serviceType === 'manpower' && manpowerRole && MANPOWER_DAILY_RATE[manpowerRole]) {
    dailyWage = MANPOWER_DAILY_RATE[manpowerRole];
  } else {
    dailyWage = MIN_WAGE_DAILY[serviceType] || 0;
  }
  const statutory = dailyWage * STATUTORY_RATE;
  const dailyCTC = dailyWage + statutory;
  const totalDailyBilling = dailyCTC * (1 + margin / 100);
  const shiftMultiplier = shiftType === '12H' ? 1.5 : 1;
  return Math.round(totalDailyBilling * shiftMultiplier * WORKING_DAYS_PER_MONTH);
};

interface QuotationFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: any) => void;
  editData: any | null;
  initialData?: any | null;
}

export function QuotationForm({ isOpen, onClose, onSubmit, editData, initialData }: QuotationFormProps) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("basic");
  const [expandedPostIndex, setExpandedPostIndex] = useState<number | null>(0);
  const [servicesExpandedForPost, setServicesExpandedForPost] = useState<number | null>(null);

  // Security posts (quotation-style): locations + per-post serviceInstances
  const [locations, setLocations] = useState<any[]>(editData?.locations || []);

  const buildInitialPerPostInstances = (): PerPostServiceInstances => {
    const locs = editData?.locations || [];
    if (editData?.perPostServiceInstances && Object.keys(editData.perPostServiceInstances).length) {
      return ensurePerPostInstances(editData.perPostServiceInstances, locs.length);
    }
    if (editData?.serviceInstances && Object.keys(editData.serviceInstances).length) {
      const perPost: PerPostServiceInstances = {};
      const count = locs.length;
      for (let i = 0; i < count; i++) perPost[String(i)] = editData.serviceInstances;
      return perPost;
    }
    // Fresh form with no existing posts — return empty so no service section bleeds through
    return locs.length > 0 ? ensurePerPostInstances({}, locs.length) : {};
  };

  const [perPostServiceInstances, setPerPostServiceInstances] = useState<PerPostServiceInstances>(
    buildInitialPerPostInstances
  );
  const [gstPercentage, setGstPercentage] = useState<number>(editData?.gstPercentage ?? 18);
  const [gstExempt, setGstExempt] = useState<boolean>(editData?.gstExempt ?? false);

  // GST Lookup state
  const [gstLookupLoading, setGstLookupLoading] = useState(false);
  const [gstLookupError, setGstLookupError] = useState("");
  const [gstLookupSuccess, setGstLookupSuccess] = useState(false);
  const [gstLookupInput, setGstLookupInput] = useState(editData?.gstNumber || "");

  // Generate custom quotation ID
  const generateQuoteId = () => {
    const year = new Date().getFullYear();
    const randomNum = Math.floor(1000 + Math.random() * 9000);
    return `QT-${year}-${randomNum}`;
  };

  function getCurrentDate() {
    return new Date().toISOString().split('T')[0];
  }

  function getDefaultValidUntil() {
    const now = new Date();
    now.setDate(now.getDate() + 30);
    return now.toISOString().split('T')[0];
  }

  // Form state
  const [formData, setFormData] = useState({
    id: editData?.id || generateQuoteId(),
    leadId: editData?.leadId || initialData?.leadId || null,
    client: editData?.client || initialData?.client || "",
    service: editData?.service || initialData?.service || "",
    amount: editData?.amount?.replace("₹", "") || "",
    status: editData?.status || initialData?.status || "Pending",
    date: getCurrentDate(),
    validUntil: editData?.validUntil || getDefaultValidUntil(),
    contactPerson: editData?.contactPerson || initialData?.contactPerson || "",
    contactEmail: editData?.contactEmail || initialData?.contactEmail || "",
    contactPhone: editData?.contactPhone || initialData?.contactPhone || "",
    clientAddress: editData?.clientAddress || initialData?.clientAddress || "",
    shiftType: editData?.shiftType || "8H",
    locations: editData?.locations || [],
    gstPercentage: editData?.gstPercentage || 18,
    gstNumber: editData?.gstNumber || "",
    gstExempt: editData?.gstExempt || false,
    psaraCompliance: editData?.psaraCompliance !== undefined ? editData.psaraCompliance : true,
    minWageCompliance: editData?.minWageCompliance !== undefined ? editData.minWageCompliance : true,
    paymentTerms: editData?.paymentTerms || "Payment within 30 days of invoice date",
    termsAndConditions: editData?.termsAndConditions || "",
    notes: editData?.notes || "",
    gstLegalName: editData?.gstLegalName || "",
    gstTradeName: editData?.gstTradeName || "",
    gstAddress: editData?.gstAddress || "",
    gstStatus: editData?.gstStatus || "",
  });

  // Update form data when editData changes
  useEffect(() => {
    if (editData) {
      setFormData({
        id: editData?.id || generateQuoteId(),
        leadId: editData?.leadId || null,
        client: editData?.client || "",
        service: editData?.service || "",
        amount: editData?.amount?.replace("₹", "") || "",
        status: editData?.status || "Pending",
        date: editData?.date || getCurrentDate(),
        validUntil: editData?.validUntil || getDefaultValidUntil(),
        contactPerson: editData?.contactPerson || "",
        contactEmail: editData?.contactEmail || "",
        contactPhone: editData?.contactPhone || "",
        clientAddress: editData?.clientAddress || editData?.address || "",
        shiftType: editData?.shiftType || "8H",
        locations: editData?.locations || [],
        gstPercentage: editData?.gstPercentage || 18,
        gstNumber: editData?.gstNumber || "",
        gstExempt: editData?.gstExempt || false,
        psaraCompliance: editData?.psaraCompliance !== undefined ? editData.psaraCompliance : true,
        minWageCompliance: editData?.minWageCompliance !== undefined ? editData.minWageCompliance : true,
        paymentTerms: editData?.paymentTerms || "Payment within 30 days of invoice date",
        termsAndConditions: editData?.termsAndConditions || "",
        notes: editData?.notes || "",
        gstLegalName: editData?.gstLegalName || "",
        gstTradeName: editData?.gstTradeName || "",
        gstAddress: editData?.gstAddress || "",
        gstStatus: editData?.gstStatus || "",
      });
      setLocations(editData?.locations || []);
      setGstPercentage(editData?.gstPercentage ?? 18);
      setGstExempt(editData?.gstExempt ?? false);
    } else {
      setFormData(prev => ({
        ...prev,
        id: generateQuoteId(),
        leadId: initialData?.leadId || null,
        client: initialData?.client || "",
        service: initialData?.service || "",
        amount: "",
        status: initialData?.status || "Pending",
        date: getCurrentDate(),
        validUntil: getDefaultValidUntil(),
        contactPerson: initialData?.contactPerson || "",
        contactEmail: initialData?.contactEmail || "",
        contactPhone: initialData?.contactPhone || "",
        clientAddress: initialData?.clientAddress || initialData?.address || "",
        shiftType: "8H",
        locations: [],
        gstPercentage: 18,
        gstNumber: "",
        gstExempt: false,
        psaraCompliance: true,
        minWageCompliance: true,
        paymentTerms: "Payment within 30 days of invoice date",
        termsAndConditions: "",
        notes: "",
        gstLegalName: "",
        gstTradeName: "",
        gstAddress: "",
        gstStatus: "",
      }));
    }
  }, [editData, initialData]);

  // Load draft on open (only for new quotations without pre-fill data)
  useEffect(() => {
    if (isOpen && !editData && !initialData) {
      const draft = loadFormDraft<any>(QUOTATION_FORM_DRAFT_KEY);
      if (draft) {
        const { _locations, _perPostServiceInstances, ...formFields } = draft;
        setFormData(prev => ({ ...prev, ...formFields, id: generateQuoteId() }));
        if (_locations && _locations.length > 0) setLocations(_locations);
        if (_perPostServiceInstances && Object.keys(_perPostServiceInstances).length > 0) {
          setPerPostServiceInstances(_perPostServiceInstances);
        }
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, !!editData, !!initialData]);

  // Save draft on form data change (debounced, only for new quotations)
  useEffect(() => {
    if (isOpen && !editData) {
      const timeoutId = setTimeout(() => {
        if (formData.client || formData.service || locations.length > 0) {
          saveFormDraft(QUOTATION_FORM_DRAFT_KEY, {
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

  // Ensure perPostServiceInstances stays in sync when locations change
  const handleLocationsChange = (newLocations: any[]) => {
    setLocations(newLocations);
    setPerPostServiceInstances(prev => ensurePerPostInstances(prev, newLocations.length));
  };

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

  // Handle input changes
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  // Handle select changes
  const handleSelectChange = (value: string, name: string) => {
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  // Handle checkbox changes
  const handleCheckboxChange = (name: string, checked: boolean) => {
    setFormData(prev => ({ ...prev, [name]: checked }));
  };

  // Pincode lookup
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
      // Silently fail
    }
  };

  // GST Lookup function
  const handleGstLookup = async () => {
    const gstin = gstLookupInput.trim().toUpperCase();
    if (!gstin) {
      setGstLookupError("Please enter a GST number");
      return;
    }
    const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
    if (!gstinRegex.test(gstin)) {
      setGstLookupError("Invalid GSTIN format. Expected: 22AAAAA0000A1Z5");
      return;
    }
    setGstLookupLoading(true);
    setGstLookupError("");
    setGstLookupSuccess(false);
    try {
      const response = await fetch(`/api/gst-lookup?gstin=${gstin}`);
      const result = await response.json();
      if (!response.ok || !result.success) {
        setGstLookupError(result.error || "Failed to fetch GST details");
        setGstLookupLoading(false);
        return;
      }
      const { data } = result;
      setFormData(prev => ({
        ...prev,
        gstNumber: gstin,
        client: data.tradeName || data.legalName || prev.client,
        clientAddress: data.address || prev.clientAddress,
        gstLegalName: data.legalName || "",
        gstTradeName: data.tradeName || "",
        gstAddress: data.address || "",
        gstStatus: data.status || "",
      }));
      setGstLookupSuccess(true);
      toast({ title: "GST Details Fetched", description: `Found: ${data.tradeName || data.legalName}` });
    } catch {
      setGstLookupError("Network error. Please try again.");
    } finally {
      setGstLookupLoading(false);
    }
  };

  // Calculation helpers (used for Terms & Pricing tab summary)
  const calculateSubtotal = () => {
    let subtotal = 0;
    Object.values(perPostServiceInstances).forEach(svcMap => {
      (Object.keys(svcMap) as (keyof ServiceInstancesMap)[]).forEach(svcType => {
        svcMap[svcType].forEach(inst => {
          if (inst.shifts.day.enabled) subtotal += inst.shifts.day.quantity * inst.shifts.day.rate;
          if (inst.shifts.afternoon.enabled && inst.shiftType === '8H') subtotal += inst.shifts.afternoon.quantity * inst.shifts.afternoon.rate;
          if (inst.shifts.night.enabled) subtotal += inst.shifts.night.quantity * inst.shifts.night.rate;
        });
      });
    });
    return subtotal;
  };

  const calculateTotal = () => {
    const subtotal = calculateSubtotal();
    const gstAmount = gstExempt ? 0 : (subtotal * gstPercentage / 100);
    return subtotal + gstAmount;
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.client) {
      toast({ title: "Error", description: "Please fill in all required fields.", variant: "destructive" });
      return;
    }

    if (formData.validUntil) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const validDate = new Date(formData.validUntil);
      if (validDate < today) {
        toast({ title: "Invalid Date", description: "Valid Until date cannot be in the past.", variant: "destructive" });
        return;
      }
    }

    const total = calculateTotal();
    const serviceInstances = getPostServiceInstances(perPostServiceInstances, 0);

    const formattedData = {
      ...formData,
      quotationId: formData.id,
      amount: `₹${total}`,
      address: formData.clientAddress,
      serviceInstances,
      locations,
      perPostServiceInstances,
      gstPercentage,
      gstExempt,
    };

    try {
      let result;
      if (editData?.id) {
        result = await updateQuotation(editData.id, formattedData);
      } else {
        result = await addQuotation(formattedData);
      }

      if (result.success) {
        clearFormDraft(QUOTATION_FORM_DRAFT_KEY);
        toast({
          title: "Success",
          description: editData?.id ? "Quotation updated successfully" : "Quotation created successfully",
        });
        onSubmit(formattedData);
        handleClose();
      } else {
        toast({ title: "Error", description: result.error || "Failed to save quotation", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "An unexpected error occurred", variant: "destructive" });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-[1400px]" preventOutsideClose={true}>
        <DialogHeader>
          <DialogTitle>{editData ? "Edit Quotation" : "Create New Quotation"}</DialogTitle>
          <DialogDescription>
            {editData ? "Update quotation details and pricing" : "Create a new quotation for your client with detailed service breakdown"}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-4 max-h-[70vh] overflow-y-auto pr-2">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid grid-cols-3 mb-4">
              <TabsTrigger value="basic">Basic Info</TabsTrigger>
              <TabsTrigger value="posts">Security Posts</TabsTrigger>
              <TabsTrigger value="terms">Terms &amp; Pricing</TabsTrigger>
            </TabsList>

            {/* ── Basic Info Tab ── */}
            <TabsContent value="basic" className="space-y-5">
              {/* GST Quick-Fill */}
              <div>
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider border-b pb-2 mb-3">GST Lookup</h3>
                <div className="rounded-md border border-red-200 bg-red-50/30 p-4 space-y-3">
                  <p className="text-xs text-muted-foreground">Enter the client&apos;s GSTIN to auto-fill name and address details</p>
                  <div className="flex gap-2">
                    <Input
                      value={gstLookupInput}
                      onChange={(e) => {
                        setGstLookupInput(e.target.value.toUpperCase());
                        setGstLookupError("");
                        setGstLookupSuccess(false);
                      }}
                      placeholder="e.g. 27AADCB2230M1ZT"
                      className="flex-1 uppercase font-mono"
                      maxLength={15}
                    />
                    <Button
                      type="button"
                      onClick={handleGstLookup}
                      disabled={gstLookupLoading || !gstLookupInput.trim()}
                      className="bg-red-600 hover:bg-red-700"
                    >
                      {gstLookupLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                      <span className="ml-2">{gstLookupLoading ? "Fetching..." : "Fetch"}</span>
                    </Button>
                  </div>
                  {gstLookupError && <p className="text-xs text-red-600">{gstLookupError}</p>}
                  {gstLookupSuccess && formData.gstLegalName && (
                    <div className="p-3 bg-green-50 border border-green-200 rounded-md space-y-1">
                      <div className="flex items-center gap-1 text-green-700 text-sm font-medium">
                        <CheckCircle2 className="h-4 w-4" /> GST Details Found
                      </div>
                      <div className="grid grid-cols-1 gap-1 text-xs text-gray-700">
                        {formData.gstLegalName && <p><span className="font-medium">Legal Name:</span> {formData.gstLegalName}</p>}
                        {formData.gstTradeName && <p><span className="font-medium">Trade Name:</span> {formData.gstTradeName}</p>}
                        {formData.gstAddress && <p><span className="font-medium">Address:</span> {formData.gstAddress}</p>}
                        {formData.gstStatus && (
                          <p><span className="font-medium">Status:</span>
                            <span className={formData.gstStatus.toLowerCase() === 'active' ? ' text-green-600 font-medium' : ' text-red-600 font-medium'}>
                              {' '}{formData.gstStatus}
                            </span>
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Client Details */}
              <div>
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider border-b pb-2 mb-3">Client Details</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label className="text-xs" htmlFor="client">Client Name *</Label>
                    <Input id="client" name="client" value={formData.client} onChange={handleChange} placeholder="Enter client name" required />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs" htmlFor="clientAddress">Client Address</Label>
                    <Textarea id="clientAddress" name="clientAddress" value={formData.clientAddress} onChange={handleChange} placeholder="Client address (auto-filled from GST lookup)" rows={2} />
                  </div>
                </div>
              </div>

              {/* Contact Information */}
              <div>
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider border-b pb-2 mb-3">Contact Information</h3>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <Label className="text-xs" htmlFor="contactPerson">Contact Person</Label>
                    <Input id="contactPerson" name="contactPerson" value={formData.contactPerson} onChange={handleChange} placeholder="Enter contact person" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs" htmlFor="contactPhone">Contact Phone</Label>
                    <Input id="contactPhone" name="contactPhone" value={formData.contactPhone} onChange={handleChange} placeholder="Enter contact phone" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs" htmlFor="contactEmail">Contact Email</Label>
                    <Input id="contactEmail" name="contactEmail" type="email" value={formData.contactEmail} onChange={handleChange} placeholder="Enter contact email" />
                  </div>
                </div>
              </div>

              {/* Quotation Details */}
              <div>
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider border-b pb-2 mb-3">Quotation Details</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label className="text-xs" htmlFor="id">Quote ID *</Label>
                    <Input
                      id="id"
                      name="id"
                      value={formData.id}
                      onChange={handleChange}
                      placeholder="QT-2025-1234"
                      disabled={!!editData?.id}
                      className={editData?.id ? "bg-muted font-mono text-sm" : "font-mono text-sm"}
                    />
                    {editData?.id
                      ? <p className="text-xs text-muted-foreground">ID cannot be changed after creation</p>
                      : <p className="text-xs text-muted-foreground">Custom ID (e.g., QT-2025-1234)</p>
                    }
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs" htmlFor="date">Quote Date</Label>
                    <Input id="date" name="date" type="date" value={formData.date} onChange={handleChange} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs" htmlFor="validUntil">Valid Until</Label>
                    <Input id="validUntil" name="validUntil" type="date" value={formData.validUntil} onChange={handleChange} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs" htmlFor="status">Status</Label>
                    <Select value={formData.status} onValueChange={(value) => handleSelectChange(value, "status")}>
                      <SelectTrigger><SelectValue placeholder="Select status" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Draft">Draft</SelectItem>
                        <SelectItem value="Pending">Pending</SelectItem>
                        <SelectItem value="Sent">Sent</SelectItem>
                        <SelectItem value="Revised">Revised</SelectItem>
                        <SelectItem value="Accepted">Accepted</SelectItem>
                        <SelectItem value="Rejected">Rejected</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* ── Security Posts Tab ── */}
            <TabsContent value="posts">
              <SecurityPostsEditor
                locations={locations}
                perPostServiceInstances={locations.length > 0 ? ensurePerPostInstances(perPostServiceInstances, locations.length) : {}}
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

            {/* ── Terms & Pricing Tab ── */}
            <TabsContent value="terms" className="space-y-5">
              {/* Pricing Summary */}
              <div>
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider border-b pb-2 mb-3">Pricing Summary</h3>
                <div className="rounded-lg border bg-gray-50 dark:bg-gray-900/20 p-4 space-y-3">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <Label className="text-xs">GST Percentage (%)</Label>
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        value={gstPercentage}
                        onChange={(e) => setGstPercentage(Number(e.target.value) || 0)}
                        placeholder="18"
                        className="h-9"
                      />
                    </div>
                    <div className="flex items-center gap-2 pt-5">
                      <Checkbox
                        id="gstExempt"
                        checked={gstExempt}
                        onCheckedChange={(checked) => setGstExempt(checked === true)}
                      />
                      <Label htmlFor="gstExempt" className="text-xs cursor-pointer">GST Exempt</Label>
                    </div>
                  </div>
                  <div className="border-t pt-3 space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Subtotal</span>
                      <span className="font-medium">₹{calculateSubtotal().toLocaleString()}</span>
                    </div>
                    {!gstExempt && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">GST ({gstPercentage}%)</span>
                        <span className="font-medium">₹{(calculateSubtotal() * gstPercentage / 100).toLocaleString()}</span>
                      </div>
                    )}
                    <div className="flex justify-between font-bold text-base border-t pt-2">
                      <span>Total</span>
                      <span className="text-[#D71920]">₹{calculateTotal().toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Compliance */}
              <div>
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider border-b pb-2 mb-3">Compliance</h3>
                <div className="flex gap-6">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="psaraCompliance"
                      checked={formData.psaraCompliance}
                      onCheckedChange={(checked) => handleCheckboxChange("psaraCompliance", checked === true)}
                    />
                    <Label htmlFor="psaraCompliance" className="text-xs cursor-pointer">PSARA Compliance</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="minWageCompliance"
                      checked={formData.minWageCompliance}
                      onCheckedChange={(checked) => handleCheckboxChange("minWageCompliance", checked === true)}
                    />
                    <Label htmlFor="minWageCompliance" className="text-xs cursor-pointer">Minimum Wage Compliance</Label>
                  </div>
                </div>
              </div>

              {/* Terms */}
              <div>
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider border-b pb-2 mb-3">Terms &amp; Notes</h3>
                <div className="space-y-4">
                  <div className="space-y-1">
                    <Label className="text-xs" htmlFor="paymentTerms">Payment Terms</Label>
                    <Textarea
                      id="paymentTerms"
                      name="paymentTerms"
                      value={formData.paymentTerms}
                      onChange={handleChange}
                      placeholder="e.g. Payment within 30 days of invoice date"
                      rows={2}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs" htmlFor="termsAndConditions">Additional Terms &amp; Conditions</Label>
                    <p className="text-[11px] text-muted-foreground">The standard 12-point T&amp;C (GST, uniform, lead time, payment to M/s Safend, etc.) are printed automatically. Add anything extra here.</p>
                    <Textarea
                      id="termsAndConditions"
                      name="termsAndConditions"
                      value={formData.termsAndConditions}
                      onChange={handleChange}
                      placeholder="Optional — add any additional terms beyond the standard 12-point T&C"
                      rows={3}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs" htmlFor="notes">Notes</Label>
                    <Textarea
                      id="notes"
                      name="notes"
                      value={formData.notes}
                      onChange={handleChange}
                      placeholder="Any additional notes"
                      rows={3}
                    />
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>

          <DialogFooter className="pt-4">
            <Button type="button" variant="outline" onClick={handleClose}>Cancel</Button>
            <Button type="submit" className="bg-[#D71920] hover:bg-red-700">
              {editData ? "Update Quotation" : "Create Quotation"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
