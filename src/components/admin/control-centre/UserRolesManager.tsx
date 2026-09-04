'use client';

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  UserPlus, RefreshCw, Edit, UserMinus, CheckCircle2, Trash2, Search,
  Shield, Plus, Pencil, Users, Save, KeyRound
} from "lucide-react";
import { useBranch } from "@/contexts/BranchContext";
import { useToast } from "@/hooks/use-toast";
import { UserEditForm } from "./forms/UserEditForm";
import { supabaseClient } from "@/integrations/supabase/client";
import {
  createFirebaseUser, getAllUsers, updateFirebaseUser,
  deleteFirebaseUser, updateUserRoles
} from "@/utils/firebaseUserManagement";
import { auditActions } from "@/utils/auditLog";

// Modules in the system
const MODULES = ['Dashboard', 'Sales', 'Operations', 'Accounts', 'HR', 'Office Admin', 'Reports', 'Control Centre'] as const;
// Permissions per module
const PERMISSIONS = ['view', 'create', 'edit', 'delete', 'export'] as const;

interface User {
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

interface Role {
  id: string;
  name: string;
  description: string;
  is_system: boolean;
  permissions: Record<string, string[]>;
  created_at: string;
}

// Format a last_active timestamp into a friendly relative/absolute string.
function formatLastActive(value: string): string {
  if (!value || value === 'Never') return 'Never';
  const date = new Date(value);
  if (isNaN(date.getTime())) return 'Never';
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function UserRolesManager() {
  const { isMainBranch, isMainBranchUser, currentBranch } = useBranch();
  const { toast } = useToast();

  // ─── User State ───
  const [users, setUsers] = useState<User[]>([]);
  const [selectedFilter, setSelectedFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [isAddingUser, setIsAddingUser] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // ─── Role State ───
  const [roles, setRoles] = useState<Role[]>([]);
  const [loadingRoles, setLoadingRoles] = useState(true);
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [roleDialogOpen, setRoleDialogOpen] = useState(false);
  const [deleteRoleDialogOpen, setDeleteRoleDialogOpen] = useState(false);
  const [roleToDelete, setRoleToDelete] = useState<Role | null>(null);
  const [editingRole, setEditingRole] = useState<Partial<Role>>({ name: '', description: '', permissions: {} });
  const [isNewRole, setIsNewRole] = useState(false);
  const [savingRole, setSavingRole] = useState(false);

  // ─── Reset Password State ───
  const [resetPasswordUser, setResetPasswordUser] = useState<User | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [resetMode, setResetMode] = useState<'direct' | 'email' | '2fa'>('direct');
  const [isResettingPassword, setIsResettingPassword] = useState(false);

  // ─── Load Data ───
  useEffect(() => { loadUsers(); fetchRoles(); }, []);

  const loadUsers = async () => {
    setIsLoading(true);
    try {
      const firebaseUsers = await getAllUsers();
      const convertedUsers: User[] = firebaseUsers.map(fu => ({
        id: fu.uid,
        name: fu.name,
        email: fu.email,
        roles: fu.roles || [],
        branch: fu.branch,
        branchId: fu.branchId,
        status: fu.status,
        lastActive: fu.lastActive || 'Never',
        avatar: ''
      }));
      setUsers(convertedUsers);
    } catch (error) {
      console.error('Error loading users:', error);
      setUsers([]);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchRoles = async () => {
    setLoadingRoles(true);
    try {
      const { data, error } = await supabaseClient.from('roles').select('*').order('created_at', { ascending: true });
      if (error) { setRoles(getDefaultRoles()); return; }
      if (data && data.length > 0) {
        setRoles(data.map((r: any) => ({
          id: r.id, name: r.name, description: r.description || '',
          is_system: r.is_system || false, permissions: r.permissions || {},
          created_at: r.created_at,
        })));
      } else { setRoles(getDefaultRoles()); }
    } catch { setRoles(getDefaultRoles()); }
    finally { setLoadingRoles(false); }
  };

  // Select first role by default
  useEffect(() => {
    if (roles.length > 0 && !selectedRole) setSelectedRole(roles[0]);
  }, [roles]);

  // ─── User Filtering ───
  const filteredUsers = !isMainBranchUser ? users.filter(user => user.branchId === currentBranch?.id) : users;
  const statusFilteredUsers = selectedFilter === "all" ? filteredUsers : filteredUsers.filter(user => user.status === selectedFilter);
  const searchFilteredUsers = searchTerm
    ? statusFilteredUsers.filter(user =>
        user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.roles.some(r => r.toLowerCase().includes(searchTerm.toLowerCase())))
    : statusFilteredUsers;

  // ─── User Handlers ───
  const handleEditUser = (user: User) => {
    setSelectedUser(user);
    setIsEditDialogOpen(true);
    setIsAddingUser(false);
  };

  const handleToggleUserStatus = async (user: User) => {
    const newStatus: "active" | "inactive" = user.status === "active" ? "inactive" : "active";
    const result = await updateFirebaseUser(user.id, { status: newStatus });
    if (result.success) {
      await loadUsers();
      // Previously unaudited: an account could be disabled or re-enabled here with
      // no record of who did it.
      void auditActions.userStatusChanged(user.name, newStatus, user.status);
      toast({ title: `User ${newStatus === "active" ? "Activated" : "Deactivated"}`, description: `${user.name} has been ${newStatus === "active" ? "activated" : "deactivated"}` });
    } else {
      toast({ title: "Error", description: result.error || "Failed to update status", variant: "destructive" });
    }
  };

  const handleDeleteUser = (userId: string) => { setUserToDelete(userId); };

  const confirmDeleteUser = async () => {
    const targetId = userToDelete;
    if (!targetId) return;
    const userToDeleteData = users.find(u => u.id === targetId);
    setUserToDelete(null); // close dialog immediately
    const result = await deleteFirebaseUser(targetId);
    if (result.success) {
      await loadUsers();
      if (userToDeleteData) await auditActions.userDeleted(userToDeleteData.name, userToDeleteData);
      toast({ title: "User Deleted", description: "User has been removed from the system" });
    } else {
      toast({ title: "Error", description: result.error || "Failed to delete user", variant: "destructive" });
    }
  };

  const handleAddUser = () => { setSelectedUser(null); setIsAddingUser(true); setIsEditDialogOpen(true); };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadUsers(); await fetchRoles();
    setIsRefreshing(false);
    toast({ title: "Data refreshed", description: "All data has been refreshed" });
  };

  const handleResetPassword = (user: User) => {
    setResetPasswordUser(user);
    setNewPassword('');
    setResetMode('direct');
  };

  const confirmResetPassword = async () => {
    if (!resetPasswordUser) return;
    setIsResettingPassword(true);
    try {
      const { data: session } = await supabaseClient.auth.getSession();
      const token = session?.session?.access_token;

      const body = resetMode === 'direct'
        ? { userId: resetPasswordUser.id, newPassword }
        : resetMode === '2fa'
          ? { userId: resetPasswordUser.id, reset2fa: true }
          : { email: resetPasswordUser.email };

      const res = await fetch('/api/admin/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error);

      // One administrator resetting another user's credentials is among the most
      // sensitive operations in the system — it grants the ability to sign in as
      // that person — and it was previously unaudited. The new password is never
      // recorded; only the fact, the target, and the mechanism.
      void auditActions.credentialReset(
        `${resetPasswordUser.name} (${resetPasswordUser.email})`,
        resetMode
      );

      toast({ title: resetMode === '2fa' ? '2FA Reset' : 'Password Reset', description: result.message });
      setResetPasswordUser(null);
    } catch (err: any) {
      // Failed attempts are recorded too: a series of refused resets against
      // another user's account is exactly the pattern worth surfacing.
      void auditActions.credentialReset(
        `${resetPasswordUser.name} (${resetPasswordUser.email})`,
        resetMode,
        'failure',
        err?.message ?? 'Failed to reset'
      );
      toast({ title: 'Error', description: err.message || 'Failed to reset', variant: 'destructive' });
    } finally {
      setIsResettingPassword(false);
    }
  };

  const handleSaveUser = async (userData: Partial<User> & { password?: string }) => {
    if (isAddingUser) {
      const userRoles = userData.roles && userData.roles.length > 0 ? userData.roles : ['sales'];
      const result = await createFirebaseUser(
        userData.email || '', userData.password || 'TempPass123!',
        { name: userData.name || '', email: userData.email || '', roles: userRoles, branch: userData.branch || '', branchId: userData.branchId || '', status: userData.status || 'active' }
      );
      if (result.success) {
        await loadUsers();
        await auditActions.userCreated(userData.name || '', userData.email || '');
        toast({ title: "User Created", description: `${userData.name} created. Password: ${userData.password}` });
      } else {
        toast({ title: "Error", description: result.error || "Failed to create user", variant: "destructive" });
      }
    } else if (selectedUser) {
      const userRoles = userData.roles && userData.roles.length > 0 ? userData.roles : selectedUser.roles;
      const result = await updateFirebaseUser(selectedUser.id, {
        name: userData.name, roles: userRoles,
        branch: userData.branch, branchId: userData.branchId, status: userData.status
      });
      if (result.success) {
        // Sync user_roles table
        await updateUserRoles(selectedUser.id, userRoles);
        await loadUsers();

        const before = {
          name: selectedUser.name, roles: selectedUser.roles,
          branch: selectedUser.branch, status: selectedUser.status,
        };
        const after = {
          name: userData.name ?? selectedUser.name, roles: userRoles,
          branch: userData.branch ?? selectedUser.branch,
          status: userData.status ?? selectedUser.status,
        };

        if ([...selectedUser.roles].sort().join(',') !== [...userRoles].sort().join(',')) {
          await auditActions.roleChanged(after.name, selectedUser.roles, userRoles);
        }
        if (after.status !== before.status) {
          await auditActions.userStatusChanged(after.name, after.status, before.status);
        }
        await auditActions.userUpdated(after.name, undefined, before, after);
        toast({ title: "User Updated", description: `${userData.name} updated successfully` });
      } else {
        toast({ title: "Error", description: result.error || "Failed to update user", variant: "destructive" });
      }
    }
    setIsEditDialogOpen(false);
    setIsAddingUser(false);
    setSelectedUser(null);
  };

  // Inline role toggle from user table — adds or removes a role without wiping others
  const handleInlineRoleChange = async (user: User, newRole: string) => {
    // Prevent self-demotion: don't allow removing admin role from yourself
    const { data: sessionData } = await supabaseClient.auth.getSession();
    const currentUserId = sessionData?.session?.user?.id;
    if (currentUserId === user.id && user.roles.includes('admin') && newRole === 'admin') {
      toast({ title: "Cannot Remove", description: "You cannot remove the admin role from your own account", variant: "destructive" });
      return;
    }

    const updatedRoles = user.roles.includes(newRole)
      ? user.roles.filter(r => r !== newRole)
      : [...user.roles, newRole];

    if (updatedRoles.length === 0) {
      toast({ title: "Error", description: "User must have at least one role", variant: "destructive" });
      return;
    }

    const result = await updateUserRoles(user.id, updatedRoles);
    if (result.success) {
      setUsers(users.map(u => u.id === user.id ? { ...u, roles: updatedRoles } : u));
      // The inline badge toggle is the fastest way to grant or revoke privilege in
      // the whole application — one click, no confirmation dialog — and it was
      // completely unaudited.
      void auditActions.roleChanged(user.name, user.roles, updatedRoles);
      toast({ title: "Roles Updated", description: `${user.name}: ${updatedRoles.join(', ')}` });
    } else {
      toast({ title: "Error", description: result.error || "Failed to change role", variant: "destructive" });
    }
  };

  // ─── Role Handlers ───
  const handleCreateRole = () => {
    setIsNewRole(true);
    setEditingRole({ name: '', description: '', permissions: {} });
    setRoleDialogOpen(true);
  };

  const handleEditRole = (role: Role) => {
    setIsNewRole(false);
    setEditingRole({ ...role });
    setRoleDialogOpen(true);
  };

  const handleSaveRole = async () => {
    if (!editingRole.name) {
      toast({ title: "Error", description: "Role name is required", variant: "destructive" });
      return;
    }
    setSavingRole(true);
    try {
      if (isNewRole) {
        const { data, error } = await supabaseClient.from('roles').insert({
          name: editingRole.name, description: editingRole.description || '',
          permissions: editingRole.permissions || {}, is_system: false,
        }).select().single();
        if (error) throw error;
        if (data) setRoles([...roles, { ...data, permissions: data.permissions || {} }]);
        void auditActions.roleCreated(editingRole.name!, {
          name: editingRole.name,
          description: editingRole.description || '',
          permissions: editingRole.permissions || {},
        });
        toast({ title: "Role Created", description: `${editingRole.name} has been created` });
      } else {
        // Captured before the write: a role definition change alters what every
        // holder of that role can do, so the prior permission set is what makes
        // the change reviewable.
        const priorRole = roles.find(r => r.id === editingRole.id);

        const { error } = await supabaseClient.from('roles').update({
          name: editingRole.name, description: editingRole.description || '',
          permissions: editingRole.permissions || {},
        }).eq('id', editingRole.id);
        if (error) throw error;
        setRoles(roles.map(r => r.id === editingRole.id ? { ...r, ...editingRole } as Role : r));
        if (selectedRole?.id === editingRole.id) setSelectedRole({ ...selectedRole, ...editingRole } as Role);

        void auditActions.roleDefinitionUpdated(
          editingRole.name!,
          priorRole
            ? { name: priorRole.name, description: priorRole.description, permissions: priorRole.permissions }
            : undefined,
          {
            name: editingRole.name,
            description: editingRole.description || '',
            permissions: editingRole.permissions || {},
          }
        );
        toast({ title: "Role Updated", description: `${editingRole.name} has been updated` });
      }
    } catch {
      if (isNewRole) {
        const newRole: Role = { id: `local-${Date.now()}`, name: editingRole.name!, description: editingRole.description || '', is_system: false, permissions: editingRole.permissions || {}, created_at: new Date().toISOString() };
        setRoles([...roles, newRole]);
      } else {
        setRoles(roles.map(r => r.id === editingRole.id ? { ...r, ...editingRole } as Role : r));
      }
      toast({ title: isNewRole ? "Role Created" : "Role Updated", description: `${editingRole.name} (saved locally)` });
    } finally {
      setSavingRole(false);
      setRoleDialogOpen(false);
    }
  };

  const handleDeleteRole = (role: Role) => {
    if (role.is_system) { toast({ title: "Cannot Delete", description: "System roles cannot be deleted", variant: "destructive" }); return; }
    setRoleToDelete(role);
    setDeleteRoleDialogOpen(true);
  };

  const confirmDeleteRole = async () => {
    if (!roleToDelete) return;
    try { await supabaseClient.from('roles').delete().eq('id', roleToDelete.id); } catch {}
    setRoles(roles.filter(r => r.id !== roleToDelete.id));
    if (selectedRole?.id === roleToDelete.id) setSelectedRole(roles[0] || null);

    // The full permission set is recorded because the role no longer exists to be
    // inspected — this entry is the only way to reconstruct what it granted.
    void auditActions.roleDeleted(roleToDelete.name, {
      name: roleToDelete.name,
      description: roleToDelete.description,
      permissions: roleToDelete.permissions,
      isSystem: roleToDelete.is_system,
    });

    setDeleteRoleDialogOpen(false);
    setRoleToDelete(null);
    toast({ title: "Role Deleted" });
  };

  // Permission matrix toggle
  const togglePermission = async (module: string, permission: string) => {
    if (!selectedRole) return;
    const current = selectedRole.permissions[module] || [];
    const updated = current.includes(permission) ? current.filter(p => p !== permission) : [...current, permission];
    const newPermissions = { ...selectedRole.permissions, [module]: updated };
    const updatedRole = { ...selectedRole, permissions: newPermissions };
    setSelectedRole(updatedRole);
    setRoles(roles.map(r => r.id === selectedRole.id ? updatedRole : r));
    try { await supabaseClient.from('roles').update({ permissions: newPermissions }).eq('id', selectedRole.id); } catch {}

    // Each checkbox in the permission matrix writes immediately, with no save
    // step, so every tick silently widens or narrows what a whole role can do.
    // Diffed at the single module rather than the full permission map, so the
    // entry names the one capability that moved.
    void auditActions.permissionChanged(
      selectedRole.name,
      undefined,
      { [module]: [...current].sort() },
      { [module]: [...updated].sort() }
    );
  };

  const toggleAllForModule = async (module: string) => {
    if (!selectedRole) return;
    const current = selectedRole.permissions[module] || [];
    const allGranted = PERMISSIONS.every(p => current.includes(p));
    const updated = allGranted ? [] : [...PERMISSIONS];
    const newPermissions = { ...selectedRole.permissions, [module]: updated };
    const updatedRole = { ...selectedRole, permissions: newPermissions };
    setSelectedRole(updatedRole);
    setRoles(roles.map(r => r.id === selectedRole.id ? updatedRole : r));
    try { await supabaseClient.from('roles').update({ permissions: newPermissions }).eq('id', selectedRole.id); } catch {}

    void auditActions.permissionChanged(
      selectedRole.name,
      undefined,
      { [module]: [...current].sort() },
      { [module]: [...updated].sort() }
    );
  };

  // Users for selected role — normalize role names for comparison
  const normalizeRoleName = (name: string) => name.toLowerCase().replace(/\s+/g, '-');
  const usersForSelectedRole = selectedRole
    ? users.filter(u => u.roles.some(r => normalizeRoleName(r) === normalizeRoleName(selectedRole.name)))
    : [];

  // ─── RENDER ───
  return (
    <div className="space-y-6">
      {/* ═══════════ USERS TABLE ═══════════ */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <div>
            <CardTitle className="text-xl font-bold flex items-center gap-2">
              <Users className="h-5 w-5 text-red-600" />
              Users & Roles
            </CardTitle>
            <CardDescription>
              {isMainBranchUser ? "Manage all users and their roles across branches" : `Manage users in ${currentBranch?.name}`}
            </CardDescription>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button onClick={() => setSelectedFilter("all")} variant={selectedFilter === "all" ? "default" : "outline"} size="sm">All</Button>
            <Button onClick={() => setSelectedFilter("active")} variant={selectedFilter === "active" ? "default" : "outline"} size="sm">Active</Button>
            <Button onClick={() => setSelectedFilter("inactive")} variant={selectedFilter === "inactive" ? "default" : "outline"} size="sm">Inactive</Button>
            <Button variant="destructive" className="gap-2" onClick={handleAddUser} size="sm">
              <UserPlus className="h-4 w-4" />
              Add User
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
              <span className="ml-2 text-muted-foreground">Loading users...</span>
            </div>
          ) : (
            <>
              <div className="flex justify-between items-center mb-4">
                <div className="relative w-72">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Search users..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-9" />
                </div>
                <Button variant="outline" size="icon" onClick={handleRefresh} disabled={isRefreshing}>
                  <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
                </Button>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Branch</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Last Active</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {searchFilteredUsers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-6 text-muted-foreground">
                        No users found matching your criteria
                      </TableCell>
                    </TableRow>
                  ) : (
                    searchFilteredUsers.map(user => (
                      <TableRow key={user.id}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <Avatar className="h-7 w-7">
                              <AvatarImage src={user.avatar} />
                              <AvatarFallback className="text-xs">{user.name.charAt(0)}</AvatarFallback>
                            </Avatar>
                            {user.name}
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{user.email}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {user.roles.map(r => (
                              <Badge key={r} variant="outline" className="text-xs capitalize cursor-pointer hover:bg-red-50 hover:border-red-200" onClick={() => handleInlineRoleChange(user, r)} title={`Click to remove ${r}`}>
                                {r}
                                <span className="ml-1 text-muted-foreground">×</span>
                              </Badge>
                            ))}
                            <Select onValueChange={(v) => handleInlineRoleChange(user, v)}>
                              <SelectTrigger className="w-[32px] h-6 border-dashed px-1">
                                <Plus className="h-3 w-3" />
                              </SelectTrigger>
                              <SelectContent>
                                {roles.filter(r => !user.roles.includes(normalizeRoleName(r.name))).map(r => (
                                  <SelectItem key={r.id} value={normalizeRoleName(r.name)}>{r.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </TableCell>
                        <TableCell>{user.branch}</TableCell>
                        <TableCell>
                          <Badge variant={user.status === "active" ? "default" : "secondary"}>
                            {user.status === "active" ? "Active" : "Inactive"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">{formatLastActive(user.lastActive)}</TableCell>
                        <TableCell className="text-right space-x-1">
                          <Button variant="ghost" size="icon" onClick={() => handleEditUser(user)} title="Edit user">
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleResetPassword(user)} className="text-blue-600 hover:text-blue-700" title="Reset password">
                            <KeyRound className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleToggleUserStatus(user)} className={user.status === "active" ? "text-amber-600" : "text-green-600"} title={user.status === "active" ? "Deactivate" : "Activate"}>
                            {user.status === "active" ? <UserMinus className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                          </Button>
                          <Button variant="ghost" size="icon" className="text-red-600" onClick={() => handleDeleteUser(user.id)} title="Delete user">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </>
          )}
        </CardContent>
      </Card>

      {/* ═══════════ ROLES & PERMISSION MATRIX ═══════════ */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-xl font-bold flex items-center gap-2">
                <Shield className="h-5 w-5 text-red-600" />
                Role Permissions
              </CardTitle>
              <CardDescription>Select a role to view and edit its module permissions</CardDescription>
            </div>
            <Button size="sm" variant="outline" onClick={handleCreateRole}>
              <Plus className="h-4 w-4 mr-1" /> New Role
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loadingRoles ? (
            <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : (
            <div className="space-y-5">
              {/* Role selector row */}
              <div className="flex flex-wrap gap-2">
                {roles.map(role => (
                  <button
                    key={role.id}
                    onClick={() => setSelectedRole(role)}
                    className={`px-4 py-2 rounded-lg border text-sm font-medium transition-all ${
                      selectedRole?.id === role.id
                        ? 'bg-red-600 text-white border-red-600 shadow-xs'
                        : 'bg-background border-border hover:bg-muted'
                    }`}
                  >
                    {role.name}
                  </button>
                ))}
              </div>

              {/* Selected role details + matrix */}
              {selectedRole && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">{selectedRole.description}</p>
                      <Badge variant="outline" className="mt-1 text-xs">
                        {usersForSelectedRole.length} user{usersForSelectedRole.length !== 1 ? 's' : ''} assigned
                      </Badge>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => handleEditRole(selectedRole)}>
                        <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
                      </Button>
                      {!selectedRole.is_system && (
                        <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => handleDeleteRole(selectedRole)}>
                          <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Permission Matrix Table */}
                  <div className="border rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/40">
                          <TableHead className="w-[160px] font-semibold">Module</TableHead>
                          {PERMISSIONS.map(p => (
                            <TableHead key={p} className="text-center capitalize text-xs w-[80px]">{p}</TableHead>
                          ))}
                          <TableHead className="text-center text-xs w-[60px]">All</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {MODULES.map(module => {
                          const modulePerms = selectedRole.permissions[module] || [];
                          const allChecked = PERMISSIONS.every(p => modulePerms.includes(p));
                          return (
                            <TableRow key={module}>
                              <TableCell className="font-medium text-sm">{module}</TableCell>
                              {PERMISSIONS.map(perm => (
                                <TableCell key={perm} className="text-center">
                                  <Checkbox checked={modulePerms.includes(perm)} onCheckedChange={() => togglePermission(module, perm)} />
                                </TableCell>
                              ))}
                              <TableCell className="text-center">
                                <Checkbox checked={allChecked} onCheckedChange={() => toggleAllForModule(module)} />
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── Dialogs ─── */}
      <UserEditForm user={selectedUser} isOpen={isEditDialogOpen} onClose={() => { setIsEditDialogOpen(false); setIsAddingUser(false); setSelectedUser(null); }} onSave={handleSaveUser} isNew={isAddingUser} />

      {/* Delete User Confirmation */}
      <AlertDialog open={!!userToDelete} onOpenChange={(open) => { if (!open) setUserToDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the user account and all associated data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                confirmDeleteUser();
              }}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reset Password Dialog */}
      <Dialog open={!!resetPasswordUser} onOpenChange={(open) => { if (!open) setResetPasswordUser(null); }}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-blue-600" />
              Reset Password — {resetPasswordUser?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Mode toggle */}
            <div className="flex gap-1 p-1 bg-muted rounded-lg">
              <button
                type="button"
                onClick={() => setResetMode('direct')}
                className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-all ${resetMode === 'direct' ? 'bg-white dark:bg-gray-700 shadow-xs text-gray-900 dark:text-white' : 'text-muted-foreground hover:text-gray-700'}`}
              >
                Set Password
              </button>
              <button
                type="button"
                onClick={() => setResetMode('email')}
                className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-all ${resetMode === 'email' ? 'bg-white dark:bg-gray-700 shadow-xs text-gray-900 dark:text-white' : 'text-muted-foreground hover:text-gray-700'}`}
              >
                Send Email
              </button>
              <button
                type="button"
                onClick={() => setResetMode('2fa')}
                className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-all ${resetMode === '2fa' ? 'bg-white dark:bg-gray-700 shadow-xs text-gray-900 dark:text-white' : 'text-muted-foreground hover:text-gray-700'}`}
              >
                Reset 2FA
              </button>
            </div>

            {resetMode === 'direct' && (
              <div className="space-y-2">
                <Label htmlFor="newPassword">New Password</Label>
                <Input
                  id="newPassword"
                  type="text"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="Enter new password (min 8 chars)"
                  className="font-mono"
                />
                <p className="text-xs text-muted-foreground">
                  The user can log in immediately with this password. Share it securely.
                </p>
              </div>
            )}

            {resetMode === 'email' && (
              <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 text-sm text-blue-800 dark:text-blue-300">
                A password reset link will be sent to <strong>{resetPasswordUser?.email}</strong>. The user clicks the link to set their own new password.
              </div>
            )}

            {resetMode === '2fa' && (
              <div className="space-y-3">
                <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 text-sm text-amber-800 dark:text-amber-300">
                  <p className="font-medium mb-1">Reset biometric / passkey for {resetPasswordUser?.name}</p>
                  <p>This removes all registered devices (fingerprint, face ID, security key). The user will need to re-register their device on next login.</p>
                </div>
                <p className="text-xs text-muted-foreground">
                  Use this if the user has lost their device or is getting locked out by 2FA.
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetPasswordUser(null)}>Cancel</Button>
            <Button
              className={resetMode === '2fa' ? 'bg-amber-600 hover:bg-amber-700 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'}
              disabled={isResettingPassword || (resetMode === 'direct' && newPassword.length < 8)}
              onClick={confirmResetPassword}
            >
              {isResettingPassword
                ? <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />Processing...</>
                : resetMode === 'direct' ? 'Set Password'
                : resetMode === 'email' ? 'Send Email'
                : 'Reset 2FA Devices'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create/Edit Role Dialog */}
      <Dialog open={roleDialogOpen} onOpenChange={setRoleDialogOpen}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle>{isNewRole ? 'Create Role' : 'Edit Role'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-xs">Role Name *</Label>
              <Input className="mt-1" placeholder="e.g. Branch Manager" value={editingRole.name || ''} onChange={(e) => setEditingRole({ ...editingRole, name: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">Description</Label>
              <Textarea className="mt-1" placeholder="What this role is for..." rows={2} value={editingRole.description || ''} onChange={(e) => setEditingRole({ ...editingRole, description: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRoleDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveRole} disabled={savingRole}>
              <Save className="h-4 w-4 mr-1" /> {savingRole ? 'Saving...' : isNewRole ? 'Create Role' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Role Confirmation */}
      <AlertDialog open={deleteRoleDialogOpen} onOpenChange={setDeleteRoleDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Role</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{roleToDelete?.name}&quot;? Users with this role will lose their permissions.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteRole} className="bg-red-600 hover:bg-red-700">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// Default roles when no DB table exists
function getDefaultRoles(): Role[] {
  return [
    { id: 'sys-admin', name: 'Admin', description: 'Full access to all modules and settings', is_system: true, permissions: Object.fromEntries(MODULES.map(m => [m, [...PERMISSIONS]])), created_at: '2024-01-01' },
    { id: 'sys-sales', name: 'Sales', description: 'Leads, quotations, agreements, work orders', is_system: true, permissions: { 'Sales': ['view', 'create', 'edit', 'delete', 'export'], 'Reports': ['view', 'export'] }, created_at: '2024-01-01' },
    { id: 'sys-operations', name: 'Operations', description: 'Posts, rota, attendance, patrols, penalties', is_system: true, permissions: { 'Operations': ['view', 'create', 'edit', 'delete', 'export'], 'Reports': ['view', 'export'] }, created_at: '2024-01-01' },
    { id: 'sys-accounts', name: 'Accounts', description: 'Payables, receivables, banking, compliance, assets', is_system: true, permissions: { 'Accounts': ['view', 'create', 'edit', 'delete', 'export'], 'Reports': ['view', 'export'] }, created_at: '2024-01-01' },
    { id: 'sys-hr', name: 'HR', description: 'Employees, leave, payroll, training, loans', is_system: true, permissions: { 'HR': ['view', 'create', 'edit', 'delete', 'export'], 'Reports': ['view', 'export'] }, created_at: '2024-01-01' },
    { id: 'sys-office-admin', name: 'Office Admin', description: 'Branch management, inventory, procurement, facilities, documents', is_system: true, permissions: { 'Office Admin': ['view', 'create', 'edit', 'delete', 'export'], 'Reports': ['view', 'export'] }, created_at: '2024-01-01' },
  ];
}
