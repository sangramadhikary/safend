'use client';

import { useState } from "react";
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
import { Key, Save, X, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Checkbox } from "@/components/ui/checkbox";

interface ApiTokenFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (tokenData: any) => void;
}

export function ApiTokenForm({
  isOpen,
  onClose,
  onSave
}: ApiTokenFormProps) {
  const { toast } = useToast();
  
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    expiry: 30,
    permissions: {
      read: true,
      write: false,
      delete: false
    }
  });
  
  const handleChange = (field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };
  
  const handlePermissionChange = (permission: string, checked: boolean) => {
    setFormData(prev => ({
      ...prev,
      permissions: {
        ...prev.permissions,
        [permission]: checked
      }
    }));
  };
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validation
    if (!formData.name) {
      toast({
        title: "Validation Error",
        description: "Token name is required",
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
            <Key className="h-5 w-5 text-red-600" />
            Generate New API Token
          </DialogTitle>
          <DialogDescription>
            Create a new API token with specific permissions
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-6 py-4">
          <div className="space-y-2">
            <Label htmlFor="name">Token Name *</Label>
            <Input 
              id="name" 
              value={formData.name} 
              onChange={(e) => handleChange('name', e.target.value)}
              placeholder="e.g. Dashboard API Token"
              required
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea 
              id="description" 
              value={formData.description} 
              onChange={(e) => handleChange('description', e.target.value)}
              placeholder="What this token will be used for"
              rows={2}
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="expiry" className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Expiry (Days)
            </Label>
            <Input 
              id="expiry" 
              type="number"
              min="1"
              max="365"
              value={formData.expiry} 
              onChange={(e) => handleChange('expiry', parseInt(e.target.value))}
            />
            <p className="text-sm text-muted-foreground">
              Token will automatically expire after this many days
            </p>
          </div>
          
          <div className="space-y-3">
            <Label>Permissions</Label>
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="read" 
                  checked={formData.permissions.read}
                  onCheckedChange={(checked) => handlePermissionChange('read', checked as boolean)}
                />
                <label
                  htmlFor="read"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Read (View data)
                </label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="write" 
                  checked={formData.permissions.write}
                  onCheckedChange={(checked) => handlePermissionChange('write', checked as boolean)}
                />
                <label
                  htmlFor="write"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Write (Create and update data)
                </label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="delete" 
                  checked={formData.permissions.delete}
                  onCheckedChange={(checked) => handlePermissionChange('delete', checked as boolean)}
                />
                <label
                  htmlFor="delete"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Delete (Remove data)
                </label>
              </div>
            </div>
          </div>
          
          <div className="p-4 border rounded-md bg-gray-50 dark:bg-gray-900">
            <p className="text-sm text-muted-foreground">
              <strong>Note:</strong> Token will only be displayed once upon creation. 
              Make sure to copy it immediately after generating.
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
              Generate Token
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
