'use client';

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
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
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

interface AttendanceFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: any) => void;
  editData: any | null;
}

export function AttendanceForm({ isOpen, onClose, onSubmit, editData }: AttendanceFormProps) {
  const { toast } = useToast();
  
  // Initialize form data with edit data or defaults
  const [formData, setFormData] = useState({
    id: editData?.id || generateId(),
    employeeId: editData?.employeeId || "",
    employeeName: editData?.employeeName || "",
    postId: editData?.postId || "",
    postName: editData?.postName || "",
    date: editData?.date || getCurrentDate(),
    shift: editData?.shift || "Morning",
    role: editData?.role || "Security Guard",
    status: editData?.status || "Present",
    checkInTime: editData?.checkInTime || "",
    checkOutTime: editData?.checkOutTime || "",
    remarks: editData?.remarks || "",
    replacementId: editData?.replacementId || "",
    replacementName: editData?.replacementName || "",
  });
  
  // Generate a new ID
  function generateId() {
    return `ATT${Math.floor(1000 + Math.random() * 9000)}`;
  }
  
  // Get current date in YYYY-MM-DD format
  function getCurrentDate() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  
  // Handle input changes
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };
  
  // Handle select changes
  const handleSelectChange = (name: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    
    // Special handling for status changes
    if (name === "status") {
      if (value === "Absent") {
        setFormData(prev => ({
          ...prev,
          checkInTime: "",
          checkOutTime: ""
        }));
      }
      
      // Show replacement options for absent employees
      if (value === "Absent" && !formData.replacementId) {
        toast({
          title: "Action Needed",
          description: "Please select a replacement for the absent employee.",
          duration: 5000,
        });
      }
    }
  };
  
  // Handle form submission
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Form validation
    if (!formData.employeeName || !formData.postName || !formData.date || !formData.shift) {
      toast({
        title: "Validation Error",
        description: "Please fill in all required fields.",
        variant: "destructive",
        duration: 3000,
      });
      return;
    }
    
    // If absent and no replacement, show warning
    if (formData.status === "Absent" && !formData.replacementId && !formData.replacementName) {
      toast({
        title: "Warning",
        description: "No replacement selected for absent employee.",
        duration: 5000,
      });
    }
    
    // Submit the form
    onSubmit(formData);
  };

  // Employees loaded from database (empty until real data exists)
  const employees: { id: string; name: string }[] = [];

  // Posts loaded from database (empty until real data exists)
  const posts: { id: string; name: string }[] = [];

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[550px]" preventOutsideClose={true}>
        <DialogHeader>
          <DialogTitle>
            {editData ? "Edit Attendance Record" : "Mark Attendance"}
          </DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="date">Date*</Label>
              <Input 
                id="date" 
                name="date" 
                type="date" 
                value={formData.date} 
                onChange={handleChange} 
                required 
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="shift">Shift*</Label>
              <Select 
                name="shift" 
                value={formData.shift} 
                onValueChange={(value) => handleSelectChange("shift", value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select shift" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Morning">Morning</SelectItem>
                  <SelectItem value="Evening">Evening</SelectItem>
                  <SelectItem value="Night">Night</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="employeeName">Employee*</Label>
              <Select 
                name="employeeName" 
                value={formData.employeeName} 
                onValueChange={(value) => {
                  const selected = employees.find(e => e.name === value);
                  if (selected) {
                    handleSelectChange("employeeName", selected.name);
                    handleSelectChange("employeeId", selected.id);
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select employee" />
                </SelectTrigger>
                <SelectContent>
                  {employees.map((emp) => (
                    <SelectItem key={emp.id} value={emp.name}>
                      {emp.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="role">Role*</Label>
              <Select 
                name="role" 
                value={formData.role} 
                onValueChange={(value) => handleSelectChange("role", value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Security Guard">Security Guard</SelectItem>
                  <SelectItem value="Supervisor">Supervisor</SelectItem>
                  <SelectItem value="Manager">Manager</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="postName">Post*</Label>
              <Select 
                name="postName" 
                value={formData.postName} 
                onValueChange={(value) => {
                  const selected = posts.find(p => p.name === value);
                  if (selected) {
                    handleSelectChange("postName", selected.name);
                    handleSelectChange("postId", selected.id);
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select post" />
                </SelectTrigger>
                <SelectContent>
                  {posts.map((post) => (
                    <SelectItem key={post.id} value={post.name}>
                      {post.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="status">Status*</Label>
              <Select 
                name="status" 
                value={formData.status} 
                onValueChange={(value) => handleSelectChange("status", value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Present">Present</SelectItem>
                  <SelectItem value="Late">Late</SelectItem>
                  <SelectItem value="Half Day">Half Day</SelectItem>
                  <SelectItem value="Absent">Absent</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          {formData.status !== "Absent" && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="checkInTime">Check-in Time</Label>
                <Input 
                  id="checkInTime" 
                  name="checkInTime" 
                  type="time" 
                  value={formData.checkInTime} 
                  onChange={handleChange} 
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="checkOutTime">Check-out Time</Label>
                <Input 
                  id="checkOutTime" 
                  name="checkOutTime" 
                  type="time" 
                  value={formData.checkOutTime} 
                  onChange={handleChange} 
                />
              </div>
            </div>
          )}
          
          {formData.status === "Absent" && (
            <div className="space-y-2">
              <Label htmlFor="replacementName">Replacement</Label>
              <Select 
                name="replacementName" 
                value={formData.replacementName} 
                onValueChange={(value) => {
                  const selected = employees.find(e => e.name === value);
                  if (selected) {
                    handleSelectChange("replacementName", selected.name);
                    handleSelectChange("replacementId", selected.id);
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select replacement" />
                </SelectTrigger>
                <SelectContent>
                  {employees
                    .filter((emp) => emp.id !== formData.employeeId)
                    .map((emp) => (
                      <SelectItem key={emp.id} value={emp.name}>
                        {emp.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          )}
          
          <div className="space-y-2">
            <Label htmlFor="remarks">Remarks</Label>
            <Textarea 
              id="remarks" 
              name="remarks" 
              value={formData.remarks} 
              onChange={handleChange} 
              placeholder="Enter any additional notes or remarks" 
              rows={3} 
            />
          </div>
          
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">
              {editData ? "Update Record" : "Save Record"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
