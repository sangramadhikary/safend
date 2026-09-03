'use client';
import { useState, useEffect } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Users, Shield, Crown, GitBranch } from "lucide-react";
import { useBranch } from "@/contexts/BranchContext";
import { getAllUsers, FirebaseUser } from "@/utils/firebaseUserManagement";
import { supabaseClient } from "@/integrations/supabase/client";

interface RoleAssignmentFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: RoleAssignmentData) => void;
  existingAssignment?: RoleAssignmentData | null;
}

export interface RoleAssignmentData {
  id?: string;
  userId: string;
  userName: string;
  branchId: string;
  branchName: string;
  roles: string[];
  assignedBy?: string;
  assignedDate?: string;
}

export function RoleAssignmentForm({
  isOpen,
  onClose,
  onSave,
  existingAssignment
}: RoleAssignmentFormProps) {
  const { toast } = useToast();
  const { allBranches, isMainBranchUser, currentBranch } = useBranch();

  const [formData, setFormData] = useState<RoleAssignmentData>({
    userId: "",
    userName: "",
    branchId: "",
    branchName: "",
    roles: [],
  });
  const [users, setUsers] = useState<{ id: string; name: string }[]>([]);
  const [availableRoles, setAvailableRoles] = useState<{ id: string; name: string }[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Load real data
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      try {
        // Load users
        const allUsers = await getAllUsers();
        setUsers(allUsers.map(u => ({ id: u.uid, name: u.name || u.email })));

        // Load roles from Supabase
        const { data: rolesData } = await supabaseClient
          .from('roles')
          .select('id, name')
          .order('name');

        if (rolesData && rolesData.length > 0) {
          setAvailableRoles(rolesData);
        } else {
          // Fallback defaults
          setAvailableRoles([
            { id: "r1", name: "Admin" },
            { id: "r2", name: "Sales" },
            { id: "r3", name: "Operations" },
            { id: "r4", name: "HR" },
            { id: "r5", name: "Accounts" },
            { id: "r6", name: "Office Admin" },
          ]);
        }
      } catch (err) {
        console.error('Error loading data:', err);
      } finally {
        setIsLoading(false);
      }
    };

    if (isOpen) loadData();
  }, [isOpen]);

  // Branch options based on access
  const branchOptions = isMainBranchUser
    ? allBranches.filter(b => b.status === 'active')
    : allBranches.filter(b => b.id === currentBranch?.id);

  // Populate form if editing
  useEffect(() => {
    if (existingAssignment) {
      setFormData(existingAssignment);
    } else {
      setFormData({
        userId: "",
        userName: "",
        branchId: !isMainBranchUser && currentBranch ? currentBranch.id : "",
        branchName: !isMainBranchUser && currentBranch ? currentBranch.name : "",
        roles: [],
      });
    }
  }, [existingAssignment, isOpen, isMainBranchUser, currentBranch]);

  const handleRoleToggle = (roleName: string) => {
    setFormData(prev => ({
      ...prev,
      roles: prev.roles.includes(roleName)
        ? prev.roles.filter(r => r !== roleName)
        : [...prev.roles, roleName],
    }));
  };

  const handleSubmit = () => {
    if (!formData.userId || !formData.branchId || formData.roles.length === 0) {
      toast({
        title: "Validation Error",
        description: "Please select a user, branch, and at least one role",
        variant: "destructive",
      });
      return;
    }
    onSave(formData);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-red-600" />
            {existingAssignment ? "Edit Role Assignment" : "Assign Role"}
          </DialogTitle>
          <DialogDescription>
            Assign a user to a branch with specific roles.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh]">
          <div className="space-y-4 py-2">
            {/* User Select */}
            <div className="space-y-2">
              <Label>User *</Label>
              <Select
                value={formData.userId}
                onValueChange={(value) => {
                  const user = users.find(u => u.id === value);
                  setFormData(prev => ({
                    ...prev,
                    userId: value,
                    userName: user?.name || "",
                  }));
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select user" />
                </SelectTrigger>
                <SelectContent>
                  {users.map(user => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Branch Select */}
            <div className="space-y-2">
              <Label>Branch *</Label>
              <Select
                value={formData.branchId}
                onValueChange={(value) => {
                  const branch = branchOptions.find(b => b.id === value);
                  setFormData(prev => ({
                    ...prev,
                    branchId: value,
                    branchName: branch?.name || "",
                  }));
                }}
                disabled={!isMainBranchUser}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select branch" />
                </SelectTrigger>
                <SelectContent>
                  {branchOptions.map(branch => (
                    <SelectItem key={branch.id} value={branch.id}>
                      <div className="flex items-center gap-2">
                        {branch.type === 'main' ? <Crown className="h-3 w-3" /> : <GitBranch className="h-3 w-3" />}
                        {branch.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!isMainBranchUser && (
                <p className="text-xs text-muted-foreground">Locked to your branch</p>
              )}
            </div>

            {/* Role Selection */}
            <div className="space-y-2">
              <Label>Roles *</Label>
              <div className="border rounded-md p-3 space-y-2">
                {availableRoles.map(role => (
                  <div key={role.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={`role-${role.id}`}
                      checked={formData.roles.includes(role.name.toLowerCase())}
                      onCheckedChange={() => handleRoleToggle(role.name.toLowerCase())}
                    />
                    <label htmlFor={`role-${role.id}`} className="text-sm cursor-pointer">
                      {role.name}
                    </label>
                  </div>
                ))}
              </div>
              {formData.roles.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {formData.roles.map(role => (
                    <Badge key={role} variant="outline" className="text-xs capitalize">
                      {role}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={isLoading}>
            {existingAssignment ? "Update Assignment" : "Assign Role"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
