'use client';

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Shield, Plus, Pencil, Trash2, Users, Save, RefreshCw } from "lucide-react";
import { supabaseClient } from "@/integrations/supabase/client";
import { getAllUsers, updateUserRoles } from "@/utils/firebaseUserManagement";

// Modules in the system
const MODULES = ['Dashboard', 'Sales', 'Operations', 'Accounts', 'HR', 'Office Admin', 'Reports', 'Control Centre'] as const;
// Permissions per module
const PERMISSIONS = ['view', 'create', 'edit', 'delete', 'export'] as const;

interface Role {
  id: string;
  name: string;
  description: string;
  is_system: boolean;
  permissions: Record<string, string[]>; // { "Sales": ["view", "create", "edit"], ... }
  created_at: string;
}

interface UserRow {
  uid: string;
  name: string;
  email: string;
  roles: string[];
  branch: string;
}

export function RolePermissionManager() {
  const { toast } = useToast();
  const [roles, setRoles] = useState<Role[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loadingRoles, setLoadingRoles] = useState(true);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);

  // Dialog states
  const [roleDialogOpen, setRoleDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [roleToDelete, setRoleToDelete] = useState<Role | null>(null);
  const [editingRole, setEditingRole] = useState<Partial<Role>>({ name: '', description: '', permissions: {} });
  const [isNewRole, setIsNewRole] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => { fetchRoles(); fetchUsers(); }, []);

  const fetchRoles = async () => {
    setLoadingRoles(true);
    try {
      const { data, error } = await supabaseClient.from('roles').select('*').order('created_at', { ascending: true });
      if (error) {
        // Table may not exist — use defaults
        console.warn('Roles table not available, using defaults');
        setRoles(getDefaultRoles());
        return;
      }
      if (data && data.length > 0) {
        setRoles(data.map((r: any) => ({
          id: r.id,
          name: r.name,
          description: r.description || '',
          is_system: r.is_system || false,
          permissions: r.permissions || {},
          created_at: r.created_at,
        })));
      } else {
        setRoles(getDefaultRoles());
      }
    } catch {
      setRoles(getDefaultRoles());
    } finally {
      setLoadingRoles(false);
    }
  };

  const fetchUsers = async () => {
    setLoadingUsers(true);
    try {
      const data = await getAllUsers();
      setUsers(data.map((u: any) => ({ uid: u.uid, name: u.name, email: u.email, roles: u.roles || [], branch: u.branch || '' })));
    } catch { setUsers([]); }
    finally { setLoadingUsers(false); }
  };

  // Select first role by default
  useEffect(() => {
    if (roles.length > 0 && !selectedRole) setSelectedRole(roles[0]);
  }, [roles]);

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
    setSaving(true);
    try {
      if (isNewRole) {
        const { data, error } = await supabaseClient.from('roles').insert({
          name: editingRole.name,
          description: editingRole.description || '',
          permissions: editingRole.permissions || {},
          is_system: false,
        }).select().single();
        if (error) throw error;
        if (data) setRoles([...roles, { ...data, permissions: data.permissions || {} }]);
        toast({ title: "Role Created", description: `${editingRole.name} has been created` });
      } else {
        const { error } = await supabaseClient.from('roles').update({
          name: editingRole.name,
          description: editingRole.description || '',
          permissions: editingRole.permissions || {},
        }).eq('id', editingRole.id);
        if (error) throw error;
        setRoles(roles.map(r => r.id === editingRole.id ? { ...r, ...editingRole } as Role : r));
        if (selectedRole?.id === editingRole.id) setSelectedRole({ ...selectedRole, ...editingRole } as Role);
        toast({ title: "Role Updated", description: `${editingRole.name} has been updated` });
      }
    } catch (err: any) {
      // If table doesn't exist, update local state only
      if (isNewRole) {
        const newRole: Role = { id: `local-${Date.now()}`, name: editingRole.name!, description: editingRole.description || '', is_system: false, permissions: editingRole.permissions || {}, created_at: new Date().toISOString() };
        setRoles([...roles, newRole]);
      } else {
        setRoles(roles.map(r => r.id === editingRole.id ? { ...r, ...editingRole } as Role : r));
      }
      toast({ title: isNewRole ? "Role Created" : "Role Updated", description: `${editingRole.name} (saved locally)` });
    } finally {
      setSaving(false);
      setRoleDialogOpen(false);
    }
  };

  const handleDeleteRole = (role: Role) => {
    if (role.is_system) { toast({ title: "Cannot Delete", description: "System roles cannot be deleted", variant: "destructive" }); return; }
    setRoleToDelete(role);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    const target = roleToDelete;
    if (!target) return;
    setDeleteDialogOpen(false);
    setRoleToDelete(null);
    try {
      await supabaseClient.from('roles').delete().eq('id', target.id);
    } catch { /* continue */ }
    setRoles(prev => prev.filter(r => r.id !== target.id));
    if (selectedRole?.id === target.id) setSelectedRole(roles.find(r => r.id !== target.id) || null);
    toast({ title: "Role Deleted" });
  };

  // Permission matrix toggle
  const togglePermission = async (module: string, permission: string) => {
    if (!selectedRole) return;
    const current = selectedRole.permissions[module] || [];
    const updated = current.includes(permission)
      ? current.filter(p => p !== permission)
      : [...current, permission];
    const newPermissions = { ...selectedRole.permissions, [module]: updated };
    const updatedRole = { ...selectedRole, permissions: newPermissions };
    setSelectedRole(updatedRole);
    setRoles(roles.map(r => r.id === selectedRole.id ? updatedRole : r));

    // Persist
    try {
      await supabaseClient.from('roles').update({ permissions: newPermissions }).eq('id', selectedRole.id);
    } catch { /* local only */ }
  };

  const toggleAllForModule = (module: string) => {
    if (!selectedRole) return;
    const current = selectedRole.permissions[module] || [];
    const allGranted = PERMISSIONS.every(p => current.includes(p));
    const updated = allGranted ? [] : [...PERMISSIONS];
    const newPermissions = { ...selectedRole.permissions, [module]: updated };
    const updatedRole = { ...selectedRole, permissions: newPermissions };
    setSelectedRole(updatedRole);
    setRoles(roles.map(r => r.id === selectedRole.id ? updatedRole : r));
    try { supabaseClient.from('roles').update({ permissions: newPermissions }).eq('id', selectedRole.id); } catch {}
  };

  // Assign role to user
  const handleUserRoleChange = async (userId: string, newRole: string) => {
    const result = await updateUserRoles(userId, [newRole]);
    if (result.success) {
      setUsers(users.map(u => u.uid === userId ? { ...u, roles: [newRole] } : u));
      toast({ title: "Role Assigned", description: `User role changed to ${newRole}` });
    } else {
      toast({ title: "Error", description: result.error || "Failed", variant: "destructive" });
    }
  };

  const usersForRole = selectedRole ? users.filter(u => u.roles.includes(selectedRole.name.toLowerCase()) || (selectedRole.name.toLowerCase() === 'admin' && u.roles.includes('admin'))) : [];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
        {/* LEFT: Role List */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Roles</h3>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handleCreateRole}>
              <Plus className="h-3.5 w-3.5 mr-1" /> New Role
            </Button>
          </div>

          {loadingRoles ? (
            <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
          ) : (
            <div className="space-y-1">
              {roles.map(role => (
                <button
                  key={role.id}
                  onClick={() => setSelectedRole(role)}
                  className={`w-full text-left px-3 py-2.5 rounded-lg border transition-all ${
                    selectedRole?.id === role.id
                      ? 'bg-safend-red/5 border-safend-red/30 ring-1 ring-safend-red/20'
                      : 'border-transparent hover:bg-muted/50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className={`text-sm font-medium ${selectedRole?.id === role.id ? 'text-safend-red' : ''}`}>{role.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{role.description}</p>
                    </div>
                    {role.is_system && <Badge variant="outline" className="text-[9px] shrink-0 hidden">System</Badge>}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* RIGHT: Permission Matrix + Users */}
        <div className="space-y-6">
          {selectedRole ? (
            <>
              {/* Role header */}
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold flex items-center gap-2">
                    <Shield className="h-5 w-5 text-safend-red" />
                    {selectedRole.name}
                  </h2>
                  <p className="text-sm text-muted-foreground">{selectedRole.description}</p>
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

              {/* Permission Matrix */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Permissions</CardTitle>
                  <CardDescription>Click checkboxes to grant or revoke access for this role</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/30">
                        <TableHead className="w-[160px]">Module</TableHead>
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
                                <Checkbox
                                  checked={modulePerms.includes(perm)}
                                  onCheckedChange={() => togglePermission(module, perm)}
                                />
                              </TableCell>
                            ))}
                            <TableCell className="text-center">
                              <Checkbox
                                checked={allChecked}
                                onCheckedChange={() => toggleAllForModule(module)}
                              />
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              {/* Users with this role */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Users className="h-4 w-4" /> Users with this role
                    <Badge variant="outline" className="text-xs ml-1">{usersForRole.length}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {usersForRole.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">No users assigned to this role</p>
                  ) : (
                    <div className="space-y-2">
                      {usersForRole.map(u => (
                        <div key={u.uid} className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/30">
                          <div>
                            <p className="text-sm font-medium">{u.name || u.email}</p>
                            <p className="text-xs text-muted-foreground">{u.email}{u.branch ? ` · ${u.branch}` : ''}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          ) : (
            <div className="text-center py-20 text-muted-foreground">
              <Shield className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p>Select a role to manage its permissions</p>
            </div>
          )}
        </div>
      </div>

      {/* All Users — quick role assignment */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Quick Role Assignment</CardTitle>
              <CardDescription>Change any user's role from here</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={fetchUsers} disabled={loadingUsers}>
              <RefreshCw className={`h-3.5 w-3.5 mr-1 ${loadingUsers ? 'animate-spin' : ''}`} /> Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loadingUsers ? (
            <div className="p-6 text-center text-sm text-muted-foreground">Loading users...</div>
          ) : users.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">No users found. Create users in User Manager.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Branch</TableHead>
                  <TableHead>Role</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map(user => (
                  <TableRow key={user.uid}>
                    <TableCell className="font-medium text-sm">{user.name || '—'}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{user.email}</TableCell>
                    <TableCell className="text-sm">{user.branch || '—'}</TableCell>
                    <TableCell>
                      <Select value={user.roles[0] || ''} onValueChange={(v) => handleUserRoleChange(user.uid, v)}>
                        <SelectTrigger className="w-[140px] h-8 text-xs"><SelectValue placeholder="Assign" /></SelectTrigger>
                        <SelectContent>
                          {roles.map(r => <SelectItem key={r.id} value={r.name.toLowerCase()}>{r.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

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
            <Button onClick={handleSaveRole} disabled={saving}>
              <Save className="h-4 w-4 mr-1" /> {saving ? 'Saving...' : isNewRole ? 'Create Role' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Role</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{roleToDelete?.name}"? Users with this role will lose their permissions.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700">Delete</AlertDialogAction>
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
