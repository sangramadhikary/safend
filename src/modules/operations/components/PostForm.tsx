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
  SelectValue, 
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

interface PostFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: any) => void;
  editData: any | null;
}

export function PostForm({ isOpen, onClose, onSubmit, editData }: PostFormProps) {
  const { toast } = useToast();
  
  // Form state
  const [formData, setFormData] = useState({
    id: editData?.id || generatePostId(),
    name: editData?.name || "",
    client: editData?.client || "",
    location: editData?.location || "",
    hoursRequired: editData?.hoursRequired || "",
    staffAssigned: editData?.staffAssigned || 0,
    status: editData?.status || "Active",
    type: editData?.type || "Client Site",
    startDate: editData?.startDate || getCurrentDate(),
    endDate: editData?.endDate || "",
    requirements: editData?.requirements || "",
    notes: editData?.notes || "",
  });
  
  // Generate post ID — FIX #6: Use full 4-digit random + timestamp suffix for uniqueness
  function generatePostId() {
    const randomNum = Math.floor(1000 + Math.random() * 9000);
    const timeSuffix = Date.now().toString(36).slice(-3).toUpperCase();
    return `P${randomNum}-${timeSuffix}`;
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
    setFormData(prev => ({ ...prev, [name]: value }));
  };
  
  // Handle numeric input changes
  const handleNumericChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: parseInt(value) || 0 }));
  };
  
  // Handle form submission
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate form
    if (!formData.name || !formData.location || !formData.hoursRequired) {
      toast({
        title: "Error",
        description: "Please fill in all required fields.",
        duration: 3000,
      });
      return;
    }

    // FIX #11: Validate endDate > startDate
    if (formData.endDate && formData.startDate && formData.endDate < formData.startDate) {
      toast({
        title: "Validation Error",
        description: "End date cannot be before start date.",
        variant: "destructive",
        duration: 3000,
      });
      return;
    }
    
    // Submit the form
    onSubmit(formData);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[525px]" preventOutsideClose={true}>
        <DialogHeader>
          <DialogTitle>{editData ? "Edit Security Post" : "Add New Security Post"}</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="id">Post ID</Label>
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
                name="status" 
                value={formData.status} 
                onValueChange={(value) => handleSelectChange(value, "status")}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Active">Active</SelectItem>
                  <SelectItem value="Inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="name">Post Name *</Label>
            <Input 
              id="name" 
              name="name" 
              value={formData.name} 
              onChange={handleChange} 
              placeholder="Enter post name" 
              required 
            />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="client">Client</Label>
              <Input 
                id="client" 
                name="client" 
                value={formData.client} 
                onChange={handleChange} 
                placeholder="Enter client name" 
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="type">Post Type</Label>
              <Select 
                name="type" 
                value={formData.type} 
                onValueChange={(value) => handleSelectChange(value, "type")}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Client Site">Client Site</SelectItem>
                  <SelectItem value="Internal">Internal</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="location">Location *</Label>
            <Input 
              id="location" 
              name="location" 
              value={formData.location} 
              onChange={handleChange} 
              placeholder="Enter post location" 
              required 
            />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="hoursRequired">Hours Required *</Label>
              <Input 
                id="hoursRequired" 
                name="hoursRequired" 
                value={formData.hoursRequired} 
                onChange={handleChange} 
                placeholder="e.g. 24/7 or 9-5 Mon-Fri" 
                required 
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="staffAssigned">Staff Assigned</Label>
              <Input 
                id="staffAssigned" 
                name="staffAssigned" 
                type="number"
                min="0"
                value={formData.staffAssigned} 
                onChange={handleNumericChange} 
              />
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="startDate">Start Date</Label>
              <Input 
                id="startDate" 
                name="startDate" 
                type="date"
                value={formData.startDate} 
                onChange={handleChange} 
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="endDate">End Date</Label>
              <Input 
                id="endDate" 
                name="endDate" 
                type="date"
                value={formData.endDate} 
                onChange={handleChange} 
              />
            </div>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="requirements">Requirements</Label>
            <Textarea 
              id="requirements" 
              name="requirements" 
              value={formData.requirements} 
              onChange={handleChange} 
              placeholder="Enter security requirements" 
              rows={3} 
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="notes">Additional Notes</Label>
            <Textarea 
              id="notes" 
              name="notes" 
              value={formData.notes} 
              onChange={handleChange} 
              placeholder="Enter any additional notes" 
              rows={3} 
            />
          </div>
          
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" className="bg-safend-red hover:bg-safend-red/90">
              {editData ? "Update Post" : "Create Post"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
