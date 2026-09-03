'use client';

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Branch } from "@/types/branch";
import { useToast } from "@/hooks/use-toast";
import { Building2, Save, X } from "lucide-react";
import { Switch } from "@/components/ui/switch";

interface BranchEditFormProps {
  branch?: Branch | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (branch: Partial<Branch>) => void;
  isNew?: boolean;
}

export function BranchEditForm({ 
  branch, 
  isOpen, 
  onClose, 
  onSave,
  isNew = false
}: BranchEditFormProps) {
  const { toast } = useToast();
  const [formData, setFormData] = useState<Partial<Branch>>({
    name: "",
    code: "",
    address: "",
    city: "",
    state: "",
    country: "India",
    postalCode: "",
    phone: "",
    email: "",
    managerName: "",
    managerId: null,
    status: "active"
  });
  
  useEffect(() => {
    if (branch) {
      setFormData({
        ...branch
      });
    } else {
      setFormData({
        name: "",
        code: "",
        address: "",
        city: "",
        state: "",
        country: "India",
        postalCode: "",
        phone: "",
        email: "",
        managerName: "",
        managerId: null,
        status: "active"
      });
    }
  }, [branch, isOpen]);
  
  const handleChange = (key: keyof Branch, value: any) => {
    setFormData(prev => ({
      ...prev,
      [key]: value
    }));
  };
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validation
    if (!formData.name || !formData.code) {
      toast({
        title: "Validation Error",
        description: "Branch name and code are required",
        variant: "destructive"
      });
      return;
    }
    
    onSave(formData);
  };
  
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-red-600" />
            {isNew ? "Add New Branch" : "Edit Branch"}
          </DialogTitle>
          <DialogDescription>
            {isNew 
              ? "Create a new branch with specific details and settings" 
              : `Update details for ${branch?.name || "branch"}`}
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-6 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Branch Name *</Label>
              <Input 
                id="name" 
                value={formData.name || ""} 
                onChange={(e) => handleChange("name", e.target.value)}
                placeholder="e.g. Mumbai Office"
                required
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="code">Branch Code *</Label>
              <Input 
                id="code" 
                value={formData.code || ""} 
                onChange={(e) => handleChange("code", e.target.value)}
                placeholder="e.g. MUM-001"
                required
              />
            </div>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="address">Address</Label>
            <Input 
              id="address" 
              value={formData.address || ""} 
              onChange={(e) => handleChange("address", e.target.value)}
              placeholder="Full street address"
            />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="city">City</Label>
              <Input 
                id="city" 
                value={formData.city || ""} 
                onChange={(e) => handleChange("city", e.target.value)}
                placeholder="e.g. Mumbai"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="state">State</Label>
              <Input 
                id="state" 
                value={formData.state || ""} 
                onChange={(e) => handleChange("state", e.target.value)}
                placeholder="e.g. Maharashtra"
              />
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="country">Country</Label>
              <Input 
                id="country" 
                value={formData.country || "India"} 
                onChange={(e) => handleChange("country", e.target.value)}
                placeholder="e.g. India"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="postalCode">Postal Code</Label>
              <Input 
                id="postalCode" 
                value={formData.postalCode || ""} 
                onChange={(e) => handleChange("postalCode", e.target.value)}
                placeholder="e.g. 400001"
              />
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input 
                id="phone" 
                value={formData.phone || ""} 
                onChange={(e) => handleChange("phone", e.target.value)}
                placeholder="e.g. +91 22-12345678"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input 
                id="email" 
                value={formData.email || ""} 
                onChange={(e) => handleChange("email", e.target.value)}
                placeholder="e.g. mumbai@safend.com"
                type="email"
              />
            </div>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="managerName">Branch Manager</Label>
            <Input 
              id="managerName" 
              value={formData.managerName || ""} 
              onChange={(e) => handleChange("managerName", e.target.value)}
              placeholder="e.g. Rahul Sharma"
            />
          </div>
          
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="status">Branch Status</Label>
              <p className="text-sm text-muted-foreground">Enable or disable this branch</p>
            </div>
            <Switch 
              id="status"
              checked={formData.status === "active"}
              onCheckedChange={(checked) => 
                handleChange("status", checked ? "active" : "inactive")
              }
            />
          </div>
          
          <DialogFooter>
            <Button 
              type="button" 
              variant="outline" 
              onClick={onClose}
              className="gap-2"
            >
              <X className="h-4 w-4" />
              Cancel
            </Button>
            <Button type="submit" className="gap-2">
              <Save className="h-4 w-4" />
              {isNew ? "Create Branch" : "Save Changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
