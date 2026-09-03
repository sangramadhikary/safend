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
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Save, X, Shield } from "lucide-react";

interface Role {
  id: string;
  name: string;
  description: string;
  userCount: number;
  status: "active" | "inactive";
}

interface RoleEditFormProps {
  role?: Role | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (role: Partial<Role>) => void;
  isNew?: boolean;
}

export function RoleEditForm({
  role,
  isOpen,
  onClose,
  onSave,
  isNew = false
}: RoleEditFormProps) {
  const { toast } = useToast();
  
  const [formData, setFormData] = useState<Partial<Role>>({
    name: "",
    description: "",
    status: "active"
  });
  
  useEffect(() => {
    if (role) {
      setFormData({
        ...role
      });
    } else {
      setFormData({
        name: "",
        description: "",
        status: "active"
      });
    }
  }, [role, isOpen]);
  
  const handleChange = (key: keyof Role, value: any) => {
    setFormData(prev => ({
      ...prev,
      [key]: value
    }));
  };
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validation
    if (!formData.name) {
      toast({
        title: "Validation Error",
        description: "Role name is required",
        variant: "destructive"
      });
      return;
    }
    
    onSave(formData);
  };
  
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-red-600" />
            {isNew ? "Add New Role" : "Edit Role"}
          </DialogTitle>
          <DialogDescription>
            {isNew 
              ? "Create a new role with specific permissions" 
              : `Update details for ${role?.name || "role"}`}
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-6 py-4">
          <div className="space-y-2">
            <Label htmlFor="name">Role Name *</Label>
            <Input 
              id="name" 
              value={formData.name || ""} 
              onChange={(e) => handleChange("name", e.target.value)}
              placeholder="e.g. Branch Admin"
              required
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea 
              id="description" 
              value={formData.description || ""} 
              onChange={(e) => handleChange("description", e.target.value)}
              placeholder="Describe the purpose and permissions of this role"
              rows={3}
            />
          </div>
          
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="status">Role Status</Label>
              <p className="text-sm text-muted-foreground">Enable or disable this role</p>
            </div>
            <Switch 
              id="status"
              checked={formData.status === "active"}
              onCheckedChange={(checked) => 
                handleChange("status", checked ? "active" : "inactive")
              }
            />
          </div>
          
          <div className="p-4 border rounded-md bg-gray-50 dark:bg-gray-900">
            <div className="flex items-center gap-2 mb-2">
              <Shield className="h-4 w-4 text-red-600" />
              <p className="font-medium">Role Permissions</p>
            </div>
            <p className="text-sm text-muted-foreground">
              After creating the role, you can define specific permissions in the Permission Matrix tab.
            </p>
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
              {isNew ? "Create Role" : "Save Changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
