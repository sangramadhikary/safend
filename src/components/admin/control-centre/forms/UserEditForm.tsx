'use client';

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { User, Copy, RefreshCw, Crown, GitBranch } from 'lucide-react';
import { generatePassword } from "@/utils/firebaseUserManagement";
import { useToast } from "@/hooks/use-toast";
import { useBranch } from "@/contexts/BranchContext";

interface UserData {
  id: string;
  name: string;
  email: string;
  roles: string[];
  branch: string;
  branchId: string;
  status: "active" | "inactive";
  lastActive: string;
  avatar: string;
}

interface UserEditFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (userData: Partial<UserData> & { password?: string }) => void;
  user: UserData | null;
  isNew: boolean;
}

export function UserEditForm({ isOpen, onClose, onSave, user, isNew }: UserEditFormProps) {
  const { toast } = useToast();
  const { allBranches, isMainBranchUser, currentBranch } = useBranch();

  const [formData, setFormData] = useState<Partial<UserData>>({
    name: "",
    email: "",
    roles: [],
    branch: "",
    branchId: "",
    status: "active",
  });
  const [generatedPassword, setGeneratedPassword] = useState("");

  // Populate form data if user is provided (edit mode)
  useEffect(() => {
    if (user) {
      setFormData({
        name: user.name,
        email: user.email,
        roles: user.roles || [],
        branch: user.branch,
        branchId: user.branchId,
        status: user.status,
      });
    } else {
      // Reset form for new user and generate password
      setFormData({
        name: "",
        email: "",
        roles: [],
        branch: "",
        branchId: isMainBranchUser ? "" : currentBranch?.id || "",
        status: "active",
      });
      // Pre-fill branch for sub-branch users
      if (!isMainBranchUser && currentBranch) {
        setFormData(prev => ({
          ...prev,
          branch: currentBranch.name,
          branchId: currentBranch.id,
        }));
      }
      setGeneratedPassword(generatePassword());
    }
  }, [user, isOpen, isMainBranchUser, currentBranch]);

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleRoleToggle = (roleValue: string) => {
    setFormData((prev) => {
      const currentRoles = prev.roles || [];
      const updated = currentRoles.includes(roleValue)
        ? currentRoles.filter(r => r !== roleValue)
        : [...currentRoles, roleValue];
      return { ...prev, roles: updated };
    });
  };

  // Branch options from real data
  const branchOptions = isMainBranchUser
    ? allBranches.filter(b => b.status === 'active')
    : allBranches.filter(b => b.id === currentBranch?.id);

  // Role options - mapped to system roles
  const roleOptions = [
    { value: "admin", label: "Administrator" },
    { value: "branch_admin", label: "Branch Admin" },
    { value: "sales", label: "Sales" },
    { value: "operations", label: "Operations" },
    { value: "hr", label: "HR" },
    { value: "accounts", label: "Accounts" },
    { value: "office-admin", label: "Office Admin" },
    { value: "reports", label: "Reports" },
  ];

  const handleRegeneratePassword = () => {
    const newPassword = generatePassword();
    setGeneratedPassword(newPassword);
    toast({
      title: "Password Regenerated",
      description: "A new password has been generated",
    });
  };

  const handleCopyPassword = () => {
    navigator.clipboard.writeText(generatedPassword);
    toast({
      title: "Password Copied",
      description: "Password copied to clipboard",
    });
  };

  const handleSaveWithPassword = (e: React.FormEvent) => {
    e.preventDefault();
    // Validation
    if (!formData.name || !formData.email || !formData.roles || formData.roles.length === 0 || !formData.branchId) {
      toast({
        title: "Validation Error",
        description: "Please fill in all required fields and select at least one role",
        variant: "destructive",
      });
      return;
    }
    // Pass password along with form data for new users
    const dataToSave = isNew
      ? { ...formData, password: generatedPassword }
      : formData;
    onSave(dataToSave);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            {isNew ? "Add New User" : "Edit User"}
          </DialogTitle>
          <DialogDescription>
            {isNew
              ? "Create a new user account and assign them to a branch with roles."
              : "Update user details, change their roles, or modify branch assignment."}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh] pr-4">
          <form onSubmit={handleSaveWithPassword} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Full Name *</Label>
              <Input
                id="name"
                value={formData.name || ""}
                onChange={(e) => handleChange("name", e.target.value)}
                placeholder="Enter full name"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email Address *</Label>
              <Input
                id="email"
                type="email"
                value={formData.email || ""}
                onChange={(e) => handleChange("email", e.target.value)}
                placeholder="Enter email address"
                required
                disabled={!isNew && !!user}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="branch">Branch *</Label>
              <Select
                value={formData.branchId || ""}
                onValueChange={(value) => {
                  const selectedBranch = branchOptions.find((b) => b.id === value);
                  handleChange("branchId", value);
                  handleChange("branch", selectedBranch?.name || "");
                }}
                disabled={!isMainBranchUser}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select branch" />
                </SelectTrigger>
                <SelectContent>
                  {branchOptions.map((branch) => (
                    <SelectItem key={branch.id} value={branch.id}>
                      <div className="flex items-center gap-2">
                        {branch.type === 'main' ? <Crown className="h-3 w-3" /> : <GitBranch className="h-3 w-3" />}
                        <span>{branch.name}</span>
                        {branch.type === 'main' && (
                          <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 ml-1">HQ</Badge>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!isMainBranchUser && (
                <p className="text-xs text-muted-foreground">
                  Users can only be assigned to your branch
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Roles * <span className="text-xs text-muted-foreground font-normal">(select one or more)</span></Label>
              <div className="grid grid-cols-2 gap-2 border rounded-lg p-3">
                {roleOptions.map((role) => (
                  <label
                    key={role.value}
                    className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 rounded px-2 py-1.5 transition-colors"
                  >
                    <Checkbox
                      checked={formData.roles?.includes(role.value) || false}
                      onCheckedChange={() => handleRoleToggle(role.value)}
                    />
                    <span className="text-sm">{role.label}</span>
                  </label>
                ))}
              </div>
              {formData.roles && formData.roles.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {formData.roles.map(r => {
                    const label = roleOptions.find(opt => opt.value === r)?.label || r;
                    return <Badge key={r} variant="secondary" className="text-xs">{label}</Badge>;
                  })}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select
                value={formData.status || "active"}
                onValueChange={(value: string) => handleChange("status", value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {isNew && (
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="flex gap-2">
                  <Input
                    id="password"
                    type="text"
                    value={generatedPassword}
                    onChange={(e) => setGeneratedPassword(e.target.value)}
                    placeholder="Enter or generate password"
                    className="font-mono"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={handleCopyPassword}
                    title="Copy password"
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={handleRegeneratePassword}
                    title="Regenerate password"
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Auto-generated password. Copy it before saving — it won't be shown again.
                </p>
              </div>
            )}
          </form>
        </ScrollArea>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSaveWithPassword}>
            {isNew ? "Create User" : "Update User"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
