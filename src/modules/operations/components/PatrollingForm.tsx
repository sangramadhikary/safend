'use client';

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

interface PatrollingFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: any) => void;
  editData: any | null;
}

export function PatrollingForm({ isOpen, onClose, onSubmit, editData }: PatrollingFormProps) {
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    id: "",
    staffName: "",
    post: "",
    date: "",
    startTime: "",
    endTime: "",
    checkpoints: "0/5",
    status: "In Progress",
    issues: "None",
    completedCheckpoints: [false, false, false, false, false],
  });
  
  // Populate form if editing an existing record
  useEffect(() => {
    if (editData) {
      const checkpointsParts = editData.checkpoints ? editData.checkpoints.split('/') : ["0", "5"];
      const completed = parseInt(checkpointsParts[0]);
      const total = parseInt(checkpointsParts[1]);
      
      const completedCheckpoints = Array(total).fill(false).map((_, i) => i < completed);
      
      setFormData({
        id: editData.id || "",
        staffName: editData.staffName || "",
        post: editData.post || "",
        date: editData.date || new Date().toISOString().split('T')[0],
        startTime: editData.startTime || "",
        endTime: editData.endTime || "",
        checkpoints: editData.checkpoints || "0/5",
        status: editData.status || "In Progress",
        issues: editData.issues || "None",
        completedCheckpoints,
      });
    } else {
      // Reset form for new record
      setFormData({
        id: `PAT${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`,
        staffName: "",
        post: "",
        date: new Date().toISOString().split('T')[0],
        startTime: "",
        endTime: "",
        checkpoints: "0/5",
        status: "In Progress",
        issues: "None",
        completedCheckpoints: [false, false, false, false, false],
      });
    }
  }, [editData]);
  
  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };
  
  const handleCheckpointChange = (index: number, checked: boolean) => {
    const newCompletedCheckpoints = [...formData.completedCheckpoints];
    newCompletedCheckpoints[index] = checked;
    
    const completedCount = newCompletedCheckpoints.filter(cp => cp).length;
    const totalCount = newCompletedCheckpoints.length;
    
    setFormData(prev => ({
      ...prev,
      completedCheckpoints: newCompletedCheckpoints,
      checkpoints: `${completedCount}/${totalCount}`
    }));
    
    // Update status based on completion
    if (completedCount === totalCount && formData.issues === "None") {
      setFormData(prev => ({
        ...prev,
        status: "Completed"
      }));
    } else if (formData.issues !== "None") {
      setFormData(prev => ({
        ...prev,
        status: "Issues Reported"
      }));
    } else if (completedCount < totalCount) {
      setFormData(prev => ({
        ...prev,
        status: "In Progress"
      }));
    }
  };
  
  const handleIssuesChange = (value: string) => {
    setFormData(prev => ({
      ...prev,
      issues: value
    }));
    
    // Update status based on issues reported
    if (value !== "None") {
      setFormData(prev => ({
        ...prev,
        status: "Issues Reported"
      }));
    } else {
      const completedCount = formData.completedCheckpoints.filter(cp => cp).length;
      const totalCount = formData.completedCheckpoints.length;
      
      if (completedCount === totalCount) {
        setFormData(prev => ({
          ...prev,
          status: "Completed"
        }));
      } else if (completedCount < totalCount) {
        setFormData(prev => ({
          ...prev,
          status: "In Progress"
        }));
      }
    }
  };
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate form
    if (!formData.staffName || !formData.post || !formData.date || !formData.startTime) {
      toast({
        title: "Validation Error",
        description: "Please fill all required fields",
        variant: "destructive",
      });
      return;
    }
    
    // Submit form data
    onSubmit(formData);
  };

  // Staff members will be loaded from the database
  const staffMembers: string[] = [];
  
  // Posts will be loaded from the database
  const posts: string[] = [];
  
  const checkpointLabels = [
    "Main Entrance", "Rear Exit", "Parking Area", 
    "Service Area", "Roof Access"
  ];
  
  const statusOptions = [
    "In Progress", "Completed", "Issues Reported", "Missed Checkpoints"
  ];

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]" preventOutsideClose={true}>
        <DialogHeader>
          <DialogTitle>{editData ? "Edit Patrol Log" : "New Patrol Log"}</DialogTitle>
          <DialogDescription>
            {editData ? "Update the patrol details below." : "Record a new security patrol and checkpoint verification."}
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          {editData && (
            <div className="space-y-2">
              <Label htmlFor="id">Patrol ID</Label>
              <Input 
                id="id" 
                value={formData.id} 
                disabled 
              />
            </div>
          )}
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="staffName">Security Officer*</Label>
              <Select 
                value={formData.staffName} 
                onValueChange={(value) => handleChange("staffName", value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select Officer" />
                </SelectTrigger>
                <SelectContent>
                  {staffMembers.map(staff => (
                    <SelectItem key={staff} value={staff}>{staff}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="post">Post Location*</Label>
              <Select 
                value={formData.post} 
                onValueChange={(value) => handleChange("post", value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select Post" />
                </SelectTrigger>
                <SelectContent>
                  {posts.map(post => (
                    <SelectItem key={post} value={post}>{post}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="date">Date*</Label>
              <Input 
                id="date" 
                type="date" 
                value={formData.date} 
                onChange={(e) => handleChange("date", e.target.value)}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="startTime">Start Time*</Label>
              <Input 
                id="startTime" 
                type="time" 
                value={formData.startTime} 
                onChange={(e) => handleChange("startTime", e.target.value)}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="endTime">End Time</Label>
              <Input 
                id="endTime" 
                type="time" 
                value={formData.endTime} 
                onChange={(e) => handleChange("endTime", e.target.value)}
              />
            </div>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="checkpoints">Checkpoints</Label>
            <div className="grid grid-cols-1 gap-2">
              {checkpointLabels.map((label, index) => (
                <div key={index} className="flex items-center space-x-2">
                  <Checkbox 
                    id={`checkbox-${index}`} 
                    checked={formData.completedCheckpoints[index]}
                    onCheckedChange={(checked) => handleCheckpointChange(index, checked === true)}
                  />
                  <label
                    htmlFor={`checkbox-${index}`}
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    {label}
                  </label>
                </div>
              ))}
            </div>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="issues">Issues Reported</Label>
            <Textarea 
              id="issues" 
              value={formData.issues === "None" ? "" : formData.issues}
              onChange={(e) => handleIssuesChange(e.target.value || "None")}
              placeholder="Describe any issues found during patrol"
              rows={3}
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="status">Status</Label>
            <Select 
              value={formData.status} 
              onValueChange={(value) => handleChange("status", value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select Status" />
              </SelectTrigger>
              <SelectContent>
                {statusOptions.map(status => (
                  <SelectItem key={status} value={status}>{status}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">
              {editData ? "Update Patrol" : "Record Patrol"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
