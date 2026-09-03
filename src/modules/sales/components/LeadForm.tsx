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
import { Shield, Users, Crosshair, Star, Calendar, Car } from "lucide-react";
import { INDIAN_STATES, getCitiesForState } from "@/data/indianStatesAndCities";
import { saveFormDraft, loadFormDraft, clearFormDraft } from "@/utils/formDraft";

const LEAD_FORM_DRAFT_KEY = 'lead_form';

interface LeadFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: any) => void;
  editData: any | null;
}

// Service type card config
const SERVICE_TYPES = [
  { key: 'unarmedGuards', label: 'Unarmed Guards', icon: Shield },
  { key: 'armedGuards', label: 'Armed Guards', icon: Crosshair },
  { key: 'supervisors', label: 'Supervisors', icon: Star },
  { key: 'patrolOfficers', label: 'Patrol Officers', icon: Car },
  { key: 'eventSecurity', label: 'Event Security', icon: Calendar },
  { key: 'personalSecurity', label: 'Personal Security', icon: Users },
] as const;

type ServiceKey = typeof SERVICE_TYPES[number]['key'];

export function LeadForm({ isOpen, onClose, onSubmit, editData }: LeadFormProps) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("basic");
  const [availableCities, setAvailableCities] = useState<string[]>([]);

  // Form state
  const [formData, setFormData] = useState({
    id: editData?.id || "",
    name: editData?.name || "",
    companyName: editData?.companyName || "",
    email: editData?.email || "",
    phone: editData?.phone || "",
    address: editData?.address || "",
    city: editData?.city || "",
    state: editData?.state || "",
    pincode: editData?.pincode || "",
    source: editData?.source || "Website",
    status: editData?.status || "New Lead",
    assignedTo: editData?.assignedTo || "",

    securityNeeds: {
      armedGuards: editData?.securityNeeds?.armedGuards || false,
      unarmedGuards: editData?.securityNeeds?.unarmedGuards !== undefined ? editData.securityNeeds.unarmedGuards : true,
      supervisors: editData?.securityNeeds?.supervisors || false,
      patrolOfficers: editData?.securityNeeds?.patrolOfficers || false,
      eventSecurity: editData?.securityNeeds?.eventSecurity || false,
      personalSecurity: editData?.securityNeeds?.personalSecurity || false,
    },

    manpowerRequirements: {
      totalGuardsNeeded: editData?.manpowerRequirements?.totalGuardsNeeded || "",
      shiftType: editData?.manpowerRequirements?.shiftType || "8H",
      shiftCount: editData?.manpowerRequirements?.shiftCount || "3",
      femaleGuardsRequired: editData?.manpowerRequirements?.femaleGuardsRequired || false,
      exServicemenRequired: editData?.manpowerRequirements?.exServicemenRequired || false,
      unarmedGuardsCount: editData?.manpowerRequirements?.unarmedGuardsCount || "",
      unarmedGuardsShiftType: editData?.manpowerRequirements?.unarmedGuardsShiftType || "8H",
      unarmedGuardsFemale: editData?.manpowerRequirements?.unarmedGuardsFemale || false,
      unarmedGuardsExServicemen: editData?.manpowerRequirements?.unarmedGuardsExServicemen || false,
      armedGuardsCount: editData?.manpowerRequirements?.armedGuardsCount || "",
      armedGuardsShiftType: editData?.manpowerRequirements?.armedGuardsShiftType || "8H",
      armedGuardsFemale: editData?.manpowerRequirements?.armedGuardsFemale || false,
      armedGuardsExServicemen: editData?.manpowerRequirements?.armedGuardsExServicemen || false,
      supervisorsCount: editData?.manpowerRequirements?.supervisorsCount || "",
      supervisorsShiftType: editData?.manpowerRequirements?.supervisorsShiftType || "8H",
      supervisorsFemale: editData?.manpowerRequirements?.supervisorsFemale || false,
      supervisorsExServicemen: editData?.manpowerRequirements?.supervisorsExServicemen || false,
      patrolOfficersCount: editData?.manpowerRequirements?.patrolOfficersCount || "",
      patrolOfficersShiftType: editData?.manpowerRequirements?.patrolOfficersShiftType || "8H",
      patrolOfficersFemale: editData?.manpowerRequirements?.patrolOfficersFemale || false,
      patrolOfficersExServicemen: editData?.manpowerRequirements?.patrolOfficersExServicemen || false,
      eventSecurityCount: editData?.manpowerRequirements?.eventSecurityCount || "",
      eventSecurityShiftType: editData?.manpowerRequirements?.eventSecurityShiftType || "8H",
      eventSecurityFemale: editData?.manpowerRequirements?.eventSecurityFemale || false,
      eventSecurityExServicemen: editData?.manpowerRequirements?.eventSecurityExServicemen || false,
      personalSecurityCount: editData?.manpowerRequirements?.personalSecurityCount || "",
      personalSecurityShiftType: editData?.manpowerRequirements?.personalSecurityShiftType || "12H",
      personalSecurityFemale: editData?.manpowerRequirements?.personalSecurityFemale || false,
      personalSecurityExServicemen: editData?.manpowerRequirements?.personalSecurityExServicemen || false,
    },

    siteInformation: {
      siteCount: editData?.siteInformation?.siteCount || "1",
      primaryLocation: editData?.siteInformation?.primaryLocation || "",
      locationType: editData?.siteInformation?.locationType || "Commercial",
      siteArea: editData?.siteInformation?.siteArea || "",
      accessControlNeeded: editData?.siteInformation?.accessControlNeeded || false,
      cameraSystemNeeded: editData?.siteInformation?.cameraSystemNeeded || false,
    },

    budget: editData?.budget || "",
    targetStartDate: editData?.targetStartDate || "",
    priority: editData?.priority || editData?.urgency || "Medium",
    notes: editData?.notes || "",
  });

  // Update available cities when state changes
  useEffect(() => {
    if (formData.state) {
      const cities = getCitiesForState(formData.state);
      setAvailableCities(cities);
      if (formData.city && !cities.includes(formData.city)) {
        setFormData(prev => ({ ...prev, city: "" }));
      }
    } else {
      setAvailableCities([]);
    }
  }, [formData.state]);

  useEffect(() => {
    if (editData?.state) setAvailableCities(getCitiesForState(editData.state));
  }, [editData]);

  useEffect(() => {
    if (isOpen && !editData) {
      const draft = loadFormDraft<typeof formData>(LEAD_FORM_DRAFT_KEY);
      if (draft) setFormData(prev => ({ ...prev, ...draft }));
    }
  }, [isOpen, editData]);

  useEffect(() => {
    if (isOpen && !editData) {
      const timeoutId = setTimeout(() => {
        if (formData.name || formData.phone || formData.companyName) {
          saveFormDraft(LEAD_FORM_DRAFT_KEY, formData);
        }
      }, 500);
      return () => clearTimeout(timeoutId);
    }
  }, [formData, isOpen, editData]);

  const handleClose = useCallback(() => { onClose(); }, [onClose]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSelectChange = (value: string, name: string) => {
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleNestedChange = (section: string, field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      [section]: { ...(prev[section as keyof typeof prev] as any), [field]: value },
    }));
  };

  const handleCheckboxChange = (section: string, field: string, checked: boolean) => {
    setFormData(prev => ({
      ...prev,
      [section]: { ...(prev[section as keyof typeof prev] as any), [field]: checked },
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.phone) {
      toast({ title: "Error", description: "Please fill in all required fields.", variant: "destructive" });
      return;
    }
    clearFormDraft(LEAD_FORM_DRAFT_KEY);
    onSubmit(formData);
  };

  // Helper to render a manpower panel for a selected service type
  const renderManpowerPanel = (serviceKey: ServiceKey, label: string, countField: string, shiftField: string, femaleField: string, exServicemenField: string, defaultShift: string) => (
    <div className="rounded-lg border overflow-hidden">
      <div className="px-4 py-2.5 bg-gray-50 dark:bg-gray-900/20 border-b flex items-center gap-2">
        <h4 className="text-sm font-semibold">{label} — Manpower Requirements</h4>
      </div>
      <div className="p-4 space-y-3">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label className="text-xs">Number of {label}</Label>
            <Input
              value={(formData.manpowerRequirements as any)[countField] || ''}
              onChange={(e) => handleNestedChange("manpowerRequirements", countField, e.target.value)}
              placeholder="e.g., 5"
              type="number"
              min="1"
              className="h-9"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Shift Type</Label>
            <Select
              value={(formData.manpowerRequirements as any)[shiftField] || defaultShift}
              onValueChange={(value) => handleNestedChange("manpowerRequirements", shiftField, value)}
            >
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="8H">8-Hour Shift</SelectItem>
                <SelectItem value="12H">12-Hour Shift</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="flex items-center gap-2">
            <Checkbox
              id={`${serviceKey}-female`}
              checked={(formData.manpowerRequirements as any)[femaleField] || false}
              onCheckedChange={(checked) => handleCheckboxChange("manpowerRequirements", femaleField, checked === true)}
            />
            <Label htmlFor={`${serviceKey}-female`} className="text-xs cursor-pointer">Female Required</Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id={`${serviceKey}-exsm`}
              checked={(formData.manpowerRequirements as any)[exServicemenField] || false}
              onCheckedChange={(checked) => handleCheckboxChange("manpowerRequirements", exServicemenField, checked === true)}
            />
            <Label htmlFor={`${serviceKey}-exsm`} className="text-xs cursor-pointer">Ex-Servicemen Required</Label>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-[900px]" preventOutsideClose={true}>
        <DialogHeader>
          <DialogTitle>{editData ? "Edit Lead" : "Add New Lead"}</DialogTitle>
          <DialogDescription>Capture lead details and security requirements</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-4 max-h-[70vh] overflow-y-auto pr-2">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid grid-cols-3 mb-4">
              <TabsTrigger value="basic">Basic Info</TabsTrigger>
              <TabsTrigger value="security">Security Needs</TabsTrigger>
              <TabsTrigger value="additional">Additional Info</TabsTrigger>
            </TabsList>

            {/* ── Basic Info Tab ── */}
            <TabsContent value="basic" className="space-y-5">
              {/* Contact Information */}
              <div>
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider border-b pb-2 mb-3">Contact Information</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label className="text-xs" htmlFor="name">Contact Name *</Label>
                    <Input id="name" name="name" value={formData.name} onChange={handleChange} placeholder="Contact person name" required />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs" htmlFor="companyName">Company Name</Label>
                    <Input id="companyName" name="companyName" value={formData.companyName} onChange={handleChange} placeholder="Company name" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs" htmlFor="phone">Phone *</Label>
                    <Input id="phone" name="phone" value={formData.phone} onChange={handleChange} placeholder="Contact phone number" required />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs" htmlFor="email">Email</Label>
                    <Input id="email" name="email" type="email" value={formData.email} onChange={handleChange} placeholder="Contact email" />
                  </div>
                </div>
              </div>

              {/* Location */}
              <div>
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider border-b pb-2 mb-3">Location</h3>
                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label className="text-xs" htmlFor="address">Address</Label>
                    <Textarea id="address" name="address" value={formData.address} onChange={handleChange} placeholder="Company address" rows={2} />
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-1">
                      <Label className="text-xs">State</Label>
                      <Select value={formData.state} onValueChange={(value) => handleSelectChange(value, "state")}>
                        <SelectTrigger><SelectValue placeholder="Select state" /></SelectTrigger>
                        <SelectContent>
                          {INDIAN_STATES.map((state) => (
                            <SelectItem key={state} value={state}>{state}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">City</Label>
                      <Select value={formData.city} onValueChange={(value) => handleSelectChange(value, "city")} disabled={!formData.state}>
                        <SelectTrigger><SelectValue placeholder={formData.state ? "Select city" : "Select state first"} /></SelectTrigger>
                        <SelectContent>
                          {availableCities.map((city) => (
                            <SelectItem key={city} value={city}>{city}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs" htmlFor="pincode">PIN Code</Label>
                      <Input id="pincode" name="pincode" value={formData.pincode} onChange={handleChange} placeholder="PIN code" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Lead Classification */}
              <div>
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider border-b pb-2 mb-3">Lead Classification</h3>
                <div className="space-y-1 max-w-xs">
                  <Label className="text-xs">Lead Source</Label>
                  <Select value={formData.source} onValueChange={(value) => handleSelectChange(value, "source")}>
                    <SelectTrigger><SelectValue placeholder="Select source" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Website">Website</SelectItem>
                      <SelectItem value="Referral">Referral</SelectItem>
                      <SelectItem value="Social Media">Social Media</SelectItem>
                      <SelectItem value="Phone Call">Phone Call</SelectItem>
                      <SelectItem value="Email">Email</SelectItem>
                      <SelectItem value="Exhibition">Exhibition</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </TabsContent>

            {/* ── Security Needs Tab ── */}
            <TabsContent value="security" className="space-y-5">
              <div>
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider border-b pb-2 mb-3">Security Service Requirements</h3>
                <p className="text-xs text-muted-foreground mb-3">Select the security services you need</p>
                {/* Service type card grid */}
                <div className="grid grid-cols-3 gap-3">
                  {SERVICE_TYPES.map(({ key, label, icon: Icon }) => {
                    const selected = (formData.securityNeeds as any)[key] as boolean;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => handleCheckboxChange("securityNeeds", key, !selected)}
                        className={`flex flex-col items-center gap-2 rounded-lg border-2 p-4 transition-colors cursor-pointer
                          ${selected
                            ? 'border-[#D71920] bg-[#D71920]/5 text-[#D71920]'
                            : 'border-gray-200 bg-gray-50 dark:bg-gray-900/20 text-muted-foreground hover:border-gray-300'
                          }`}
                      >
                        <Icon className={`h-6 w-6 ${selected ? 'text-[#D71920]' : 'text-muted-foreground'}`} />
                        <span className={`text-xs font-medium text-center ${selected ? 'text-[#D71920]' : ''}`}>{label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Manpower panels for selected services */}
              <div className="space-y-3">
                {formData.securityNeeds.unarmedGuards && renderManpowerPanel(
                  'unarmedGuards', 'Unarmed Guards',
                  'unarmedGuardsCount', 'unarmedGuardsShiftType', 'unarmedGuardsFemale', 'unarmedGuardsExServicemen', '8H'
                )}
                {formData.securityNeeds.armedGuards && renderManpowerPanel(
                  'armedGuards', 'Armed Guards',
                  'armedGuardsCount', 'armedGuardsShiftType', 'armedGuardsFemale', 'armedGuardsExServicemen', '8H'
                )}
                {formData.securityNeeds.supervisors && renderManpowerPanel(
                  'supervisors', 'Supervisors',
                  'supervisorsCount', 'supervisorsShiftType', 'supervisorsFemale', 'supervisorsExServicemen', '8H'
                )}
                {formData.securityNeeds.patrolOfficers && renderManpowerPanel(
                  'patrolOfficers', 'Patrol Officers',
                  'patrolOfficersCount', 'patrolOfficersShiftType', 'patrolOfficersFemale', 'patrolOfficersExServicemen', '8H'
                )}
                {formData.securityNeeds.eventSecurity && renderManpowerPanel(
                  'eventSecurity', 'Event Security',
                  'eventSecurityCount', 'eventSecurityShiftType', 'eventSecurityFemale', 'eventSecurityExServicemen', '8H'
                )}
                {formData.securityNeeds.personalSecurity && renderManpowerPanel(
                  'personalSecurity', 'Personal Security',
                  'personalSecurityCount', 'personalSecurityShiftType', 'personalSecurityFemale', 'personalSecurityExServicemen', '12H'
                )}
              </div>
            </TabsContent>

            {/* ── Additional Info Tab ── */}
            <TabsContent value="additional" className="space-y-5">
              <div>
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider border-b pb-2 mb-3">Budget &amp; Timeline</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label className="text-xs" htmlFor="budget">Monthly Budget (₹)</Label>
                    <Input id="budget" name="budget" value={formData.budget} onChange={handleChange} placeholder="Estimated monthly budget" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs" htmlFor="targetStartDate">Target Start Date</Label>
                    <Input id="targetStartDate" name="targetStartDate" type="date" value={formData.targetStartDate} onChange={handleChange} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Priority</Label>
                    <Select value={formData.priority} onValueChange={(value) => handleSelectChange(value, "priority")}>
                      <SelectTrigger><SelectValue placeholder="Select priority" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Low">Low</SelectItem>
                        <SelectItem value="Medium">Medium</SelectItem>
                        <SelectItem value="High">High</SelectItem>
                        <SelectItem value="Critical">Critical</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider border-b pb-2 mb-3">Notes</h3>
                <div className="space-y-1">
                  <Label className="text-xs" htmlFor="notes">Additional Notes</Label>
                  <Textarea id="notes" name="notes" value={formData.notes} onChange={handleChange} placeholder="Any other requirements or information" rows={4} />
                </div>
              </div>
            </TabsContent>
          </Tabs>

          <DialogFooter className="pt-4">
            <Button type="button" variant="outline" onClick={handleClose}>Cancel</Button>
            <Button type="submit" className="bg-safend-red hover:bg-red-700">
              {editData ? "Update Lead" : "Save Lead"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
