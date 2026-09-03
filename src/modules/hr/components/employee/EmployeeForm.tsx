'use client';
import { useState, useEffect, useCallback } from "react";
import { 
  Dialog, 
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { 
  User, 
  MapPin, 
  CreditCard, 
  Briefcase, 
  BookUser,
  Heart,
  Activity,
  AlertTriangle,
  Ruler,
  Cigarette,
  Loader2,
  Home,
  FileText,
  Download,
  Upload,
  Eye,
  Trash2,
  CheckCircle2,
  Camera,
  ImageIcon,
  Info,
  X,
  ChevronLeft,
  ChevronRight,
  Check
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Employee } from "../EmployeeDirectory";
import { HREmployee } from "@/services/supabase/HREmployeeService";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { generateEmployeeContractPdf } from "@/services/pdf/EmployeeContractPdfService";
import { saveFormDraft, loadFormDraft, clearFormDraft } from "@/utils/formDraft";

// Form draft key
const EMPLOYEE_FORM_DRAFT_KEY = 'employee_form';

// Wizard steps configuration
const STEPS = [
  { value: "personal", label: "Personal", icon: User },
  { value: "physical", label: "Physical & Medical", icon: Activity },
  { value: "employment", label: "Employment", icon: Briefcase },
  { value: "address", label: "Address", icon: MapPin },
  { value: "banking", label: "Banking", icon: CreditCard },
  { value: "documents", label: "Documents", icon: FileText },
] as const;

// Indian States
const INDIAN_STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh",
  "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka",
  "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram",
  "Nagaland", "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu",
  "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal",
  "Andaman and Nicobar Islands", "Chandigarh", "Dadra and Nagar Haveli and Daman and Diu",
  "Delhi", "Jammu and Kashmir", "Ladakh", "Lakshadweep", "Puducherry"
];

// Default form data
const getDefaultFormData = () => ({
  name: "", email: "", phone: "", gender: "male", dateOfBirth: "", maritalStatus: "single",
  bloodGroup: "", nationality: "Indian", fatherName: "", motherName: "", spouseName: "",
  religion: "", caste: "",
  height: "", weight: "", eyeColor: "", hairColor: "", complexion: "", bodyType: "",
  shoeSize: "", uniformSize: "", identificationMarks: "", physicalDisability: "", fitnessLevel: "",
  medicalConditions: "", allergies: "", chronicDiseases: "", currentMedications: "",
  pastSurgeries: "", eyeSight: "", hearingAbility: "", colorBlindness: false,
  smoking: false, smokingFrequency: "", alcohol: false, alcoholFrequency: "",
  tobacco: false, tobaccoType: "", otherHabits: "",
  employeeId: "", department: "Operations", designation: "Unarmed Guards", joinDate: "",
  employmentType: "Full-Time", reportingManager: "", workLocation: "", status: "Active",
  currentAddress: "", currentCity: "", currentState: "", currentPostalCode: "",
  permanentAddress: "", permanentCity: "", permanentState: "", permanentPostalCode: "",
  accountName: "", accountNumber: "", bankName: "", branchName: "", branchAddress: "", ifscCode: "",
  emergencyContactName: "", emergencyContactRelation: "", emergencyContactPhone: "",
  // Documents
  passportPhoto: "", passportPhotoFile: null as File | null,
  aadharNumber: "", panNumber: "", aadharFile: "", panFile: "",
  addressProofType: "", addressProofFile: "",
  bankPassbookFile: "", cancelledChequeFile: "",
  contractStartDate: "", contractEndDate: "", salary: "", probationPeriod: "3"
});

interface EmployeeFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (employeeData: any) => void;
  employee: (Employee & Partial<HREmployee>) | null;
  /** When true, hides the Documents step (used by onboarding pipeline which handles docs separately) */
  hideDocumentsStep?: boolean;
}

export function EmployeeForm({ isOpen, onClose, onSave, employee, hideDocumentsStep }: EmployeeFormProps) {
  const [activeTab, setActiveTab] = useState("personal");
  const [visitedSteps, setVisitedSteps] = useState<Set<string>>(new Set(["personal"]));
  const [sameAsCurrentAddress, setSameAsCurrentAddress] = useState(false);
  const [loadingCurrentPincode, setLoadingCurrentPincode] = useState(false);
  const [loadingPermanentPincode, setLoadingPermanentPincode] = useState(false);
  const [loadingIfsc, setLoadingIfsc] = useState(false);
  const [passportPhotoPreview, setPassportPhotoPreview] = useState<string | null>(null);
  const { toast } = useToast();
  
  const [formData, setFormData] = useState(getDefaultFormData());

  useEffect(() => {
    if (isOpen) {
      // Reset wizard to first step whenever the dialog opens
      setActiveTab("personal");
      setVisitedSteps(new Set(["personal"]));

      if (employee) {
        // Editing existing employee - load their data
        
        // Get existing photo URL from employee data
        const existingPhotoUrl = employee.avatar || employee.photoUrl || '';
        
        setFormData(prev => ({
          ...prev, 
          name: employee.name || "", 
          email: employee.email || "", 
          phone: employee.phoneNumber || employee.phone || "",
          employeeId: employee.id || employee.employeeId || "", 
          department: employee.department || "Operations",
          designation: employee.designation || "Unarmed Guards", 
          joinDate: employee.joinDate || "",
          status: employee.status || "Active",
        }));
        
        // Set passport photo preview if employee has existing photo
        if (existingPhotoUrl) {
          setPassportPhotoPreview(existingPhotoUrl);
        } else {
          setPassportPhotoPreview(null);
        }
      } else {
        // New employee - reset photo preview
        setPassportPhotoPreview(null);
        
        // Check for draft first
        const draft = loadFormDraft<typeof formData>(EMPLOYEE_FORM_DRAFT_KEY);
        if (draft) {
          // Remove file objects from draft (can't be serialized)
          const { passportPhotoFile, ...draftWithoutFiles } = draft;
          setFormData(prev => ({ ...prev, ...draftWithoutFiles }));
          toast({
            title: "Draft Restored",
            description: "Your previous form data has been restored.",
          });
        } else {
          // Generate new employee ID
          const newEmployeeId = `EMP${Math.floor(1000 + Math.random() * 9000)}`;
          setFormData(prev => ({ 
            ...getDefaultFormData(), 
            employeeId: newEmployeeId, 
            joinDate: new Date().toISOString().split('T')[0] 
          }));
        }
      }
    }
  }, [isOpen, employee]);

  // Save draft whenever form data changes (debounced)
  useEffect(() => {
    if (isOpen && !employee) {
      const timeoutId = setTimeout(() => {
        // Don't save if form is empty
        if (formData.name || formData.email || formData.phone) {
          const { passportPhotoFile, ...dataToSave } = formData;
          saveFormDraft(EMPLOYEE_FORM_DRAFT_KEY, dataToSave);
        }
      }, 500);
      return () => clearTimeout(timeoutId);
    }
  }, [formData, isOpen, employee]);

  const handleChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  // Track visited steps so completed indicators stay visible
  const handleTabChange = (value: string) => {
    setActiveTab(value);
    setVisitedSteps(prev => {
      const next = new Set(prev);
      next.add(value);
      return next;
    });
  };

  // Wizard navigation — optionally hide the documents step for onboarding flow
  const steps = hideDocumentsStep ? STEPS.filter(s => s.value !== 'documents') : STEPS;
  const currentStepIndex = steps.findIndex(s => s.value === activeTab);
  const isFirstStep = currentStepIndex <= 0;
  const isLastStep = currentStepIndex === steps.length - 1;
  const progressValue = ((currentStepIndex + 1) / steps.length) * 100;

  // ── Step-level validation ─────────────────────────────────────────────────
  const validateStep = (step: string): string | null => {
    switch (step) {
      case 'personal':
        if (!formData.name.trim()) return 'Full Name is required';
        if (!formData.phone.trim()) return 'Phone Number is required';
        if (formData.phone.replace(/\D/g, '').length < 10) return 'Phone must be at least 10 digits';
        if (!formData.gender) return 'Gender is required';
        if (!formData.dateOfBirth) return 'Date of Birth is required';
        return null;
      case 'physical':
        if (!formData.height) return 'Height is required';
        if (!formData.weight) return 'Weight is required';
        return null;
      case 'employment':
        if (!formData.department) return 'Department is required';
        if (!formData.designation) return 'Designation is required';
        if (!formData.joinDate) return 'Joining Date is required';
        return null;
      case 'address':
        if (!formData.currentAddress.trim()) return 'Current Address is required';
        if (!formData.currentCity.trim()) return 'Current City is required';
        if (!formData.currentState) return 'Current State is required';
        if (!formData.currentPostalCode.trim()) return 'Current Postal Code is required';
        if (!formData.emergencyContactName.trim()) return 'Emergency Contact Name is required';
        if (!formData.emergencyContactPhone.trim()) return 'Emergency Contact Phone is required';
        return null;
      case 'banking':
        // Banking is optional but if IFSC is provided, account number should be too
        if (formData.ifscCode && !formData.accountNumber) return 'Account Number is required when IFSC is provided';
        return null;
      case 'documents':
        // Documents step (when shown outside onboarding): photo is required
        if (!formData.passportPhoto && !formData.passportPhotoFile) return 'Passport Size Photo is required';
        return null;
      default:
        return null;
    }
  };

  const goToNextStep = () => {
    if (isLastStep) return;
    const error = validateStep(steps[currentStepIndex].value);
    if (error) {
      toast({ title: "Missing Required Field", description: error, variant: "destructive" });
      return;
    }
    handleTabChange(steps[currentStepIndex + 1].value);
  };

  const goToPreviousStep = () => {
    if (isFirstStep) return;
    handleTabChange(steps[currentStepIndex - 1].value);
  };

  // Handle close with confirmation if form has data
  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  // Handle passport photo upload with size validation (max 500KB)
  const handlePassportPhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check file size (500KB = 512000 bytes)
    const maxSize = 500 * 1024; // 500KB in bytes
    if (file.size > maxSize) {
      toast({
        title: "File Too Large",
        description: "Passport photo must be less than 500KB. Please compress or resize the image.",
        variant: "destructive"
      });
      e.target.value = ''; // Reset input
      return;
    }

    // Check file type
    if (!file.type.startsWith('image/')) {
      toast({
        title: "Invalid File Type",
        description: "Please upload an image file (JPG, PNG, etc.)",
        variant: "destructive"
      });
      e.target.value = '';
      return;
    }

    // Create preview
    const reader = new FileReader();
    reader.onloadend = () => {
      setPassportPhotoPreview(reader.result as string);
      setFormData(prev => ({ 
        ...prev, 
        passportPhoto: file.name,
        passportPhotoFile: file
      }));
    };
    reader.readAsDataURL(file);

    toast({
      title: "Photo Uploaded",
      description: `${file.name} (${(file.size / 1024).toFixed(1)}KB)`
    });
  };

  // Remove passport photo
  const removePassportPhoto = () => {
    setPassportPhotoPreview(null);
    setFormData(prev => ({ ...prev, passportPhoto: "", passportPhotoFile: null }));
  };

  // Fetch location from pincode using India Post API
  const fetchLocationFromPincode = async (pincode: string, type: 'current' | 'permanent') => {
    if (pincode.length !== 6) return;
    
    const setLoading = type === 'current' ? setLoadingCurrentPincode : setLoadingPermanentPincode;
    setLoading(true);
    
    try {
      const response = await fetch(`https://api.postalpincode.in/pincode/${pincode}`);
      const data = await response.json();
      
      if (data[0]?.Status === "Success" && data[0]?.PostOffice?.length > 0) {
        const postOffice = data[0].PostOffice[0];
        if (type === 'current') {
          setFormData(prev => ({ ...prev, currentState: postOffice.State, currentCity: postOffice.District }));
        } else {
          setFormData(prev => ({ ...prev, permanentState: postOffice.State, permanentCity: postOffice.District }));
        }
        toast({ title: "Location Found", description: `${postOffice.District}, ${postOffice.State}` });
      } else {
        toast({ title: "Invalid Pincode", description: "Could not find location for this pincode", variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to fetch location data", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  // Fetch bank details from IFSC code using Razorpay API
  const fetchBankFromIfsc = async (ifsc: string) => {
    if (ifsc.length !== 11) return;
    
    setLoadingIfsc(true);
    try {
      const response = await fetch(`https://ifsc.razorpay.com/${ifsc}`);
      if (response.ok) {
        const data = await response.json();
        setFormData(prev => ({
          ...prev,
          bankName: data.BANK || "",
          branchName: data.BRANCH || "",
          branchAddress: data.ADDRESS || ""
        }));
        toast({ title: "Bank Details Found", description: `${data.BANK} - ${data.BRANCH}` });
      } else {
        toast({ title: "Invalid IFSC", description: "Could not find bank for this IFSC code", variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to fetch bank details", variant: "destructive" });
    } finally {
      setLoadingIfsc(false);
    }
  };

  // Handle same as current address checkbox
  const handleSameAddressChange = (checked: boolean) => {
    setSameAsCurrentAddress(checked);
    if (checked) {
      setFormData(prev => ({
        ...prev,
        permanentAddress: prev.currentAddress,
        permanentCity: prev.currentCity,
        permanentState: prev.currentState,
        permanentPostalCode: prev.currentPostalCode
      }));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Guard against accidental submit (e.g. pressing Enter) before reaching the last step
    if (!isLastStep) {
      goToNextStep();
      return;
    }
    // Validate current (last) step before saving
    const error = validateStep(steps[currentStepIndex].value);
    if (error) {
      toast({ title: "Missing Required Field", description: error, variant: "destructive" });
      return;
    }
    // Clear draft on successful save
    clearFormDraft(EMPLOYEE_FORM_DRAFT_KEY);
    onSave(formData);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-5xl max-h-[90vh] p-0 gap-0" preventOutsideClose={true}>
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-[#D71920]/20">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-full bg-[#D71920]/10 flex items-center justify-center shrink-0">
                <User className="h-5 w-5 text-[#D71920]" />
              </div>
              <div>
                <DialogTitle className="text-xl md:text-2xl font-bold leading-tight">
                  {employee ? "Edit Employee" : "New Employee Details"}
                </DialogTitle>
                <DialogDescription className="mt-1">
                  {employee ? "Update employee information" : "Fill in all required details to register the employee"}
                </DialogDescription>
              </div>
            </div>
            <div className="hidden sm:flex flex-col items-end pr-8">
              <span className="text-xs font-medium text-gray-500">
                Step {currentStepIndex + 1} of {steps.length}
              </span>
              <span className="text-sm font-semibold text-[#D71920]">
                {steps[currentStepIndex]?.label}
              </span>
            </div>
          </div>
          <div className="mt-4">
            <Progress value={progressValue} className="h-1.5" />
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="p-1">
            <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
              <div className="px-6 pt-4 border-b overflow-x-auto">
                <TabsList className="bg-gray-100 dark:bg-gray-800 p-1 rounded-lg inline-flex gap-1">
                  {steps.map((step, index) => {
                    const Icon = step.icon;
                    const isActive = activeTab === step.value;
                    const isCompleted = !isActive && (visitedSteps.has(step.value) || index < currentStepIndex);
                    return (
                      <TabsTrigger
                        key={step.value}
                        value={step.value}
                        className="flex gap-2 items-center data-[state=active]:bg-[#D71920] data-[state=active]:text-white data-[state=inactive]:hover:bg-white/60 dark:data-[state=inactive]:hover:bg-gray-700/60 transition-colors"
                      >
                        {isCompleted ? (
                          <Check className="h-4 w-4 text-emerald-600" />
                        ) : (
                          <Icon className="h-4 w-4" />
                        )}
                        <span>{step.label}</span>
                      </TabsTrigger>
                    );
                  })}
                </TabsList>
              </div>

              <ScrollArea className="h-[500px]">
                <div className="p-6">
                  {/* Personal Information Tab */}
                  <TabsContent value="personal" className="space-y-6 mt-0">
                    <div className="space-y-4">
                      <div className="flex items-center gap-2 pb-2 border-b border-[#D71920]/20">
                        <User className="h-5 w-5 text-[#D71920]" />
                        <h3 className="font-semibold text-base">Basic Information</h3>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        <div className="space-y-2">
                          <Label className="text-sm font-medium">Full Name <span className="text-red-500">*</span></Label>
                          <Input value={formData.name} onChange={(e) => handleChange("name", e.target.value)} placeholder="Enter full name" className="h-11 border-gray-300 focus:border-[#D71920]" />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm font-medium">Email Address</Label>
                          <Input type="email" value={formData.email} onChange={(e) => handleChange("email", e.target.value)} placeholder="example@company.com" className="h-11 border-gray-300 focus:border-[#D71920]" />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm font-medium">Phone Number <span className="text-red-500">*</span></Label>
                          <Input value={formData.phone} onChange={(e) => handleChange("phone", e.target.value)} placeholder="+91 9876543210" className="h-11 border-gray-300 focus:border-[#D71920]" />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm font-medium">Gender <span className="text-red-500">*</span></Label>
                          <Select value={formData.gender} onValueChange={(v) => handleChange("gender", v)}>
                            <SelectTrigger className="h-11"><SelectValue placeholder="Select gender" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="male">Male</SelectItem>
                              <SelectItem value="female">Female</SelectItem>
                              <SelectItem value="other">Other</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm font-medium">Date of Birth <span className="text-red-500">*</span></Label>
                          <Input type="date" value={formData.dateOfBirth} onChange={(e) => handleChange("dateOfBirth", e.target.value)} className="h-11 border-gray-300 focus:border-[#D71920]" />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm font-medium">Blood Group</Label>
                          <Select value={formData.bloodGroup} onValueChange={(v) => handleChange("bloodGroup", v)}>
                            <SelectTrigger className="h-11"><SelectValue placeholder="Select blood group" /></SelectTrigger>
                            <SelectContent>
                              {["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map(bg => <SelectItem key={bg} value={bg}>{bg}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm font-medium">Marital Status</Label>
                          <Select value={formData.maritalStatus} onValueChange={(v) => handleChange("maritalStatus", v)}>
                            <SelectTrigger className="h-11"><SelectValue placeholder="Select status" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="single">Single</SelectItem>
                              <SelectItem value="married">Married</SelectItem>
                              <SelectItem value="divorced">Divorced</SelectItem>
                              <SelectItem value="widowed">Widowed</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm font-medium">Nationality</Label>
                          <Input value={formData.nationality} onChange={(e) => handleChange("nationality", e.target.value)} placeholder="Enter nationality" className="h-11 border-gray-300 focus:border-[#D71920]" />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm font-medium">Religion</Label>
                          <Select value={formData.religion} onValueChange={(v) => handleChange("religion", v)}>
                            <SelectTrigger className="h-11"><SelectValue placeholder="Select religion" /></SelectTrigger>
                            <SelectContent>
                              {["hindu", "muslim", "christian", "sikh", "buddhist", "jain", "other"].map(r => <SelectItem key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm font-medium">Caste / Category</Label>
                          <Select value={formData.caste} onValueChange={(v) => handleChange("caste", v)}>
                            <SelectTrigger className="h-11"><SelectValue placeholder="Select category" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="general">General</SelectItem>
                              <SelectItem value="obc">OBC</SelectItem>
                              <SelectItem value="sc">SC</SelectItem>
                              <SelectItem value="st">ST</SelectItem>
                              <SelectItem value="ews">EWS</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>
                    <div className="space-y-4">
                      <div className="flex items-center gap-2 pb-2 border-b border-[#D71920]/20">
                        <Heart className="h-5 w-5 text-[#D71920]" />
                        <h3 className="font-semibold text-base">Family Information</h3>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                        <div className="space-y-2">
                          <Label className="text-sm font-medium">Father's Name</Label>
                          <Input value={formData.fatherName} onChange={(e) => handleChange("fatherName", e.target.value)} placeholder="Enter father's name" className="h-11 border-gray-300 focus:border-[#D71920]" />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm font-medium">Mother's Name</Label>
                          <Input value={formData.motherName} onChange={(e) => handleChange("motherName", e.target.value)} placeholder="Enter mother's name" className="h-11 border-gray-300 focus:border-[#D71920]" />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm font-medium">Spouse Name</Label>
                          <Input value={formData.spouseName} onChange={(e) => handleChange("spouseName", e.target.value)} placeholder="If married" className="h-11 border-gray-300 focus:border-[#D71920]" />
                        </div>
                      </div>
                    </div>

                    {/* Emergency Contact Section */}
                    <div className="space-y-4">
                      <div className="flex items-center gap-2 pb-2 border-b border-[#D71920]/20">
                        <BookUser className="h-5 w-5 text-[#D71920]" />
                        <h3 className="font-semibold text-base">Emergency Contact</h3>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                        <div className="space-y-2">
                          <Label className="text-sm font-medium">Contact Name <span className="text-red-500">*</span></Label>
                          <Input value={formData.emergencyContactName} onChange={(e) => handleChange("emergencyContactName", e.target.value)} placeholder="Enter contact name" className="h-11 border-gray-300 focus:border-[#D71920]" />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm font-medium">Relation</Label>
                          <Select value={formData.emergencyContactRelation} onValueChange={(v) => handleChange("emergencyContactRelation", v)}>
                            <SelectTrigger className="h-11"><SelectValue placeholder="Select relation" /></SelectTrigger>
                            <SelectContent>
                              {["Father", "Mother", "Spouse", "Brother", "Sister", "Son", "Daughter", "Friend", "Other"].map(r => <SelectItem key={r} value={r.toLowerCase()}>{r}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm font-medium">Phone Number <span className="text-red-500">*</span></Label>
                          <Input value={formData.emergencyContactPhone} onChange={(e) => handleChange("emergencyContactPhone", e.target.value)} placeholder="Enter contact number" className="h-11 border-gray-300 focus:border-[#D71920]" />
                        </div>
                      </div>
                    </div>
                  </TabsContent>


                  {/* Physical & Medical Tab */}
                  <TabsContent value="physical" className="space-y-6 mt-0">
                    <div className="space-y-4">
                      <div className="flex items-center gap-2 pb-2 border-b border-[#D71920]/20">
                        <Ruler className="h-5 w-5 text-[#D71920]" />
                        <h3 className="font-semibold text-base">Physical Attributes</h3>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                        <div className="space-y-2">
                          <Label className="text-sm font-medium">Height (cm) <span className="text-red-500">*</span></Label>
                          <Input value={formData.height} onChange={(e) => handleChange("height", e.target.value)} placeholder="e.g., 175" className="h-11 border-gray-300 focus:border-[#D71920]" />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm font-medium">Weight (kg) <span className="text-red-500">*</span></Label>
                          <Input value={formData.weight} onChange={(e) => handleChange("weight", e.target.value)} placeholder="e.g., 70" className="h-11 border-gray-300 focus:border-[#D71920]" />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm font-medium">Body Type</Label>
                          <Select value={formData.bodyType} onValueChange={(v) => handleChange("bodyType", v)}>
                            <SelectTrigger className="h-11"><SelectValue placeholder="Select body type" /></SelectTrigger>
                            <SelectContent>
                              {["slim", "average", "athletic", "muscular", "heavy"].map(t => <SelectItem key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm font-medium">Complexion</Label>
                          <Select value={formData.complexion} onValueChange={(v) => handleChange("complexion", v)}>
                            <SelectTrigger className="h-11"><SelectValue placeholder="Select complexion" /></SelectTrigger>
                            <SelectContent>
                              {["fair", "wheatish", "dusky", "dark"].map(c => <SelectItem key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm font-medium">Eye Color</Label>
                          <Select value={formData.eyeColor} onValueChange={(v) => handleChange("eyeColor", v)}>
                            <SelectTrigger className="h-11"><SelectValue placeholder="Select eye color" /></SelectTrigger>
                            <SelectContent>
                              {["black", "brown", "hazel", "green", "blue"].map(c => <SelectItem key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm font-medium">Hair Color</Label>
                          <Select value={formData.hairColor} onValueChange={(v) => handleChange("hairColor", v)}>
                            <SelectTrigger className="h-11"><SelectValue placeholder="Select hair color" /></SelectTrigger>
                            <SelectContent>
                              {["black", "brown", "gray", "white", "bald"].map(c => <SelectItem key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm font-medium">Shoe Size (UK)</Label>
                          <Input value={formData.shoeSize} onChange={(e) => handleChange("shoeSize", e.target.value)} placeholder="e.g., 8" className="h-11 border-gray-300 focus:border-[#D71920]" />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm font-medium">Uniform Size</Label>
                          <Select value={formData.uniformSize} onValueChange={(v) => handleChange("uniformSize", v)}>
                            <SelectTrigger className="h-11"><SelectValue placeholder="Select size" /></SelectTrigger>
                            <SelectContent>
                              {["XS", "S", "M", "L", "XL", "XXL", "XXXL"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm font-medium">Fitness Level</Label>
                          <Select value={formData.fitnessLevel} onValueChange={(v) => handleChange("fitnessLevel", v)}>
                            <SelectTrigger className="h-11"><SelectValue placeholder="Select fitness level" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="excellent">Excellent</SelectItem>
                              <SelectItem value="good">Good</SelectItem>
                              <SelectItem value="average">Average</SelectItem>
                              <SelectItem value="below-average">Below Average</SelectItem>
                              <SelectItem value="poor">Poor</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        <div className="space-y-2">
                          <Label className="text-sm font-medium">Identification Marks</Label>
                          <Textarea value={formData.identificationMarks} onChange={(e) => handleChange("identificationMarks", e.target.value)} placeholder="e.g., Mole on left cheek, scar on right hand" rows={2} className="border-gray-300 focus:border-[#D71920]" />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm font-medium">Physical Disability (if any)</Label>
                          <Textarea value={formData.physicalDisability} onChange={(e) => handleChange("physicalDisability", e.target.value)} placeholder="Describe any physical disability" rows={2} className="border-gray-300 focus:border-[#D71920]" />
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="flex items-center gap-2 pb-2 border-b border-[#D71920]/20">
                        <Activity className="h-5 w-5 text-[#D71920]" />
                        <h3 className="font-semibold text-base">Medical Information</h3>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        <div className="space-y-2">
                          <Label className="text-sm font-medium">Eye Sight</Label>
                          <Select value={formData.eyeSight} onValueChange={(v) => handleChange("eyeSight", v)}>
                            <SelectTrigger className="h-11"><SelectValue placeholder="Select eye sight" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="normal">Normal (6/6)</SelectItem>
                              <SelectItem value="glasses">Uses Glasses</SelectItem>
                              <SelectItem value="contacts">Uses Contact Lenses</SelectItem>
                              <SelectItem value="weak">Weak Vision</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm font-medium">Hearing Ability</Label>
                          <Select value={formData.hearingAbility} onValueChange={(v) => handleChange("hearingAbility", v)}>
                            <SelectTrigger className="h-11"><SelectValue placeholder="Select hearing ability" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="normal">Normal</SelectItem>
                              <SelectItem value="mild-loss">Mild Hearing Loss</SelectItem>
                              <SelectItem value="hearing-aid">Uses Hearing Aid</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm font-medium">Known Medical Conditions</Label>
                          <Textarea value={formData.medicalConditions} onChange={(e) => handleChange("medicalConditions", e.target.value)} placeholder="e.g., Diabetes, Hypertension" rows={2} className="border-gray-300 focus:border-[#D71920]" />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm font-medium">Allergies</Label>
                          <Textarea value={formData.allergies} onChange={(e) => handleChange("allergies", e.target.value)} placeholder="e.g., Dust, Pollen, Peanuts" rows={2} className="border-gray-300 focus:border-[#D71920]" />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm font-medium">Chronic Diseases</Label>
                          <Textarea value={formData.chronicDiseases} onChange={(e) => handleChange("chronicDiseases", e.target.value)} placeholder="e.g., Heart disease" rows={2} className="border-gray-300 focus:border-[#D71920]" />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm font-medium">Current Medications</Label>
                          <Textarea value={formData.currentMedications} onChange={(e) => handleChange("currentMedications", e.target.value)} placeholder="List medications" rows={2} className="border-gray-300 focus:border-[#D71920]" />
                        </div>
                        <div className="space-y-2 md:col-span-2">
                          <Label className="text-sm font-medium">Past Surgeries / Major Treatments</Label>
                          <Textarea value={formData.pastSurgeries} onChange={(e) => handleChange("pastSurgeries", e.target.value)} placeholder="List past surgeries" rows={2} className="border-gray-300 focus:border-[#D71920]" />
                        </div>
                        <div className="flex items-center space-x-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                          <Checkbox id="colorBlindness" checked={formData.colorBlindness} onCheckedChange={(c) => handleChange("colorBlindness", c)} />
                          <Label htmlFor="colorBlindness" className="text-sm font-medium cursor-pointer">Color Blindness</Label>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="flex items-center gap-2 pb-2 border-b border-[#D71920]/20">
                        <AlertTriangle className="h-5 w-5 text-[#D71920]" />
                        <h3 className="font-semibold text-base">Habits & Lifestyle</h3>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg space-y-3">
                          <div className="flex items-center space-x-3">
                            <Checkbox id="smoking" checked={formData.smoking} onCheckedChange={(c) => handleChange("smoking", c)} />
                            <Label htmlFor="smoking" className="text-sm font-medium cursor-pointer flex items-center gap-2"><Cigarette className="h-4 w-4" /> Smoking</Label>
                          </div>
                          {formData.smoking && (
                            <Select value={formData.smokingFrequency} onValueChange={(v) => handleChange("smokingFrequency", v)}>
                              <SelectTrigger className="h-10"><SelectValue placeholder="Frequency" /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="occasional">Occasional</SelectItem>
                                <SelectItem value="light">Light (1-5/day)</SelectItem>
                                <SelectItem value="moderate">Moderate (5-10/day)</SelectItem>
                                <SelectItem value="heavy">Heavy (10+/day)</SelectItem>
                              </SelectContent>
                            </Select>
                          )}
                        </div>
                        <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg space-y-3">
                          <div className="flex items-center space-x-3">
                            <Checkbox id="alcohol" checked={formData.alcohol} onCheckedChange={(c) => handleChange("alcohol", c)} />
                            <Label htmlFor="alcohol" className="text-sm font-medium cursor-pointer">Alcohol Consumption</Label>
                          </div>
                          {formData.alcohol && (
                            <Select value={formData.alcoholFrequency} onValueChange={(v) => handleChange("alcoholFrequency", v)}>
                              <SelectTrigger className="h-10"><SelectValue placeholder="Frequency" /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="social">Social Drinker</SelectItem>
                                <SelectItem value="occasional">Occasional</SelectItem>
                                <SelectItem value="weekly">Weekly</SelectItem>
                                <SelectItem value="regular">Regular</SelectItem>
                              </SelectContent>
                            </Select>
                          )}
                        </div>
                        <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg space-y-3">
                          <div className="flex items-center space-x-3">
                            <Checkbox id="tobacco" checked={formData.tobacco} onCheckedChange={(c) => handleChange("tobacco", c)} />
                            <Label htmlFor="tobacco" className="text-sm font-medium cursor-pointer">Tobacco / Pan Masala</Label>
                          </div>
                          {formData.tobacco && (
                            <Select value={formData.tobaccoType} onValueChange={(v) => handleChange("tobaccoType", v)}>
                              <SelectTrigger className="h-10"><SelectValue placeholder="Type" /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="gutkha">Gutkha</SelectItem>
                                <SelectItem value="pan-masala">Pan Masala</SelectItem>
                                <SelectItem value="khaini">Khaini</SelectItem>
                                <SelectItem value="zarda">Zarda</SelectItem>
                              </SelectContent>
                            </Select>
                          )}
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm font-medium">Other Habits</Label>
                          <Textarea value={formData.otherHabits} onChange={(e) => handleChange("otherHabits", e.target.value)} placeholder="Any other habits" rows={3} className="border-gray-300 focus:border-[#D71920]" />
                        </div>
                      </div>
                    </div>
                  </TabsContent>


                  {/* Employment Tab */}
                  <TabsContent value="employment" className="space-y-4 mt-0">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Employee ID *</Label>
                        <Input value={formData.employeeId} onChange={(e) => handleChange("employeeId", e.target.value)} placeholder="e.g., EMP0001" className="h-11 border-gray-300 focus:border-[#D71920]" required disabled={!!employee} />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Date of Joining <span className="text-red-500">*</span></Label>
                        <Input type="date" value={formData.joinDate} onChange={(e) => handleChange("joinDate", e.target.value)} className="h-11 border-gray-300 focus:border-[#D71920]" />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Department <span className="text-red-500">*</span></Label>
                        <Select value={formData.department} onValueChange={(v) => handleChange("department", v)}>
                          <SelectTrigger className="h-11"><SelectValue placeholder="Select department" /></SelectTrigger>
                          <SelectContent>
                            {["Operations", "Admin", "HR", "Finance", "Sales", "IT"].map(d => <SelectItem key={d} value={d}>{d === "HR" ? "Human Resources" : d}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Designation <span className="text-red-500">*</span></Label>
                        <Select value={formData.designation} onValueChange={(v) => handleChange("designation", v)}>
                          <SelectTrigger className="h-11"><SelectValue placeholder="Select designation" /></SelectTrigger>
                          <SelectContent>
                            {[
                              "Unarmed Guards",
                              "Armed Guards",
                              "Supervisors",
                              "Patrol Officers",
                              "Event Security",
                              "Personal Security"
                            ].map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Employment Type</Label>
                        <Select value={formData.employmentType} onValueChange={(v) => handleChange("employmentType", v)}>
                          <SelectTrigger className="h-11"><SelectValue placeholder="Select type" /></SelectTrigger>
                          <SelectContent>
                            {["Full-Time", "Part-Time", "Contract", "Temporary", "Intern"].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Reporting Manager</Label>
                        <Input value={formData.reportingManager} onChange={(e) => handleChange("reportingManager", e.target.value)} placeholder="Enter manager name" className="h-11 border-gray-300 focus:border-[#D71920]" />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Work Location</Label>
                        <Input value={formData.workLocation} onChange={(e) => handleChange("workLocation", e.target.value)} placeholder="Enter work location" className="h-11 border-gray-300 focus:border-[#D71920]" />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Status</Label>
                        <Select value={formData.status} onValueChange={(v) => handleChange("status", v)}>
                          <SelectTrigger className="h-11"><SelectValue placeholder="Select status" /></SelectTrigger>
                          <SelectContent>
                            {["Active", "Inactive", "On Leave", "Terminated"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </TabsContent>

                  {/* Address Tab - Enhanced */}
                  <TabsContent value="address" className="space-y-6 mt-0">
                    {/* Current Address Section */}
                    <div className="space-y-4">
                      <div className="flex items-center gap-2 pb-2 border-b border-[#D71920]/20">
                        <Home className="h-5 w-5 text-[#D71920]" />
                        <h3 className="font-semibold text-base">Current Address</h3>
                      </div>
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label className="text-sm font-medium">Address Line <span className="text-red-500">*</span></Label>
                          <Textarea 
                            value={formData.currentAddress} 
                            onChange={(e) => {
                              handleChange("currentAddress", e.target.value);
                              if (sameAsCurrentAddress) handleChange("permanentAddress", e.target.value);
                            }} 
                            placeholder="House No., Street, Locality, Landmark" 
                            rows={2} 
                            className="border-gray-300 focus:border-[#D71920]" 
                          />
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div className="space-y-2">
                            <Label className="text-sm font-medium">Postal Code (PIN) <span className="text-red-500">*</span></Label>
                            <div className="relative">
                              <Input 
                                value={formData.currentPostalCode} 
                                onChange={(e) => {
                                  const val = e.target.value.replace(/\D/g, '').slice(0, 6);
                                  handleChange("currentPostalCode", val);
                                  if (sameAsCurrentAddress) handleChange("permanentPostalCode", val);
                                  if (val.length === 6) fetchLocationFromPincode(val, 'current');
                                }} 
                                placeholder="Enter 6-digit PIN" 
                                maxLength={6}
                                className="h-11 border-gray-300 focus:border-[#D71920]" 
                              />
                              {loadingCurrentPincode && <Loader2 className="absolute right-3 top-3 h-5 w-5 animate-spin text-[#D71920]" />}
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label className="text-sm font-medium">State <span className="text-red-500">*</span></Label>
                            <Select 
                              value={formData.currentState} 
                              onValueChange={(v) => {
                                handleChange("currentState", v);
                                handleChange("currentCity", "");
                                if (sameAsCurrentAddress) {
                                  handleChange("permanentState", v);
                                  handleChange("permanentCity", "");
                                }
                              }}
                            >
                              <SelectTrigger className="h-11"><SelectValue placeholder="Select state" /></SelectTrigger>
                              <SelectContent className="max-h-[300px]">
                                {INDIAN_STATES.map(state => <SelectItem key={state} value={state}>{state}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label className="text-sm font-medium">City / District <span className="text-red-500">*</span></Label>
                            <Input 
                              value={formData.currentCity} 
                              onChange={(e) => {
                                handleChange("currentCity", e.target.value);
                                if (sameAsCurrentAddress) handleChange("permanentCity", e.target.value);
                              }}
                              placeholder="Auto-filled from PIN or enter manually"
                              className="h-11 border-gray-300 focus:border-[#D71920]"
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Same as Current Address Checkbox */}
                    <div className="flex items-center space-x-3 p-4 bg-[#D71920]/5 border border-[#D71920]/20 rounded-lg">
                      <Checkbox 
                        id="sameAddress" 
                        checked={sameAsCurrentAddress} 
                        onCheckedChange={(checked) => handleSameAddressChange(checked as boolean)}
                      />
                      <Label htmlFor="sameAddress" className="text-sm font-medium cursor-pointer text-[#D71920]">
                        Permanent address is same as current address
                      </Label>
                    </div>

                    {/* Permanent Address Section */}
                    <div className="space-y-4">
                      <div className="flex items-center gap-2 pb-2 border-b border-[#D71920]/20">
                        <MapPin className="h-5 w-5 text-[#D71920]" />
                        <h3 className="font-semibold text-base">Permanent Address</h3>
                      </div>
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label className="text-sm font-medium">Address Line</Label>
                          <Textarea 
                            value={formData.permanentAddress} 
                            onChange={(e) => handleChange("permanentAddress", e.target.value)} 
                            placeholder="House No., Street, Locality, Landmark" 
                            rows={2} 
                            className="border-gray-300 focus:border-[#D71920]"
                            disabled={sameAsCurrentAddress}
                          />
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div className="space-y-2">
                            <Label className="text-sm font-medium">Postal Code (PIN)</Label>
                            <div className="relative">
                              <Input 
                                value={formData.permanentPostalCode} 
                                onChange={(e) => {
                                  const val = e.target.value.replace(/\D/g, '').slice(0, 6);
                                  handleChange("permanentPostalCode", val);
                                  if (val.length === 6) fetchLocationFromPincode(val, 'permanent');
                                }} 
                                placeholder="Enter 6-digit PIN" 
                                maxLength={6}
                                className="h-11 border-gray-300 focus:border-[#D71920]"
                                disabled={sameAsCurrentAddress}
                              />
                              {loadingPermanentPincode && <Loader2 className="absolute right-3 top-3 h-5 w-5 animate-spin text-[#D71920]" />}
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label className="text-sm font-medium">State</Label>
                            <Select 
                              value={formData.permanentState} 
                              onValueChange={(v) => {
                                handleChange("permanentState", v);
                                handleChange("permanentCity", "");
                              }}
                              disabled={sameAsCurrentAddress}
                            >
                              <SelectTrigger className="h-11"><SelectValue placeholder="Select state" /></SelectTrigger>
                              <SelectContent className="max-h-[300px]">
                                {INDIAN_STATES.map(state => <SelectItem key={state} value={state}>{state}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label className="text-sm font-medium">City / District</Label>
                            <Input 
                              value={formData.permanentCity} 
                              onChange={(e) => handleChange("permanentCity", e.target.value)}
                              placeholder="Auto-filled from PIN or enter manually"
                              className="h-11 border-gray-300 focus:border-[#D71920]"
                              disabled={sameAsCurrentAddress}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </TabsContent>


                  {/* Banking Tab */}
                  <TabsContent value="banking" className="space-y-4 mt-0">
                    <div className="space-y-4">
                      <div className="flex items-center gap-2 pb-2 border-b border-[#D71920]/20">
                        <CreditCard className="h-5 w-5 text-[#D71920]" />
                        <h3 className="font-semibold text-base">Bank Account Details</h3>
                      </div>
                      
                      {/* IFSC Code - First field for auto-fetch */}
                      <div className="p-4 bg-gray-100 dark:bg-gray-800/50 border border-gray-300 dark:border-gray-700 rounded-lg space-y-4">
                        <div className="space-y-2">
                          <Label className="text-sm font-medium">IFSC Code *</Label>
                          <p className="text-xs text-gray-500 dark:text-gray-400">Enter IFSC code to auto-fill bank details</p>
                          <div className="relative">
                            <Input 
                              value={formData.ifscCode} 
                              onChange={(e) => {
                                const val = e.target.value.toUpperCase().slice(0, 11);
                                handleChange("ifscCode", val);
                                if (val.length === 11) fetchBankFromIfsc(val);
                              }} 
                              placeholder="e.g., SBIN0001234" 
                              maxLength={11}
                              className="h-11 border-2 border-[#D71920] focus:border-[#D71920] font-mono uppercase bg-white dark:bg-gray-900" 
                            />
                            {loadingIfsc && <Loader2 className="absolute right-3 top-3 h-5 w-5 animate-spin text-[#D71920]" />}
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label className="text-sm font-medium">Bank Name</Label>
                            <Input 
                              value={formData.bankName} 
                              onChange={(e) => handleChange("bankName", e.target.value)} 
                              placeholder="Auto-filled from IFSC" 
                              className="h-11 border border-gray-300 dark:border-gray-600 focus:border-[#D71920] bg-white dark:bg-gray-900" 
                            />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-sm font-medium">Branch Name</Label>
                            <Input 
                              value={formData.branchName} 
                              onChange={(e) => handleChange("branchName", e.target.value)} 
                              placeholder="Auto-filled from IFSC" 
                              className="h-11 border border-gray-300 dark:border-gray-600 focus:border-[#D71920] bg-white dark:bg-gray-900" 
                            />
                          </div>
                        </div>
                        
                        <div className="space-y-2">
                          <Label className="text-sm font-medium">Branch Address</Label>
                          <Input 
                            value={formData.branchAddress} 
                            onChange={(e) => handleChange("branchAddress", e.target.value)} 
                            placeholder="Auto-filled from IFSC" 
                            className="h-11 border border-gray-300 dark:border-gray-600 focus:border-[#D71920] bg-white dark:bg-gray-900" 
                          />
                        </div>
                      </div>
                      
                      {/* Account Details */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        <div className="space-y-2">
                          <Label className="text-sm font-medium">Account Holder Name</Label>
                          <Input value={formData.accountName} onChange={(e) => handleChange("accountName", e.target.value)} placeholder="Enter account holder name" className="h-11 border border-gray-300 dark:border-gray-600 focus:border-[#D71920] bg-white dark:bg-gray-900" />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm font-medium">Account Number</Label>
                          <Input value={formData.accountNumber} onChange={(e) => handleChange("accountNumber", e.target.value.replace(/\D/g, ''))} placeholder="Enter account number" className="h-11 border border-gray-300 dark:border-gray-600 focus:border-[#D71920] bg-white dark:bg-gray-900" />
                        </div>
                      </div>
                    </div>
                  </TabsContent>

                  {/* Documents Tab */}
                  <TabsContent value="documents" className="space-y-6 mt-0">
                    {/* Passport Size Photo Section */}
                    <div className="space-y-4">
                      <div className="flex items-center gap-2 pb-2 border-b border-[#D71920]/20">
                        <Camera className="h-5 w-5 text-[#D71920]" />
                        <h3 className="font-semibold text-base">Passport Size Photo</h3>
                      </div>
                      <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                        <div className="flex flex-col md:flex-row gap-6 items-start">
                          {/* Photo Preview */}
                          <div className="flex flex-col items-center gap-3">
                            <div className="w-32 h-40 border-2 border-dashed border-[#D71920]/30 rounded-lg overflow-hidden bg-white dark:bg-gray-900 flex items-center justify-center">
                              {passportPhotoPreview ? (
                                <img 
                                  src={passportPhotoPreview} 
                                  alt="Passport Photo" 
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <div className="text-center p-2">
                                  <ImageIcon className="h-10 w-10 text-gray-300 mx-auto mb-2" />
                                  <p className="text-xs text-gray-400">No photo</p>
                                </div>
                              )}
                            </div>
                            {passportPhotoPreview && (
                              <Button 
                                type="button" 
                                variant="outline" 
                                size="sm"
                                onClick={removePassportPhoto}
                                className="text-red-600 hover:text-red-700 hover:bg-red-50"
                              >
                                <Trash2 className="h-4 w-4 mr-1" />
                                Remove
                              </Button>
                            )}
                          </div>
                          
                          {/* Upload Section */}
                          <div className="flex-1 space-y-4">
                            <div className="space-y-2">
                              <Label className="text-sm font-medium">Upload Photo *</Label>
                              <Input 
                                type="file" 
                                accept="image/jpeg,image/png,image/jpg"
                                onChange={handlePassportPhotoUpload}
                                className="h-11 text-sm file:mr-2 file:py-2 file:px-3 file:rounded file:border-0 file:text-sm file:bg-[#D71920] file:text-white hover:file:bg-[#b8151b]"
                              />
                            </div>
                            
                            {/* Instructions */}
                            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                              <div className="flex items-start gap-2">
                                <Info className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
                                <div className="text-xs text-blue-700 dark:text-blue-300 space-y-1">
                                  <p className="font-semibold">Photo Requirements:</p>
                                  <ul className="list-disc list-inside space-y-0.5 ml-1">
                                    <li>Passport size photo (35mm x 45mm recommended)</li>
                                    <li>Maximum file size: <span className="font-semibold">500 KB</span></li>
                                    <li>Accepted formats: JPG, JPEG, PNG</li>
                                    <li>White or light background preferred</li>
                                    <li>Face should be clearly visible, front-facing</li>
                                    <li>Recent photo (taken within last 6 months)</li>
                                  </ul>
                                </div>
                              </div>
                            </div>
                            
                            {formData.passportPhoto && (
                              <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                                <CheckCircle2 className="h-4 w-4" />
                                <span>{formData.passportPhoto}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Identity Documents Section */}
                    <div className="space-y-4">
                      <div className="flex items-center gap-2 pb-2 border-b border-[#D71920]/20">
                        <FileText className="h-5 w-5 text-[#D71920]" />
                        <h3 className="font-semibold text-base">Identity Documents</h3>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        <div className="space-y-3 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                          <Label className="text-sm font-medium">Aadhar Card</Label>
                          <Input 
                            value={formData.aadharNumber} 
                            onChange={(e) => handleChange("aadharNumber", e.target.value.replace(/\D/g, '').slice(0, 12))} 
                            placeholder="Enter 12-digit Aadhar number" 
                            maxLength={12}
                            className="h-11 border-gray-300 focus:border-[#D71920] bg-white dark:bg-gray-900" 
                          />
                          <div className="flex items-center gap-2">
                            <Input 
                              type="file" 
                              accept=".pdf,.jpg,.jpeg,.png"
                              onChange={(e) => handleChange("aadharFile", e.target.files?.[0]?.name || "")}
                              className="h-10 text-sm file:mr-2 file:py-1 file:px-3 file:rounded file:border-0 file:text-sm file:bg-[#D71920] file:text-white hover:file:bg-[#b8151b]"
                            />
                          </div>
                          {formData.aadharFile && (
                            <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                              <CheckCircle2 className="h-4 w-4" />
                              <span>{formData.aadharFile}</span>
                            </div>
                          )}
                        </div>
                        <div className="space-y-3 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                          <Label className="text-sm font-medium">PAN Card</Label>
                          <Input 
                            value={formData.panNumber} 
                            onChange={(e) => handleChange("panNumber", e.target.value.toUpperCase().slice(0, 10))} 
                            placeholder="Enter 10-character PAN" 
                            maxLength={10}
                            className="h-11 border-gray-300 focus:border-[#D71920] bg-white dark:bg-gray-900 uppercase" 
                          />
                          <div className="flex items-center gap-2">
                            <Input 
                              type="file" 
                              accept=".pdf,.jpg,.jpeg,.png"
                              onChange={(e) => handleChange("panFile", e.target.files?.[0]?.name || "")}
                              className="h-10 text-sm file:mr-2 file:py-1 file:px-3 file:rounded file:border-0 file:text-sm file:bg-[#D71920] file:text-white hover:file:bg-[#b8151b]"
                            />
                          </div>
                          {formData.panFile && (
                            <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                              <CheckCircle2 className="h-4 w-4" />
                              <span>{formData.panFile}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Address Proof Section */}
                    <div className="space-y-4">
                      <div className="flex items-center gap-2 pb-2 border-b border-[#D71920]/20">
                        <MapPin className="h-5 w-5 text-[#D71920]" />
                        <h3 className="font-semibold text-base">Address Proof</h3>
                      </div>
                      <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label className="text-sm font-medium">Document Type</Label>
                            <Select value={formData.addressProofType} onValueChange={(v) => handleChange("addressProofType", v)}>
                              <SelectTrigger className="h-11"><SelectValue placeholder="Select document type" /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="electricity-bill">Electricity Bill</SelectItem>
                                <SelectItem value="water-bill">Water Bill</SelectItem>
                                <SelectItem value="gas-bill">Gas Bill</SelectItem>
                                <SelectItem value="telephone-bill">Telephone Bill</SelectItem>
                                <SelectItem value="rent-agreement">Rent Agreement</SelectItem>
                                <SelectItem value="passport">Passport</SelectItem>
                                <SelectItem value="voter-id">Voter ID</SelectItem>
                                <SelectItem value="driving-license">Driving License</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label className="text-sm font-medium">Upload Document</Label>
                            <Input 
                              type="file" 
                              accept=".pdf,.jpg,.jpeg,.png"
                              onChange={(e) => handleChange("addressProofFile", e.target.files?.[0]?.name || "")}
                              className="h-11 text-sm file:mr-2 file:py-2 file:px-3 file:rounded file:border-0 file:text-sm file:bg-[#D71920] file:text-white hover:file:bg-[#b8151b]"
                            />
                          </div>
                        </div>
                        {formData.addressProofFile && (
                          <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                            <CheckCircle2 className="h-4 w-4" />
                            <span>{formData.addressProofType}: {formData.addressProofFile}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Banking Documents Section */}
                    <div className="space-y-4">
                      <div className="flex items-center gap-2 pb-2 border-b border-[#D71920]/20">
                        <CreditCard className="h-5 w-5 text-[#D71920]" />
                        <h3 className="font-semibold text-base">Banking Documents</h3>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        <div className="space-y-3 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                          <Label className="text-sm font-medium">Bank Passbook (First Page)</Label>
                          <Input 
                            type="file" 
                            accept=".pdf,.jpg,.jpeg,.png"
                            onChange={(e) => handleChange("bankPassbookFile", e.target.files?.[0]?.name || "")}
                            className="h-10 text-sm file:mr-2 file:py-1 file:px-3 file:rounded file:border-0 file:text-sm file:bg-[#D71920] file:text-white hover:file:bg-[#b8151b]"
                          />
                          {formData.bankPassbookFile && (
                            <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                              <CheckCircle2 className="h-4 w-4" />
                              <span>{formData.bankPassbookFile}</span>
                            </div>
                          )}
                        </div>
                        <div className="space-y-3 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                          <Label className="text-sm font-medium">Cancelled Cheque</Label>
                          <Input 
                            type="file" 
                            accept=".pdf,.jpg,.jpeg,.png"
                            onChange={(e) => handleChange("cancelledChequeFile", e.target.files?.[0]?.name || "")}
                            className="h-10 text-sm file:mr-2 file:py-1 file:px-3 file:rounded file:border-0 file:text-sm file:bg-[#D71920] file:text-white hover:file:bg-[#b8151b]"
                          />
                          {formData.cancelledChequeFile && (
                            <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                              <CheckCircle2 className="h-4 w-4" />
                              <span>{formData.cancelledChequeFile}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Employee Contract Section */}
                    <div className="space-y-4">
                      <div className="flex items-center gap-2 pb-2 border-b border-[#D71920]/20">
                        <Briefcase className="h-5 w-5 text-[#D71920]" />
                        <h3 className="font-semibold text-base">Employee Contract</h3>
                      </div>
                      <div className="p-4 bg-[#D71920]/5 border border-[#D71920]/20 rounded-lg space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label className="text-sm font-medium">Contract Start Date</Label>
                            <Input 
                              type="date" 
                              value={formData.contractStartDate} 
                              onChange={(e) => handleChange("contractStartDate", e.target.value)} 
                              className="h-11 border-gray-300 focus:border-[#D71920] bg-white dark:bg-gray-900" 
                            />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-sm font-medium">Contract End Date</Label>
                            <Input 
                              type="date" 
                              value={formData.contractEndDate} 
                              onChange={(e) => handleChange("contractEndDate", e.target.value)} 
                              className="h-11 border-gray-300 focus:border-[#D71920] bg-white dark:bg-gray-900" 
                            />
                          </div>
                          {/* Only show Monthly Salary for Full-Time and Part-Time employees */}
                          {!["Contract", "Temporary", "Intern"].includes(formData.employmentType) && (
                            <div className="space-y-2">
                              <Label className="text-sm font-medium">Monthly Salary (₹)</Label>
                              <Input 
                                value={formData.salary} 
                                onChange={(e) => handleChange("salary", e.target.value.replace(/\D/g, ''))} 
                                placeholder="Enter monthly salary" 
                                className="h-11 border-gray-300 focus:border-[#D71920] bg-white dark:bg-gray-900" 
                              />
                            </div>
                          )}
                          <div className="space-y-2">
                            <Label className="text-sm font-medium">Probation Period</Label>
                            <Select value={formData.probationPeriod} onValueChange={(v) => handleChange("probationPeriod", v)}>
                              <SelectTrigger className="h-11"><SelectValue placeholder="Select period" /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="0">No Probation</SelectItem>
                                <SelectItem value="1">1 Month</SelectItem>
                                <SelectItem value="2">2 Months</SelectItem>
                                <SelectItem value="3">3 Months</SelectItem>
                                <SelectItem value="6">6 Months</SelectItem>
                                <SelectItem value="12">12 Months</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div className="pt-4 border-t border-[#D71920]/20">
                          <Button 
                            type="button" 
                            className="bg-[#D71920] hover:bg-[#b8151b] text-white flex items-center gap-2"
                            onClick={() => {
                              generateEmployeeContractPdf({
                                name: formData.name,
                                email: formData.email,
                                phone: formData.phone,
                                gender: formData.gender,
                                dateOfBirth: formData.dateOfBirth,
                                fatherName: formData.fatherName,
                                employeeId: formData.employeeId,
                                department: formData.department,
                                designation: formData.designation,
                                joinDate: formData.joinDate,
                                employmentType: formData.employmentType,
                                workLocation: formData.workLocation,
                                currentAddress: formData.currentAddress,
                                currentCity: formData.currentCity,
                                currentState: formData.currentState,
                                currentPostalCode: formData.currentPostalCode,
                                permanentAddress: formData.permanentAddress,
                                permanentCity: formData.permanentCity,
                                permanentState: formData.permanentState,
                                permanentPostalCode: formData.permanentPostalCode,
                                accountName: formData.accountName,
                                accountNumber: formData.accountNumber,
                                bankName: formData.bankName,
                                branchName: formData.branchName,
                                ifscCode: formData.ifscCode,
                                contractStartDate: formData.contractStartDate,
                                contractEndDate: formData.contractEndDate,
                                salary: formData.salary,
                                probationPeriod: formData.probationPeriod,
                                aadharNumber: formData.aadharNumber,
                                panNumber: formData.panNumber,
                              });
                              toast({
                                title: "Contract Generated",
                                description: "Employee contract PDF is ready. Use Print > Save as PDF to download.",
                              });
                            }}
                          >
                            <Download className="h-4 w-4" />
                            Generate Employee Contract PDF
                          </Button>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                            Contract will be generated using the employee details filled in this form
                          </p>
                        </div>
                      </div>
                    </div>
                  </TabsContent>
                </div>
              </ScrollArea>
              
              <DialogFooter className="px-6 py-4 border-t border-[#D71920]/20 flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-2">
                <div className="text-xs text-gray-500 sm:text-left order-2 sm:order-1">
                  {isLastStep
                    ? "Review your details and submit to create the employee record."
                    : `Step ${currentStepIndex + 1} of ${steps.length} - ${steps[currentStepIndex]?.label}`}
                </div>
                <div className="flex items-center gap-2 order-1 sm:order-2 w-full sm:w-auto justify-end">
                  <Button
                    variant="outline"
                    type="button"
                    onClick={onClose}
                    className="border-gray-300 hover:bg-gray-100"
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="outline"
                    type="button"
                    onClick={goToPreviousStep}
                    disabled={isFirstStep}
                    className="border-gray-300 hover:bg-gray-100"
                  >
                    <ChevronLeft className="h-4 w-4 mr-1" />
                    Previous
                  </Button>
                  {isLastStep ? (
                    <Button type="submit" className="bg-[#D71920] hover:bg-[#b8151b] text-white">
                      <Check className="h-4 w-4 mr-1" />
                      {employee ? "Update Employee" : "Add Employee"}
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      onClick={goToNextStep}
                      className="bg-[#D71920] hover:bg-[#b8151b] text-white"
                    >
                      Next
                      <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  )}
                </div>
              </DialogFooter>
            </Tabs>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
