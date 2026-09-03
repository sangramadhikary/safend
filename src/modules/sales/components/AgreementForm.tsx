'use client';

import { useState, useEffect, useRef, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
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
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin, Users, Building2, ChevronDown, ChevronUp, CheckCircle } from "lucide-react";
import { useQuotationsData } from "@/contexts/QuotationsDataContext";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { uploadDocument } from "@/lib/r2-storage";
import { saveFormDraft, loadFormDraft, clearFormDraft } from "@/utils/formDraft";

// Form draft key
const AGREEMENT_FORM_DRAFT_KEY = 'agreement_form';

interface SecurityPost {
  id: string;
  postName: string;
  postAddress: string;
  state: string;
  city: string;
  pincode: string;
  totalGuards: number;
  services: any[];
}

interface AgreementFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: any) => void;
  editData: any | null;
}

export function AgreementForm({ isOpen, onClose, onSubmit, editData }: AgreementFormProps) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("basic");
  // Use centralized quotations data from context
  const { quotations } = useQuotationsData();
  const [linkedPosts, setLinkedPosts] = useState<SecurityPost[]>(editData?.posts || []);
  const [linkedQuotationData, setLinkedQuotationData] = useState<any>(null);
  const [expandedPostIndex, setExpandedPostIndex] = useState<number | null>(null);
  
  // Form state
  const [formData, setFormData] = useState({
    // Basic information
    id: editData?.id || `AGR-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
    clientName: editData?.clientName || "",
    contactPerson: editData?.contactPerson || "",
    clientEmail: editData?.clientEmail || "",
    clientPhone: editData?.clientPhone || "",
    quotationRef: editData?.quotationRef || editData?.linkedQuoteId || "",
    signedOn: editData?.signedOn || "",
    validUntil: editData?.validUntil || "",
    status: editData?.status || "Draft",
    value: editData?.value?.replace("₹", "") || "",
    
    // Posts inherited from quotation
    posts: editData?.posts || [],
    
    // Compliance
    complianceInfo: {
      psaraLicenseNumber: editData?.complianceInfo?.psaraLicenseNumber || "",
      psaraExpiryDate: editData?.complianceInfo?.psaraExpiryDate || "",
      gstNumber: editData?.complianceInfo?.gstNumber || "",
      workersCompensation: editData?.complianceInfo?.workersCompensation || true,
      epfCompliance: editData?.complianceInfo?.epfCompliance || true,
      esiCompliance: editData?.complianceInfo?.esiCompliance || true,
      minWageCompliance: editData?.complianceInfo?.minWageCompliance || true,
    },
    
    // Legal and payment terms
    legalTerms: {
      contractDuration: editData?.legalTerms?.contractDuration || "12", // in months
      terminationNotice: editData?.legalTerms?.terminationNotice || "30", // in days
      automaticRenewal: editData?.legalTerms?.automaticRenewal || false,
      nonDisclosure: editData?.legalTerms?.nonDisclosure || true,
      nonCompete: editData?.legalTerms?.nonCompete || false,
      governingLaw: editData?.legalTerms?.governingLaw || "Maharashtra",
      disputeResolution: editData?.legalTerms?.disputeResolution || "arbitration",
    },
    
    paymentTerms: {
      billingCycle: editData?.paymentTerms?.billingCycle || "monthly",
      paymentDue: editData?.paymentTerms?.paymentDue || "30", // days after invoice
      latePaymentFee: editData?.paymentTerms?.latePaymentFee || "18", // percentage per annum
      invoiceMethod: editData?.paymentTerms?.invoiceMethod || "email",
      paymentMethod: editData?.paymentTerms?.paymentMethod || "bankTransfer",
    },
    
    // Agreement signatories
    companySignatory: editData?.companySignatory || "",
    companySignatoryDesignation: editData?.companySignatoryDesignation || "",
    clientSignatory: editData?.clientSignatory || "",
    clientSignatoryDesignation: editData?.clientSignatoryDesignation || "",
    
    // Document uploads
    documentUrl: editData?.documentUrl || "",
    signedDocumentUrl: editData?.signedDocumentUrl || "",
    
    // Additional info — drop the auto "Agreement skipped…" placeholder so a
    // completed agreement no longer registers as skipped.
    notes: (editData?.notes || "").toLowerCase().startsWith("agreement skipped") ? "" : (editData?.notes || ""),
  });
  
  // Load posts and client data from linked quotation when quotationRef changes or dialog opens
  useEffect(() => {
    if (!isOpen) return;
    
    const quotationRef = formData.quotationRef || editData?.linkedQuoteId;
    
    if (quotationRef && quotations.length > 0) {
      // Try multiple matching strategies
      const linkedQuotation = quotations.find(q => 
        q.id === quotationRef || 
        q.quotationId === quotationRef
      );
      
      if (linkedQuotation) {
        // Store the full quotation data for displaying services
        setLinkedQuotationData(linkedQuotation);
        
        // Inherit client data from quotation (only if not already set)
        setFormData(prev => ({
          ...prev,
          clientName: prev.clientName || linkedQuotation.client || linkedQuotation.clientName || "",
          contactPerson: prev.contactPerson || linkedQuotation.contactPerson || "",
          clientEmail: prev.clientEmail || linkedQuotation.contactEmail || linkedQuotation.clientEmail || "",
          clientPhone: prev.clientPhone || linkedQuotation.contactPhone || linkedQuotation.clientPhone || "",
          value: prev.value || (linkedQuotation.amount || linkedQuotation.value || "").replace("₹", ""),
          complianceInfo: {
            ...prev.complianceInfo,
            gstNumber: prev.complianceInfo.gstNumber || linkedQuotation.gstNumber || "",
          }
        }));
        
        // Posts are stored as 'locations' in quotation
        const quotationPosts = linkedQuotation.locations || linkedQuotation.posts || [];
        
        if (quotationPosts.length > 0) {
          // Map locations to posts format WITH service data
          const mappedPosts = quotationPosts.map((loc: any, idx: number) => ({
            id: loc.id || `post-${idx}`,
            postName: loc.name || loc.postName || `Post ${idx + 1}`,
            postAddress: loc.address || loc.postAddress || "",
            state: loc.state || "",
            city: loc.city || "",
            pincode: loc.pincode || "",
            // Carry pinned coordinates through from the quotation so they reach
            // operational_posts and appear on the fleet tracking map.
            lat: loc.lat ?? "",
            lng: loc.lng ?? "",
            totalGuards: loc.guards || loc.totalGuards || 0,
            // Copy service data from quotation (NEW format or OLD format)
            serviceInstances: linkedQuotation.serviceInstances || loc.serviceInstances || {},
            securityServices: linkedQuotation.securityServices || loc.securityServices || {},
            services: loc.services || [] // Keep for backward compatibility
          }));
          
          setLinkedPosts(mappedPosts);
          setFormData(prev => ({
            ...prev,
            posts: mappedPosts
          }));
        } else {
          setLinkedPosts([]);
        }
      } else {
        setLinkedQuotationData(null);
      }
    }
  }, [isOpen, formData.quotationRef, quotations, editData?.linkedQuoteId]);

  // Load draft on open (only for new agreements)
  useEffect(() => {
    if (isOpen && !editData) {
      const draft = loadFormDraft<typeof formData>(AGREEMENT_FORM_DRAFT_KEY);
      if (draft) {
        setFormData(prev => ({ ...prev, ...draft }));
        toast({
          title: "Draft Restored",
          description: "Your previous agreement data has been restored.",
        });
      }
    }
  }, [isOpen, editData]);

  // Save draft on form data change (debounced, only for new agreements)
  useEffect(() => {
    if (isOpen && !editData) {
      const timeoutId = setTimeout(() => {
        if (formData.clientName || formData.quotationRef) {
          saveFormDraft(AGREEMENT_FORM_DRAFT_KEY, formData);
        }
      }, 500);
      return () => clearTimeout(timeoutId);
    }
  }, [formData, isOpen, editData]);

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
  
  // Handle nested object changes
  const handleNestedChange = (section: string, field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      [section]: {
        ...(prev[section as keyof typeof prev] as object),
        [field]: value
      }
    }));
  };
  
  // Handle checkbox changes for nested objects
  const handleCheckboxChange = (section: string, field: string, checked: boolean) => {
    setFormData(prev => ({
      ...prev,
      [section]: {
        ...(prev[section as keyof typeof prev] as object),
        [field]: checked
      }
    }));
  };

  // Calculate 1-year validity period from signed date
  const calculateValidUntil = (signedDate: string) => {
    if (!signedDate) return '';
    
    const date = new Date(signedDate);
    const contractDuration = parseInt(formData.legalTerms.contractDuration, 10) || 12;
    date.setMonth(date.getMonth() + contractDuration);
    return date.toISOString().split('T')[0];
  };

  // Handle date change and auto-calculate validity
  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    
    if (name === 'signedOn') {
      const validUntil = calculateValidUntil(value);
      setFormData(prev => ({ 
        ...prev, 
        [name]: value,
        validUntil
      }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };
  
  // Handle file upload
  const handleFileUpload = async (fieldName: string) => {
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
        const result = await uploadDocument(file, 'agreements', formData.id || `agreement_${Date.now()}`);
        
        if (result.success && result.url) {
          setFormData(prev => ({
            ...prev,
            [fieldName]: result.url
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
  
  // Handle form submission
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate form
    if (!formData.clientName || !formData.quotationRef) {
      toast({
        title: "Error",
        description: "Please fill in all required fields.",
        variant: "destructive",
      });
      return;
    }
    
    // Clear draft on successful save
    clearFormDraft(AGREEMENT_FORM_DRAFT_KEY);
    
    // Format the value with rupee sign
    const formattedData = {
      ...formData,
      value: formData.value ? `₹${formData.value}` : "",
    };
    
    // Submit the form
    onSubmit(formattedData);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-[700px]" preventOutsideClose={true}>
        <DialogHeader>
          <DialogTitle>{editData?.id ? "Edit Agreement" : "Generate Agreement"}</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4 mt-4 max-h-[70vh] overflow-y-auto pr-2">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid grid-cols-4 mb-4">
              <TabsTrigger value="basic">Basic Info</TabsTrigger>
              <TabsTrigger value="posts">Posts</TabsTrigger>
              <TabsTrigger value="compliance">Compliance</TabsTrigger>
              <TabsTrigger value="terms">Terms & Signing</TabsTrigger>
            </TabsList>
            
            {/* Basic Information Tab */}
            <TabsContent value="basic" className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="id">Agreement ID</Label>
                  <Input 
                    id="id" 
                    name="id" 
                    value={formData.id} 
                    readOnly 
                    className="bg-gray-100"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="status">Status</Label>
                  <Select 
                    value={formData.status} 
                    onValueChange={(value) => handleSelectChange(value, "status")}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Draft">Draft</SelectItem>
                      <SelectItem value="Signed">Signed</SelectItem>
                      <SelectItem value="Active">Active</SelectItem>
                      <SelectItem value="Expired">Expired</SelectItem>
                      <SelectItem value="Terminated">Terminated</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="clientName">Client Name *</Label>
                  <Input 
                    id="clientName" 
                    name="clientName" 
                    value={formData.clientName} 
                    onChange={handleChange} 
                    placeholder="Enter client name" 
                    required 
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="contactPerson">Contact Person</Label>
                  <Input 
                    id="contactPerson" 
                    name="contactPerson" 
                    value={formData.contactPerson} 
                    onChange={handleChange} 
                    placeholder="Enter contact person" 
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="clientPhone">Client Phone</Label>
                  <Input 
                    id="clientPhone" 
                    name="clientPhone" 
                    value={formData.clientPhone} 
                    onChange={handleChange} 
                    placeholder="Enter client phone" 
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="clientEmail">Client Email</Label>
                  <Input 
                    id="clientEmail" 
                    name="clientEmail" 
                    type="email"
                    value={formData.clientEmail} 
                    onChange={handleChange} 
                    placeholder="Enter client email" 
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="quotationRef">Quotation Reference *</Label>
                  <Input 
                    id="quotationRef" 
                    name="quotationRef" 
                    value={formData.quotationRef} 
                    onChange={handleChange} 
                    placeholder="Enter quotation reference" 
                    required 
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="value">Contract Value (₹)</Label>
                  <Input 
                    id="value" 
                    name="value" 
                    value={formData.value} 
                    onChange={handleChange} 
                    placeholder="Enter contract value" 
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="signedOn">Signed On</Label>
                  <Input 
                    id="signedOn" 
                    name="signedOn" 
                    type="date" 
                    value={formData.signedOn} 
                    onChange={handleDateChange} 
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="validUntil">Valid Until</Label>
                  <Input 
                    id="validUntil" 
                    name="validUntil" 
                    type="date" 
                    value={formData.validUntil} 
                    onChange={handleChange} 
                  />
                </div>
              </div>
            </TabsContent>
            
            {/* Posts Tab - Inherited from Quotation */}
            <TabsContent value="posts" className="space-y-4">
              <div className="bg-[#17A2B8]/10 border border-[#17A2B8]/30 rounded-lg p-4 mb-4">
                <p className="text-sm text-[#17A2B8]">
                  <strong>Note:</strong> Posts are inherited from the linked quotation ({formData.quotationRef || "Not linked"}). 
                  To modify posts, please edit the original quotation.
                </p>
              </div>
              
              {linkedPosts.length === 0 ? (
                <div className="text-center py-8 text-[#4A4A4A] dark:text-white">
                  <Building2 className="h-12 w-12 mx-auto mb-3 text-[#6C757D]" />
                  <p>No posts found</p>
                  <p className="text-sm text-[#6C757D]">Link a quotation to inherit its posts</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <h3 className="font-semibold text-[#000000]">Security Posts ({linkedPosts.length})</h3>
                    <Badge className="bg-[#2BA745]/10 text-[#2BA745] border border-[#2BA745]/30 hover:bg-[#2BA745]/20">
                      Inherited from Quotation
                    </Badge>
                  </div>
                  
                  {linkedPosts.map((post, index) => (
                    <Card key={post.id || index} className="p-4 bg-[#F5F5F5] dark:bg-[#1a1a1a] border border-[#4A4A4A]/20 shadow-xs">
                      <div className="space-y-3">
                        <div className="flex justify-between items-start">
                          <h4 className="font-semibold text-lg text-[#000000] dark:text-white">{post.postName || `Post ${index + 1}`}</h4>
                          <Badge className="bg-[#D71920] text-white hover:bg-[#b8151b]">
                            <Users className="h-3 w-3 mr-1" />
                            {post.totalGuards} Guards
                          </Badge>
                        </div>
                        
                        <div className="flex items-start gap-2 text-sm text-[#4A4A4A] dark:text-white">
                          <MapPin className="h-4 w-4 mt-0.5 shrink-0 text-[#D71920]" />
                          <span>
                            {post.postAddress}
                            {post.city && `, ${post.city}`}
                            {post.state && `, ${post.state}`}
                            {post.pincode && ` - ${post.pincode}`}
                          </span>
                        </div>
                        
                        {/* Security Services Section - Read Only */}
                        {(linkedQuotationData?.serviceInstances || linkedQuotationData?.securityServices) && (
                          <Collapsible 
                            open={expandedPostIndex === index}
                            onOpenChange={(open) => setExpandedPostIndex(open ? index : null)}
                          >
                            <CollapsibleTrigger asChild>
                              <Button variant="ghost" className="w-full justify-between p-2 h-auto border border-[#4A4A4A]/20 hover:bg-[#F5F5F5] dark:hover:bg-[#2a2a2a]">
                                <span className="font-medium text-[#000000] dark:text-white">Security Services for this Post</span>
                                {expandedPostIndex === index ? (
                                  <ChevronUp className="h-4 w-4 text-[#D71920]" />
                                ) : (
                                  <ChevronDown className="h-4 w-4 text-[#D71920]" />
                                )}
                              </Button>
                            </CollapsibleTrigger>
                            <CollapsibleContent className="pt-2">
                              <div className="border border-[#4A4A4A]/30 rounded-lg p-4 bg-white dark:bg-[#0a0a0a]">
                                <h5 className="font-semibold mb-3 text-[#000000] dark:text-white">Service Details</h5>
                                
                                {/* New serviceInstances format */}
                                {linkedQuotationData?.serviceInstances && (
                                  <div className="space-y-4">
                                    {/* Unarmed Guards */}
                                    {linkedQuotationData.serviceInstances.unarmedGuards?.length > 0 && linkedQuotationData.serviceInstances.unarmedGuards.some((inst: any) => 
                                      inst.shifts?.day?.enabled || inst.shifts?.afternoon?.enabled || inst.shifts?.night?.enabled
                                    ) && (
                                      <div className="border rounded-lg p-3 bg-gray-50 dark:bg-gray-900">
                                        <div className="flex justify-between items-center mb-3">
                                          <h6 className="font-semibold text-[#000000] dark:text-white">Unarmed Guards</h6>
                                          <span className="text-[#D71920] font-bold">
                                            ₹{linkedQuotationData.serviceInstances.unarmedGuards.reduce((total: number, inst: any) => {
                                              let instTotal = 0;
                                              if (inst.shifts?.day?.enabled) instTotal += (inst.shifts.day.quantity || 0) * (inst.shifts.day.rate || 0);
                                              if (inst.shifts?.afternoon?.enabled && inst.shiftType === '8H') instTotal += (inst.shifts.afternoon.quantity || 0) * (inst.shifts.afternoon.rate || 0);
                                              if (inst.shifts?.night?.enabled) instTotal += (inst.shifts.night.quantity || 0) * (inst.shifts.night.rate || 0);
                                              return total + instTotal;
                                            }, 0).toLocaleString()}
                                          </span>
                                        </div>
                                        {linkedQuotationData.serviceInstances.unarmedGuards.map((instance: any, instIdx: number) => (
                                          <div key={instance.id || instIdx} className="mb-2 p-3 bg-white dark:bg-gray-800 rounded border">
                                            <div className="flex justify-between items-center mb-2">
                                              <span className="text-xs text-muted-foreground">Instance {instIdx + 1}</span>
                                              <Badge variant="outline" className="text-xs">{instance.shiftType === '8H' ? '8-Hour' : '12-Hour'}</Badge>
                                            </div>
                                            <div className="space-y-1 text-sm">
                                              {instance.shifts?.day?.enabled && (
                                                <div className="flex items-center gap-2">
                                                  <CheckCircle className="h-4 w-4 text-green-500" />
                                                  <span className="w-16">Day</span>
                                                  <span className="bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded text-xs">{instance.shifts.day.quantity} guards</span>
                                                  <span className="bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded text-xs">₹{instance.shifts.day.rate}/guard</span>
                                                </div>
                                              )}
                                              {instance.shiftType === '8H' && instance.shifts?.afternoon?.enabled && (
                                                <div className="flex items-center gap-2">
                                                  <CheckCircle className="h-4 w-4 text-green-500" />
                                                  <span className="w-16">Afternoon</span>
                                                  <span className="bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded text-xs">{instance.shifts.afternoon.quantity} guards</span>
                                                  <span className="bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded text-xs">₹{instance.shifts.afternoon.rate}/guard</span>
                                                </div>
                                              )}
                                              {instance.shifts?.night?.enabled && (
                                                <div className="flex items-center gap-2">
                                                  <CheckCircle className="h-4 w-4 text-green-500" />
                                                  <span className="w-16">Night</span>
                                                  <span className="bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded text-xs">{instance.shifts.night.quantity} guards</span>
                                                  <span className="bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded text-xs">₹{instance.shifts.night.rate}/guard</span>
                                                </div>
                                              )}
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                    
                                    {/* Armed Guards */}
                                    {linkedQuotationData.serviceInstances.armedGuards?.length > 0 && linkedQuotationData.serviceInstances.armedGuards.some((inst: any) => 
                                      inst.shifts?.day?.enabled || inst.shifts?.afternoon?.enabled || inst.shifts?.night?.enabled
                                    ) && (
                                      <div className="border rounded-lg p-3 bg-gray-50 dark:bg-gray-900">
                                        <div className="flex justify-between items-center mb-3">
                                          <h6 className="font-semibold text-[#000000] dark:text-white">Armed Guards</h6>
                                          <span className="text-[#D71920] font-bold">
                                            ₹{linkedQuotationData.serviceInstances.armedGuards.reduce((total: number, inst: any) => {
                                              let instTotal = 0;
                                              if (inst.shifts?.day?.enabled) instTotal += (inst.shifts.day.quantity || 0) * (inst.shifts.day.rate || 0);
                                              if (inst.shifts?.afternoon?.enabled && inst.shiftType === '8H') instTotal += (inst.shifts.afternoon.quantity || 0) * (inst.shifts.afternoon.rate || 0);
                                              if (inst.shifts?.night?.enabled) instTotal += (inst.shifts.night.quantity || 0) * (inst.shifts.night.rate || 0);
                                              return total + instTotal;
                                            }, 0).toLocaleString()}
                                          </span>
                                        </div>
                                        {linkedQuotationData.serviceInstances.armedGuards.map((instance: any, instIdx: number) => (
                                          <div key={instance.id || instIdx} className="mb-2 p-3 bg-white dark:bg-gray-800 rounded border">
                                            <div className="flex justify-between items-center mb-2">
                                              <span className="text-xs text-muted-foreground">Instance {instIdx + 1}</span>
                                              <Badge variant="outline" className="text-xs">{instance.shiftType === '8H' ? '8-Hour' : '12-Hour'}</Badge>
                                            </div>
                                            <div className="space-y-1 text-sm">
                                              {instance.shifts?.day?.enabled && (
                                                <div className="flex items-center gap-2">
                                                  <CheckCircle className="h-4 w-4 text-green-500" />
                                                  <span className="w-16">Day</span>
                                                  <span className="bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded text-xs">{instance.shifts.day.quantity} guards</span>
                                                  <span className="bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded text-xs">₹{instance.shifts.day.rate}/guard</span>
                                                </div>
                                              )}
                                              {instance.shiftType === '8H' && instance.shifts?.afternoon?.enabled && (
                                                <div className="flex items-center gap-2">
                                                  <CheckCircle className="h-4 w-4 text-green-500" />
                                                  <span className="w-16">Afternoon</span>
                                                  <span className="bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded text-xs">{instance.shifts.afternoon.quantity} guards</span>
                                                  <span className="bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded text-xs">₹{instance.shifts.afternoon.rate}/guard</span>
                                                </div>
                                              )}
                                              {instance.shifts?.night?.enabled && (
                                                <div className="flex items-center gap-2">
                                                  <CheckCircle className="h-4 w-4 text-green-500" />
                                                  <span className="w-16">Night</span>
                                                  <span className="bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded text-xs">{instance.shifts.night.quantity} guards</span>
                                                  <span className="bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded text-xs">₹{instance.shifts.night.rate}/guard</span>
                                                </div>
                                              )}
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                    
                                    {/* Supervisors */}
                                    {linkedQuotationData.serviceInstances.supervisors?.length > 0 && linkedQuotationData.serviceInstances.supervisors.some((inst: any) => 
                                      inst.shifts?.day?.enabled || inst.shifts?.afternoon?.enabled || inst.shifts?.night?.enabled
                                    ) && (
                                      <div className="border rounded-lg p-3 bg-gray-50 dark:bg-gray-900">
                                        <div className="flex justify-between items-center mb-3">
                                          <h6 className="font-semibold text-[#000000] dark:text-white">Supervisors</h6>
                                          <span className="text-[#D71920] font-bold">
                                            ₹{linkedQuotationData.serviceInstances.supervisors.reduce((total: number, inst: any) => {
                                              let instTotal = 0;
                                              if (inst.shifts?.day?.enabled) instTotal += (inst.shifts.day.quantity || 0) * (inst.shifts.day.rate || 0);
                                              if (inst.shifts?.afternoon?.enabled && inst.shiftType === '8H') instTotal += (inst.shifts.afternoon.quantity || 0) * (inst.shifts.afternoon.rate || 0);
                                              if (inst.shifts?.night?.enabled) instTotal += (inst.shifts.night.quantity || 0) * (inst.shifts.night.rate || 0);
                                              return total + instTotal;
                                            }, 0).toLocaleString()}
                                          </span>
                                        </div>
                                        {linkedQuotationData.serviceInstances.supervisors.map((instance: any, instIdx: number) => (
                                          <div key={instance.id || instIdx} className="mb-2 p-3 bg-white dark:bg-gray-800 rounded border">
                                            <div className="flex justify-between items-center mb-2">
                                              <span className="text-xs text-muted-foreground">Instance {instIdx + 1}</span>
                                              <Badge variant="outline" className="text-xs">{instance.shiftType === '8H' ? '8-Hour' : '12-Hour'}</Badge>
                                            </div>
                                            <div className="space-y-1 text-sm">
                                              {instance.shifts?.day?.enabled && (
                                                <div className="flex items-center gap-2">
                                                  <CheckCircle className="h-4 w-4 text-green-500" />
                                                  <span className="w-16">Day</span>
                                                  <span className="bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded text-xs">{instance.shifts.day.quantity} guards</span>
                                                  <span className="bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded text-xs">₹{instance.shifts.day.rate}/guard</span>
                                                </div>
                                              )}
                                              {instance.shiftType === '8H' && instance.shifts?.afternoon?.enabled && (
                                                <div className="flex items-center gap-2">
                                                  <CheckCircle className="h-4 w-4 text-green-500" />
                                                  <span className="w-16">Afternoon</span>
                                                  <span className="bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded text-xs">{instance.shifts.afternoon.quantity} guards</span>
                                                  <span className="bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded text-xs">₹{instance.shifts.afternoon.rate}/guard</span>
                                                </div>
                                              )}
                                              {instance.shifts?.night?.enabled && (
                                                <div className="flex items-center gap-2">
                                                  <CheckCircle className="h-4 w-4 text-green-500" />
                                                  <span className="w-16">Night</span>
                                                  <span className="bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded text-xs">{instance.shifts.night.quantity} guards</span>
                                                  <span className="bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded text-xs">₹{instance.shifts.night.rate}/guard</span>
                                                </div>
                                              )}
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                    
                                    {/* Patrol Officers */}
                                    {linkedQuotationData.serviceInstances.patrolOfficers?.length > 0 && linkedQuotationData.serviceInstances.patrolOfficers.some((inst: any) => 
                                      inst.shifts?.day?.enabled || inst.shifts?.afternoon?.enabled || inst.shifts?.night?.enabled
                                    ) && (
                                      <div className="border rounded-lg p-3 bg-gray-50 dark:bg-gray-900">
                                        <div className="flex justify-between items-center mb-3">
                                          <h6 className="font-semibold text-[#000000] dark:text-white">Patrol Officers</h6>
                                          <span className="text-[#D71920] font-bold">
                                            ₹{linkedQuotationData.serviceInstances.patrolOfficers.reduce((total: number, inst: any) => {
                                              let instTotal = 0;
                                              if (inst.shifts?.day?.enabled) instTotal += (inst.shifts.day.quantity || 0) * (inst.shifts.day.rate || 0);
                                              if (inst.shifts?.afternoon?.enabled && inst.shiftType === '8H') instTotal += (inst.shifts.afternoon.quantity || 0) * (inst.shifts.afternoon.rate || 0);
                                              if (inst.shifts?.night?.enabled) instTotal += (inst.shifts.night.quantity || 0) * (inst.shifts.night.rate || 0);
                                              return total + instTotal;
                                            }, 0).toLocaleString()}
                                          </span>
                                        </div>
                                        {linkedQuotationData.serviceInstances.patrolOfficers.map((instance: any, instIdx: number) => (
                                          <div key={instance.id || instIdx} className="mb-2 p-3 bg-white dark:bg-gray-800 rounded border">
                                            <div className="flex justify-between items-center mb-2">
                                              <span className="text-xs text-muted-foreground">Instance {instIdx + 1}</span>
                                              <Badge variant="outline" className="text-xs">{instance.shiftType === '8H' ? '8-Hour' : '12-Hour'}</Badge>
                                            </div>
                                            <div className="space-y-1 text-sm">
                                              {instance.shifts?.day?.enabled && (
                                                <div className="flex items-center gap-2">
                                                  <CheckCircle className="h-4 w-4 text-green-500" />
                                                  <span className="w-16">Day</span>
                                                  <span className="bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded text-xs">{instance.shifts.day.quantity} guards</span>
                                                  <span className="bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded text-xs">₹{instance.shifts.day.rate}/guard</span>
                                                </div>
                                              )}
                                              {instance.shiftType === '8H' && instance.shifts?.afternoon?.enabled && (
                                                <div className="flex items-center gap-2">
                                                  <CheckCircle className="h-4 w-4 text-green-500" />
                                                  <span className="w-16">Afternoon</span>
                                                  <span className="bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded text-xs">{instance.shifts.afternoon.quantity} guards</span>
                                                  <span className="bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded text-xs">₹{instance.shifts.afternoon.rate}/guard</span>
                                                </div>
                                              )}
                                              {instance.shifts?.night?.enabled && (
                                                <div className="flex items-center gap-2">
                                                  <CheckCircle className="h-4 w-4 text-green-500" />
                                                  <span className="w-16">Night</span>
                                                  <span className="bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded text-xs">{instance.shifts.night.quantity} guards</span>
                                                  <span className="bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded text-xs">₹{instance.shifts.night.rate}/guard</span>
                                                </div>
                                              )}
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                    
                                    {/* Totals for new format */}
                                    <div className="border-t-2 pt-3 mt-4">
                                      <div className="flex justify-between items-center py-2">
                                        <span className="font-medium">Subtotal</span>
                                        <span className="font-bold">
                                          ₹{(() => {
                                            let subtotal = 0;
                                            const si = linkedQuotationData.serviceInstances;
                                            ['unarmedGuards', 'armedGuards', 'supervisors', 'patrolOfficers'].forEach(type => {
                                              (si[type] || []).forEach((inst: any) => {
                                                if (inst.shifts?.day?.enabled) subtotal += (inst.shifts.day.quantity || 0) * (inst.shifts.day.rate || 0);
                                                if (inst.shifts?.afternoon?.enabled && inst.shiftType === '8H') subtotal += (inst.shifts.afternoon.quantity || 0) * (inst.shifts.afternoon.rate || 0);
                                                if (inst.shifts?.night?.enabled) subtotal += (inst.shifts.night.quantity || 0) * (inst.shifts.night.rate || 0);
                                              });
                                            });
                                            return subtotal.toLocaleString();
                                          })()}
                                        </span>
                                      </div>
                                      {!linkedQuotationData.gstExempt && (
                                        <div className="flex justify-between items-center py-1 text-muted-foreground">
                                          <span>GST ({linkedQuotationData.gstPercentage || 18}%)</span>
                                          <span>
                                            ₹{(() => {
                                              let subtotal = 0;
                                              const si = linkedQuotationData.serviceInstances;
                                              ['unarmedGuards', 'armedGuards', 'supervisors', 'patrolOfficers'].forEach(type => {
                                                (si[type] || []).forEach((inst: any) => {
                                                  if (inst.shifts?.day?.enabled) subtotal += (inst.shifts.day.quantity || 0) * (inst.shifts.day.rate || 0);
                                                  if (inst.shifts?.afternoon?.enabled && inst.shiftType === '8H') subtotal += (inst.shifts.afternoon.quantity || 0) * (inst.shifts.afternoon.rate || 0);
                                                  if (inst.shifts?.night?.enabled) subtotal += (inst.shifts.night.quantity || 0) * (inst.shifts.night.rate || 0);
                                                });
                                              });
                                              return (subtotal * (linkedQuotationData.gstPercentage || 18) / 100).toLocaleString();
                                            })()}
                                          </span>
                                        </div>
                                      )}
                                      <div className="flex justify-between items-center py-2 border-t-2 border-[#D71920] mt-2">
                                        <span className="font-bold text-lg">Grand Total</span>
                                        <span className="font-bold text-xl text-[#D71920]">
                                          {linkedQuotationData.amount || `₹${(() => {
                                            let subtotal = 0;
                                            const si = linkedQuotationData.serviceInstances;
                                            ['unarmedGuards', 'armedGuards', 'supervisors', 'patrolOfficers'].forEach(type => {
                                              (si[type] || []).forEach((inst: any) => {
                                                if (inst.shifts?.day?.enabled) subtotal += (inst.shifts.day.quantity || 0) * (inst.shifts.day.rate || 0);
                                                if (inst.shifts?.afternoon?.enabled && inst.shiftType === '8H') subtotal += (inst.shifts.afternoon.quantity || 0) * (inst.shifts.afternoon.rate || 0);
                                                if (inst.shifts?.night?.enabled) subtotal += (inst.shifts.night.quantity || 0) * (inst.shifts.night.rate || 0);
                                              });
                                            });
                                            const gst = linkedQuotationData.gstExempt ? 0 : subtotal * (linkedQuotationData.gstPercentage || 18) / 100;
                                            return (subtotal + gst).toLocaleString();
                                          })()}`}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                )}
                                
                                {/* Old securityServices format (fallback) */}
                                {!linkedQuotationData?.serviceInstances && linkedQuotationData?.securityServices && (
                                  <>
                                    {/* Service Table Header */}
                                    <div className="grid grid-cols-12 gap-2 text-xs font-semibold text-[#6C757D] mb-2 px-2 uppercase tracking-wide">
                                      <div className="col-span-2">Service Type</div>
                                      <div className="col-span-2">Shift Type</div>
                                      <div className="col-span-6">Shifts (Qty & Rate ₹)</div>
                                      <div className="col-span-2 text-right">Total (₹)</div>
                                    </div>
                                    
                                    {/* Service Rows */}
                                    {Object.entries(linkedQuotationData.securityServices).map(([serviceKey, serviceData]: [string, any]) => {
                                      const serviceName = serviceKey === 'unarmedGuards' ? 'Unarmed Guards' :
                                                         serviceKey === 'armedGuards' ? 'Armed Guards' :
                                                         serviceKey === 'supervisors' ? 'Supervisors' :
                                                         serviceKey === 'patrolOfficers' ? 'Patrol Officers' :
                                                         serviceKey === 'pso' ? 'PSO' :
                                                         serviceKey === 'bouncers' ? 'Bouncers' :
                                                         serviceKey === 'manpower' ? 'Manpower' : serviceKey;
                                      
                                      const shifts = serviceData?.shifts || {};
                                      const shiftType = linkedQuotationData.shiftType || '12H';
                                      
                                      // Calculate total for this service
                                      let serviceTotal = 0;
                                  if (shifts.day?.enabled) serviceTotal += (shifts.day.quantity || 0) * (shifts.day.rate || 0);
                                  if (shifts.afternoon?.enabled && shiftType === '8H') serviceTotal += (shifts.afternoon.quantity || 0) * (shifts.afternoon.rate || 0);
                                  if (shifts.night?.enabled) serviceTotal += (shifts.night.quantity || 0) * (shifts.night.rate || 0);
                                  
                                  const hasAnyShift = shifts.day?.enabled || shifts.afternoon?.enabled || shifts.night?.enabled;
                                  
                                  return (
                                    <div key={serviceKey} className="border border-[#4A4A4A]/30 rounded-lg p-3 mb-2 bg-[#1a1a1a]">
                                      <div className="grid grid-cols-12 gap-2 items-center">
                                        <div className="col-span-2 font-medium text-sm text-white">{serviceName}</div>
                                        <div className="col-span-2">
                                          <Badge className="text-xs bg-[#4A4A4A] text-white border-none">
                                            {shiftType === '8H' ? '8-Hour' : '12-Hour'}
                                          </Badge>
                                        </div>
                                        <div className="col-span-6 space-y-1">
                                          {/* Day Shift */}
                                          <div className="flex items-center gap-2 text-sm">
                                            {shifts.day?.enabled ? (
                                              <CheckCircle className="h-4 w-4 text-[#2BA745]" />
                                            ) : (
                                              <div className="h-4 w-4 rounded-full border border-[#6C757D]" />
                                            )}
                                            <span className={shifts.day?.enabled ? "text-white" : "text-[#6C757D]"}>Day</span>
                                            <span className="bg-[#4A4A4A] px-2 py-0.5 rounded text-xs min-w-[40px] text-center text-white">
                                              {shifts.day?.quantity || 0}
                                            </span>
                                            <span className="bg-[#4A4A4A] px-2 py-0.5 rounded text-xs min-w-[60px] text-center text-white">
                                              {shifts.day?.rate || 0}
                                            </span>
                                          </div>
                                          
                                          {/* Afternoon Shift (only for 8H) */}
                                          {shiftType === '8H' && (
                                            <div className="flex items-center gap-2 text-sm">
                                              {shifts.afternoon?.enabled ? (
                                                <CheckCircle className="h-4 w-4 text-[#2BA745]" />
                                              ) : (
                                                <div className="h-4 w-4 rounded-full border border-[#6C757D]" />
                                              )}
                                              <span className={shifts.afternoon?.enabled ? "text-white" : "text-[#6C757D]"}>Afternoon</span>
                                              <span className="bg-[#4A4A4A] px-2 py-0.5 rounded text-xs min-w-[40px] text-center text-white">
                                                {shifts.afternoon?.quantity || 0}
                                              </span>
                                              <span className="bg-[#4A4A4A] px-2 py-0.5 rounded text-xs min-w-[60px] text-center text-white">
                                                {shifts.afternoon?.rate || 0}
                                              </span>
                                            </div>
                                          )}
                                          
                                          {/* Night Shift */}
                                          <div className="flex items-center gap-2 text-sm">
                                            {shifts.night?.enabled ? (
                                              <CheckCircle className="h-4 w-4 text-[#2BA745]" />
                                            ) : (
                                              <div className="h-4 w-4 rounded-full border border-[#6C757D]" />
                                            )}
                                            <span className={shifts.night?.enabled ? "text-white" : "text-[#6C757D]"}>Night</span>
                                            <span className="bg-[#4A4A4A] px-2 py-0.5 rounded text-xs min-w-[40px] text-center text-white">
                                              {shifts.night?.quantity || 0}
                                            </span>
                                            <span className="bg-[#4A4A4A] px-2 py-0.5 rounded text-xs min-w-[60px] text-center text-white">
                                              {shifts.night?.rate || 0}
                                            </span>
                                          </div>
                                        </div>
                                        <div className="col-span-2 text-right font-semibold text-[#D71920]">
                                          ₹{serviceTotal.toLocaleString()}
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                                
                                {/* Subtotal and GST */}
                                {linkedQuotationData && (
                                  <div className="mt-4 pt-3 border-t border-[#4A4A4A]/50">
                                    <div className="flex justify-between text-sm mb-1 text-[#F5F5F5]">
                                      <span>Subtotal</span>
                                      <span className="font-semibold">
                                        ₹{(() => {
                                          let subtotal = 0;
                                          const services = linkedQuotationData.securityServices || {};
                                          const shiftType = linkedQuotationData.shiftType || '12H';
                                          Object.values(services).forEach((service: any) => {
                                            const shifts = service?.shifts || {};
                                            if (shifts.day?.enabled) subtotal += (shifts.day.quantity || 0) * (shifts.day.rate || 0);
                                            if (shifts.afternoon?.enabled && shiftType === '8H') subtotal += (shifts.afternoon.quantity || 0) * (shifts.afternoon.rate || 0);
                                            if (shifts.night?.enabled) subtotal += (shifts.night.quantity || 0) * (shifts.night.rate || 0);
                                          });
                                          return subtotal.toLocaleString();
                                        })()}
                                      </span>
                                    </div>
                                    {!linkedQuotationData.gstExempt && (
                                      <div className="flex justify-between text-sm mb-1 text-[#F5F5F5]">
                                        <span>GST ({linkedQuotationData.gstPercentage || 18}%)</span>
                                        <span>
                                          ₹{(() => {
                                            let subtotal = 0;
                                            const services = linkedQuotationData.securityServices || {};
                                            const shiftType = linkedQuotationData.shiftType || '12H';
                                            Object.values(services).forEach((service: any) => {
                                              const shifts = service?.shifts || {};
                                              if (shifts.day?.enabled) subtotal += (shifts.day.quantity || 0) * (shifts.day.rate || 0);
                                              if (shifts.afternoon?.enabled && shiftType === '8H') subtotal += (shifts.afternoon.quantity || 0) * (shifts.afternoon.rate || 0);
                                              if (shifts.night?.enabled) subtotal += (shifts.night.quantity || 0) * (shifts.night.rate || 0);
                                            });
                                            const gst = subtotal * (linkedQuotationData.gstPercentage || 18) / 100;
                                            return gst.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                                          })()}
                                        </span>
                                      </div>
                                    )}
                                    <div className="flex justify-between font-semibold text-lg pt-2 border-t border-[#4A4A4A]/50">
                                      <span className="text-white">Total</span>
                                      <span className="text-[#2BA745]">
                                        {linkedQuotationData.amount || `₹${(() => {
                                          let subtotal = 0;
                                          const services = linkedQuotationData.securityServices || {};
                                          const shiftType = linkedQuotationData.shiftType || '12H';
                                          Object.values(services).forEach((service: any) => {
                                            const shifts = service?.shifts || {};
                                            if (shifts.day?.enabled) subtotal += (shifts.day.quantity || 0) * (shifts.day.rate || 0);
                                            if (shifts.afternoon?.enabled && shiftType === '8H') subtotal += (shifts.afternoon.quantity || 0) * (shifts.afternoon.rate || 0);
                                            if (shifts.night?.enabled) subtotal += (shifts.night.quantity || 0) * (shifts.night.rate || 0);
                                          });
                                          const gst = linkedQuotationData.gstExempt ? 0 : subtotal * (linkedQuotationData.gstPercentage || 18) / 100;
                                          return (subtotal + gst).toLocaleString();
                                        })()}`}
                                      </span>
                                    </div>
                                  </div>
                                )}
                                  </>
                                )}
                              </div>
                            </CollapsibleContent>
                          </Collapsible>
                        )}
                        
                        {post.services && post.services.length > 0 && (
                          <div className="pt-2 border-t border-[#4A4A4A]/20">
                            <p className="text-xs text-[#6C757D] mb-2 font-medium">Services:</p>
                            <div className="flex flex-wrap gap-1">
                              {post.services.map((service: any, sIdx: number) => (
                                <Badge key={sIdx} className="text-xs bg-[#F5F5F5] text-[#4A4A4A] dark:bg-gray-700 dark:text-white border border-[#4A4A4A]/20 hover:bg-[#e5e5e5]">
                                  {service.serviceType || service.name || `Service ${sIdx + 1}`}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </Card>
                  ))}
                </div>
              )}
              
              <div className="space-y-2 pt-4 border-t border-[#4A4A4A]/20">
                <Label htmlFor="notes" className="text-[#000000] dark:text-white font-medium">Additional Notes</Label>
                <Textarea 
                  id="notes" 
                  name="notes" 
                  value={formData.notes} 
                  onChange={handleChange} 
                  placeholder="Additional notes about the agreement" 
                  rows={3}
                  className="border-[#4A4A4A]/30 focus:border-[#D71920] focus:ring-[#D71920]/20"
                />
              </div>
            </TabsContent>
            
            {/* Compliance Tab */}
            <TabsContent value="compliance" className="space-y-4">
              <div className="border rounded-md p-4 space-y-4">
                <h3 className="font-medium">PSARA Compliance</h3>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="psaraLicenseNumber">PSARA License Number</Label>
                    <Input 
                      id="psaraLicenseNumber" 
                      value={formData.complianceInfo.psaraLicenseNumber} 
                      onChange={(e) => 
                        handleNestedChange("complianceInfo", "psaraLicenseNumber", e.target.value)
                      }
                      placeholder="Enter PSARA license number" 
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="psaraExpiryDate">PSARA License Expiry</Label>
                    <Input 
                      id="psaraExpiryDate" 
                      type="date"
                      value={formData.complianceInfo.psaraExpiryDate} 
                      onChange={(e) => 
                        handleNestedChange("complianceInfo", "psaraExpiryDate", e.target.value)
                      }
                    />
                  </div>
                </div>
              </div>
              
              <div className="border rounded-md p-4 space-y-3">
                <h3 className="font-medium">Labour Law Compliance</h3>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="minWageCompliance" 
                      checked={formData.complianceInfo.minWageCompliance}
                      onCheckedChange={(checked) => 
                        handleCheckboxChange("complianceInfo", "minWageCompliance", checked === true)
                      }
                    />
                    <Label htmlFor="minWageCompliance">Minimum Wages Act</Label>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="workersCompensation" 
                      checked={formData.complianceInfo.workersCompensation}
                      onCheckedChange={(checked) => 
                        handleCheckboxChange("complianceInfo", "workersCompensation", checked === true)
                      }
                    />
                    <Label htmlFor="workersCompensation">Workers Compensation</Label>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="epfCompliance" 
                      checked={formData.complianceInfo.epfCompliance}
                      onCheckedChange={(checked) => 
                        handleCheckboxChange("complianceInfo", "epfCompliance", checked === true)
                      }
                    />
                    <Label htmlFor="epfCompliance">EPF Compliance</Label>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="esiCompliance" 
                      checked={formData.complianceInfo.esiCompliance}
                      onCheckedChange={(checked) => 
                        handleCheckboxChange("complianceInfo", "esiCompliance", checked === true)
                      }
                    />
                    <Label htmlFor="esiCompliance">ESI Compliance</Label>
                  </div>
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="gstNumber">Client GST Number</Label>
                <Input 
                  id="gstNumber" 
                  value={formData.complianceInfo.gstNumber} 
                  onChange={(e) => 
                    handleNestedChange("complianceInfo", "gstNumber", e.target.value.toUpperCase())
                  }
                  placeholder="Enter client GST number"
                  className="uppercase font-mono"
                  maxLength={15}
                />
              </div>
            </TabsContent>
            
            {/* Terms & Signing Tab */}
            <TabsContent value="terms" className="space-y-4">
              {/* Legal Terms */}
              <div className="border rounded-md p-4 space-y-4">
                <h3 className="font-medium">Legal Terms</h3>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="contractDuration">Contract Duration (months)</Label>
                    <Input 
                      id="contractDuration"
                      type="number"
                      min="1"
                      value={formData.legalTerms.contractDuration} 
                      onChange={(e) => 
                        handleNestedChange("legalTerms", "contractDuration", e.target.value)
                      }
                      placeholder="Enter duration in months"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="terminationNotice">Termination Notice (days)</Label>
                    <Select 
                      value={formData.legalTerms.terminationNotice} 
                      onValueChange={(value) => 
                        handleNestedChange("legalTerms", "terminationNotice", value)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select notice period" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="15">15 days</SelectItem>
                        <SelectItem value="30">30 days</SelectItem>
                        <SelectItem value="60">60 days</SelectItem>
                        <SelectItem value="90">90 days</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="governingLaw">Governing Law (State)</Label>
                    <Input 
                      id="governingLaw" 
                      value={formData.legalTerms.governingLaw} 
                      onChange={(e) => 
                        handleNestedChange("legalTerms", "governingLaw", e.target.value)
                      }
                      placeholder="Enter governing state law" 
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="disputeResolution">Dispute Resolution</Label>
                    <Select 
                      value={formData.legalTerms.disputeResolution} 
                      onValueChange={(value) => 
                        handleNestedChange("legalTerms", "disputeResolution", value)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select resolution method" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="arbitration">Arbitration</SelectItem>
                        <SelectItem value="mediation">Mediation</SelectItem>
                        <SelectItem value="court">Court</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="automaticRenewal" 
                      checked={formData.legalTerms.automaticRenewal}
                      onCheckedChange={(checked) => 
                        handleCheckboxChange("legalTerms", "automaticRenewal", checked === true)
                      }
                    />
                    <Label htmlFor="automaticRenewal">Automatic Renewal</Label>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="nonCompete" 
                      checked={formData.legalTerms.nonCompete}
                      onCheckedChange={(checked) => 
                        handleCheckboxChange("legalTerms", "nonCompete", checked === true)
                      }
                    />
                    <Label htmlFor="nonCompete">Non-Compete Clause</Label>
                  </div>
                </div>
              </div>
              
              {/* Payment Terms */}
              <div className="border rounded-md p-4 space-y-4">
                <h3 className="font-medium">Payment Terms</h3>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="billingCycle">Billing Cycle</Label>
                    <Select 
                      value={formData.paymentTerms.billingCycle} 
                      onValueChange={(value) => 
                        handleNestedChange("paymentTerms", "billingCycle", value)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select billing cycle" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="monthly">Monthly</SelectItem>
                        <SelectItem value="quarterly">Quarterly</SelectItem>
                        <SelectItem value="biannually">Bi-annually</SelectItem>
                        <SelectItem value="annually">Annually</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="paymentDue">Payment Due (days)</Label>
                    <Select 
                      value={formData.paymentTerms.paymentDue} 
                      onValueChange={(value) => 
                        handleNestedChange("paymentTerms", "paymentDue", value)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select payment due period" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="15">15 days</SelectItem>
                        <SelectItem value="30">30 days</SelectItem>
                        <SelectItem value="45">45 days</SelectItem>
                        <SelectItem value="60">60 days</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="paymentMethod">Preferred Payment Method</Label>
                  <Select 
                    value={formData.paymentTerms.paymentMethod} 
                    onValueChange={(value) => 
                      handleNestedChange("paymentTerms", "paymentMethod", value)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select payment method" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bankTransfer">Bank Transfer</SelectItem>
                      <SelectItem value="cheque">Cheque</SelectItem>
                      <SelectItem value="upi">UPI</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              {/* Document Signatories */}
              <div className="border rounded-md p-4 space-y-4">
                <h3 className="font-medium">Agreement Signatories</h3>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="companySignatory">Company Signatory</Label>
                    <Input 
                      id="companySignatory" 
                      name="companySignatory" 
                      value={formData.companySignatory} 
                      onChange={handleChange} 
                      placeholder="Name of company signatory" 
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="companySignatoryDesignation">Designation</Label>
                    <Input 
                      id="companySignatoryDesignation" 
                      name="companySignatoryDesignation" 
                      value={formData.companySignatoryDesignation} 
                      onChange={handleChange} 
                      placeholder="Designation of company signatory" 
                    />
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="clientSignatory">Client Signatory</Label>
                    <Input 
                      id="clientSignatory" 
                      name="clientSignatory" 
                      value={formData.clientSignatory} 
                      onChange={handleChange} 
                      placeholder="Name of client signatory" 
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="clientSignatoryDesignation">Designation</Label>
                    <Input 
                      id="clientSignatoryDesignation" 
                      name="clientSignatoryDesignation" 
                      value={formData.clientSignatoryDesignation} 
                      onChange={handleChange} 
                      placeholder="Designation of client signatory" 
                    />
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>
          
          <DialogFooter className="pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" className="bg-safend-red hover:bg-red-700">
              {editData?.id ? "Update Agreement" : "Submit Agreement"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
