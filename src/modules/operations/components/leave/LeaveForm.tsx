'use client';

import { useState, useEffect, useRef } from "react";
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
import { Badge } from "@/components/ui/badge";
import { Calendar, Upload, X, AlertTriangle, Info, Search } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface LeaveFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: LeaveFormData) => void;
  editData: LeaveFormData | null;
}

export interface LeaveFormData {
  id: string;
  staffName: string;
  employeeId?: string;
  type: "Planned Leave" | "Sick Leave" | "Abscond";
  subType: "Paid" | "Unpaid";
  fromDate: string;
  toDate: string;
  days: number;
  reason: string;
  status: "Pending" | "Approved" | "Rejected";
  requestDate: string;
  approvedBy: string;
  approvedDate: string;
  notes: string;
  leaveBalance: number;
  attachmentUrl: string | null;
  attachmentName: string | null;
}

export function LeaveForm({ isOpen, onClose, onSubmit, editData }: LeaveFormProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  
  const [formData, setFormData] = useState<LeaveFormData>({
    id: editData?.id || generateLeaveId(),
    staffName: editData?.staffName || "",
    type: editData?.type || "Planned Leave",
    subType: editData?.subType || "Paid",
    fromDate: editData?.fromDate || "",
    toDate: editData?.toDate || "",
    days: editData?.days || 1,
    reason: editData?.reason || "",
    status: editData?.status || "Pending",
    requestDate: editData?.requestDate || getCurrentDate(),
    approvedBy: editData?.approvedBy || "",
    approvedDate: editData?.approvedDate || "",
    notes: editData?.notes || "",
    leaveBalance: editData?.leaveBalance || 0,
    attachmentUrl: editData?.attachmentUrl || null,
    attachmentName: editData?.attachmentName || null,
  });
  
  // Staff search state
  const [staffSearch, setStaffSearch] = useState("");
  const [staffMembers, setStaffMembers] = useState<{ name: string; leaveBalance: number; id: string; employeeId: string }[]>([]);
  const [filteredStaff, setFilteredStaff] = useState<{ name: string; leaveBalance: number; id: string; employeeId: string }[]>([]);
  const [showStaffDropdown, setShowStaffDropdown] = useState(false);
  const [loadingStaff, setLoadingStaff] = useState(false);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>("");
  const staffDropdownRef = useRef<HTMLDivElement>(null);

  // Fetch staff members from Supabase
  useEffect(() => {
    const fetchStaff = async () => {
      setLoadingStaff(true);
      try {
        const { data, error } = await supabase
          .from('employees')
          .select('id, employee_id, name, status')
          .eq('status', 'active')
          .order('name');

        if (error) throw error;

        const members = (data || []).map((s: any) => ({
          id: s.id,
          employeeId: s.employee_id || '',
          name: s.name || 'Unknown',
          leaveBalance: 0,
        }));
        setStaffMembers(members);
        setFilteredStaff(members);
      } catch (err) {
        console.error('Error fetching staff:', err);
        setStaffMembers([]);
        setFilteredStaff([]);
      } finally {
        setLoadingStaff(false);
      }
    };

    if (isOpen) fetchStaff();
  }, [isOpen]);

  // Filter staff based on search
  useEffect(() => {
    if (!staffSearch.trim()) {
      setFilteredStaff(staffMembers);
    } else {
      const query = staffSearch.toLowerCase();
      setFilteredStaff(staffMembers.filter(s => s.name.toLowerCase().includes(query)));
    }
  }, [staffSearch, staffMembers]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (staffDropdownRef.current && !staffDropdownRef.current.contains(e.target as Node)) {
        setShowStaffDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Update sub-type based on leave type and balance
  useEffect(() => {
    if (formData.type === "Sick Leave") {
      // Sick leave is always unpaid
      setFormData(prev => ({ ...prev, subType: "Unpaid" }));
    } else if (formData.type === "Planned Leave") {
      // Planned leave: paid if balance > 0, unpaid if no balance
      const staff = staffMembers.find(s => s.name === formData.staffName);
      if (staff && staff.leaveBalance > 0) {
        setFormData(prev => ({ ...prev, subType: "Paid", leaveBalance: staff.leaveBalance }));
      } else {
        setFormData(prev => ({ ...prev, subType: "Unpaid", leaveBalance: 0 }));
      }
    }
  }, [formData.type, formData.staffName]);

  function generateLeaveId() {
    return `LR${Math.floor(1000 + Math.random() * 9000)}`;
  }
  
  function getCurrentDate() {
    const now = new Date();
    return now.toISOString().split('T')[0];
  }

  function getMinFromDate() {
    if (formData.type === "Planned Leave") {
      // Planned leave must be at least 3 days in advance
      const minDate = new Date();
      minDate.setDate(minDate.getDate() + 3);
      return minDate.toISOString().split('T')[0];
    }
    if (formData.type === "Sick Leave") {
      // Sick leave must be at least 1 day in advance
      const minDate = new Date();
      minDate.setDate(minDate.getDate() + 1);
      return minDate.toISOString().split('T')[0];
    }
    return getCurrentDate();
  }
  
  // Calculate days between dates
  const calculateDays = (fromDate: string, toDate: string) => {
    if (!fromDate || !toDate) return 0;
    const from = new Date(fromDate);
    const to = new Date(toDate);
    const diffTime = to.getTime() - from.getTime();
    if (diffTime < 0) return 0;
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
  };
  
  // Handle input changes
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => {
      const updated = { ...prev, [name]: value };
      // Recalculate days if dates change
      if (name === "fromDate" || name === "toDate") {
        updated.days = calculateDays(
          name === "fromDate" ? value : prev.fromDate,
          name === "toDate" ? value : prev.toDate
        );
      }
      return updated;
    });
  };
  
  // Handle select changes
  const handleSelectChange = (name: string, value: string) => {
    setFormData(prev => {
      const updated = { ...prev, [name]: value };
      // Reset dates when type changes
      if (name === "type") {
        updated.fromDate = "";
        updated.toDate = "";
        updated.days = 0;
      }
      // Update leave balance when staff changes
      if (name === "staffName") {
        const staff = staffMembers.find(s => s.name === value);
        updated.leaveBalance = staff?.leaveBalance || 0;
      }
      return updated;
    });
  };

  // Handle file upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type (images and PDFs for handwritten applications)
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (!allowedTypes.includes(file.type)) {
      toast({
        title: "Invalid File Type",
        description: "Please upload an image (JPG, PNG, WebP) or PDF file.",
        variant: "destructive",
        duration: 3000,
      });
      return;
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: "File Too Large",
        description: "Maximum file size is 10MB.",
        variant: "destructive",
        duration: 3000,
      });
      return;
    }

    setIsUploading(true);

    try {
      const formDataUpload = new FormData();
      formDataUpload.append('file', file);
      formDataUpload.append('folder', 'leave-applications');

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formDataUpload,
      });

      if (response.ok) {
        const data = await response.json();
        setFormData(prev => ({
          ...prev,
          attachmentUrl: data.url,
          attachmentName: file.name,
        }));
        toast({
          title: "File Uploaded",
          description: "Leave application document uploaded successfully.",
          duration: 3000,
        });
      } else {
        throw new Error('Upload failed');
      }
    } catch (error) {
      // Store locally as fallback
      const reader = new FileReader();
      reader.onload = () => {
        setFormData(prev => ({
          ...prev,
          attachmentUrl: reader.result as string,
          attachmentName: file.name,
        }));
      };
      reader.readAsDataURL(file);
      toast({
        title: "File Attached",
        description: "Document attached locally. Will be uploaded when submitted.",
        duration: 3000,
      });
    } finally {
      setIsUploading(false);
    }
  };

  const removeAttachment = () => {
    setFormData(prev => ({
      ...prev,
      attachmentUrl: null,
      attachmentName: null,
    }));
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };
  
  // Handle form submission
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Form validation
    if (!formData.staffName || !selectedEmployeeId) {
      toast({
        title: "Validation Error",
        description: "Please select a staff member from the list.",
        variant: "destructive",
        duration: 3000,
      });
      return;
    }

    if (formData.type !== "Abscond" && (!formData.fromDate || !formData.toDate)) {
      toast({
        title: "Validation Error",
        description: "Please select from and to dates.",
        variant: "destructive",
        duration: 3000,
      });
      return;
    }

    if (!formData.reason) {
      toast({
        title: "Validation Error",
        description: "Please provide a reason.",
        variant: "destructive",
        duration: 3000,
      });
      return;
    }

    // Validate planned leave is at least 3 days in advance
    if (formData.type === "Planned Leave") {
      const fromDate = new Date(formData.fromDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const minDate = new Date(today);
      minDate.setDate(minDate.getDate() + 3);
      
      if (fromDate < minDate) {
        toast({
          title: "Date Error",
          description: "Planned leave must be applied at least 3 days in advance.",
          variant: "destructive",
          duration: 3000,
        });
        return;
      }
    }
    
    // Check if from date is after to date
    if (formData.type !== "Abscond") {
      const fromDate = new Date(formData.fromDate);
      const toDate = new Date(formData.toDate);
      if (fromDate > toDate) {
        toast({
          title: "Date Error",
          description: "From date cannot be after to date.",
          variant: "destructive",
          duration: 3000,
        });
        return;
      }
    }
    
    onSubmit({ ...formData, employeeId: selectedEmployeeId });
  };

  // Get info text based on leave type
  const getLeaveTypeInfo = () => {
    switch (formData.type) {
      case "Planned Leave":
        return formData.leaveBalance > 0
          ? `Paid leave. Balance: ${formData.leaveBalance} days. Must apply 3+ days in advance.`
          : "No leave balance. This will be Unpaid Leave. Must apply 3+ days in advance.";
      case "Sick Leave":
        return "Sick leave is always Unpaid. Must apply at least 1 day in advance.";
      case "Abscond":
        return "Employee absent 24+ hours without intimation. Will result in show-cause notice and possible termination without salary.";
      default:
        return "";
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto" preventOutsideClose={true}>
        <DialogHeader>
          <DialogTitle>{editData ? "Edit Leave Request" : "New Leave Request"}</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          {/* Staff Member Selection with Search */}
          <div className="space-y-2">
            <Label htmlFor="staffName">Staff Member*</Label>
            <div className="relative" ref={staffDropdownRef}>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search staff member..."
                  value={formData.staffName || staffSearch}
                  onChange={(e) => {
                    setStaffSearch(e.target.value);
                    setShowStaffDropdown(true);
                    if (formData.staffName) {
                      setFormData(prev => ({ ...prev, staffName: "", leaveBalance: 0 }));
                      setSelectedEmployeeId("");
                    }
                  }}
                  onFocus={() => setShowStaffDropdown(true)}
                  className="pl-9"
                />
              </div>
              {showStaffDropdown && (
                <div className="absolute z-50 w-full mt-1 bg-background border rounded-md shadow-lg max-h-48 overflow-y-auto">
                  {loadingStaff ? (
                    <div className="p-3 text-sm text-muted-foreground text-center">Loading staff...</div>
                  ) : filteredStaff.length === 0 ? (
                    <div className="p-3 text-sm text-muted-foreground text-center">No staff found</div>
                  ) : (
                    filteredStaff.map((staff) => (
                      <div
                        key={staff.id}
                        className="px-3 py-2 cursor-pointer hover:bg-accent text-sm flex justify-between items-center"
                        onClick={() => {
                          setFormData(prev => ({
                            ...prev,
                            staffName: staff.name,
                            leaveBalance: staff.leaveBalance,
                          }));
                          setSelectedEmployeeId(staff.employeeId);
                          setStaffSearch("");
                          setShowStaffDropdown(false);
                        }}
                      >
                        <span>{staff.name}</span>
                        <Badge variant="outline" className="text-xs">
                          {staff.leaveBalance} days
                        </Badge>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
          
          {/* Leave Type Selection */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="type">Leave Type*</Label>
              <Select 
                value={formData.type} 
                onValueChange={(value) => handleSelectChange("type", value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select leave type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Planned Leave">Planned Leave</SelectItem>
                  <SelectItem value="Sick Leave">Sick Leave</SelectItem>
                  <SelectItem value="Abscond">Abscond</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label>Category</Label>
              <div className="flex items-center h-10 px-3 rounded-md border bg-muted/50">
                {formData.type === "Abscond" ? (
                  <Badge variant="destructive">Abscond - No Salary</Badge>
                ) : formData.subType === "Paid" ? (
                  <Badge className="bg-green-500 hover:bg-green-600">Paid Leave</Badge>
                ) : (
                  <Badge variant="outline" className="border-amber-500 text-amber-700">Unpaid Leave</Badge>
                )}
              </div>
            </div>
          </div>

          {/* Info Banner */}
          <div className={`flex items-start gap-2 p-3 rounded-md text-sm ${
            formData.type === "Abscond" 
              ? "bg-red-50 text-red-800 border border-red-200" 
              : "bg-blue-50 text-blue-800 border border-blue-200"
          }`}>
            {formData.type === "Abscond" ? (
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            ) : (
              <Info className="h-4 w-4 mt-0.5 shrink-0" />
            )}
            <span>{getLeaveTypeInfo()}</span>
          </div>

          {/* Leave Balance (for Planned Leave) */}
          {formData.type === "Planned Leave" && formData.staffName && (
            <div className="space-y-2">
              <Label>Leave Balance</Label>
              <Input 
                value={`${formData.leaveBalance} days remaining`}
                readOnly
                className="bg-gray-50"
              />
            </div>
          )}
          
          {/* Date Selection (not for Abscond) */}
          {formData.type !== "Abscond" && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="fromDate">From Date*</Label>
                <div className="relative">
                  <Calendar className="absolute left-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input 
                    id="fromDate" 
                    name="fromDate" 
                    type="date" 
                    value={formData.fromDate} 
                    onChange={handleChange} 
                    min={getMinFromDate()}
                    className="pl-8"
                    required 
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="toDate">To Date*</Label>
                <div className="relative">
                  <Calendar className="absolute left-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input 
                    id="toDate" 
                    name="toDate" 
                    type="date" 
                    value={formData.toDate} 
                    onChange={handleChange} 
                    min={formData.fromDate || getMinFromDate()}
                    className="pl-8"
                    required 
                  />
                </div>
              </div>
            </div>
          )}

          {/* Number of Days */}
          {formData.type !== "Abscond" && formData.days > 0 && (
            <div className="space-y-2">
              <Label>Number of Days</Label>
              <Input 
                value={formData.days}
                readOnly
                className="bg-gray-50"
              />
            </div>
          )}

          {/* Abscond specific: Last seen date */}
          {formData.type === "Abscond" && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="fromDate">Last Present Date*</Label>
                <div className="relative">
                  <Calendar className="absolute left-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input 
                    id="fromDate" 
                    name="fromDate" 
                    type="date" 
                    value={formData.fromDate} 
                    onChange={handleChange} 
                    max={getCurrentDate()}
                    className="pl-8"
                    required 
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Days Absent</Label>
                <Input 
                  value={formData.fromDate ? calculateDays(formData.fromDate, getCurrentDate()) - 1 + " days" : "—"}
                  readOnly
                  className="bg-gray-50"
                />
              </div>
            </div>
          )}
          
          {/* Reason */}
          <div className="space-y-2">
            <Label htmlFor="reason">Reason*</Label>
            <Textarea 
              id="reason" 
              name="reason"
              value={formData.reason}
              onChange={handleChange}
              placeholder={
                formData.type === "Abscond" 
                  ? "Describe the situation - employee absent without intimation..."
                  : "Please provide a reason for the leave request"
              }
              rows={3}
              required
            />
          </div>

          {/* File Upload - Handwritten Leave Application (Optional) */}
          <div className="space-y-2">
            <Label>
              Handwritten Leave Application 
              <span className="text-muted-foreground text-xs ml-1">(Optional - Upload photo/scan)</span>
            </Label>
            
            {formData.attachmentUrl ? (
              <div className="flex items-center gap-2 p-3 border rounded-md bg-green-50">
                <Upload className="h-4 w-4 text-green-600" />
                <span className="text-sm text-green-800 flex-1 truncate">
                  {formData.attachmentName}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={removeAttachment}
                  className="h-6 w-6 p-0"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div 
                className="border-2 border-dashed rounded-md p-4 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  {isUploading ? "Uploading..." : "Click to upload handwritten application (JPG, PNG, PDF)"}
                </p>
              </div>
            )}
            
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              onChange={handleFileUpload}
              className="hidden"
            />
          </div>
          
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isUploading}>
              {editData ? "Update Request" : "Submit Request"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
