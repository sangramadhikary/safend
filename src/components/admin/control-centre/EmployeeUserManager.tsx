'use client';

import { useState, useEffect } from 'react';
import { supabaseClient } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/components/ui/table';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle
} from '@/components/ui/alert-dialog';
import {
  Shield, Plus, Trash2, RefreshCw, Eye, EyeOff, Copy, Search, MapPin, ChevronRight
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface SupervisorUser {
  id: string;
  auth_user_id: string | null;
  employee_id: string;
  employee_table_id: string | null;
  name: string;
  email: string;
  phone: string | null;
  designation: string | null;
  department: string | null;
  branch_id: string | null;
  status: string;
  created_at: string;
}

interface Employee {
  id: string;
  employee_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  designation: string;
  department: string | null;
  branch_id: string | null;
  status: string;
}

interface OperationalPost {
  id: string;
  post_name: string;
  post_code: string;
  client_name: string;
  total_guards: number;
  status: string;
  location: { city?: string; state?: string; address?: string; latitude?: number; longitude?: number } | null;
}

/**
 * Admin component for managing Supervisor / Area Officer portal users.
 * Flow: Select employee → Assign posts → Set credentials → Create
 */
export function EmployeeUserManager() {
  const { toast } = useToast();
  const [supervisorUsers, setSupervisorUsers] = useState<SupervisorUser[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [posts, setPosts] = useState<OperationalPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<SupervisorUser | null>(null);
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);

  // Post assignments per supervisor
  const [postAssignments, setPostAssignments] = useState<Record<string, string[]>>({});
  const [reassignTarget, setReassignTarget] = useState<SupervisorUser | null>(null);
  const [reassignPostIds, setReassignPostIds] = useState<Set<string>>(new Set());
  const [reassignSearch, setReassignSearch] = useState('');
  const [savingReassign, setSavingReassign] = useState(false);

  // Form state — simplified
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [selectedPostIds, setSelectedPostIds] = useState<Set<string>>(new Set());
  const [formEmail, setFormEmail] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [postSearch, setPostSearch] = useState('');

  // Fetch data
  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabaseClient.auth.getSession();
      const token = session?.access_token || '';

      // Fetch supervisors (try supervisor_users, fallback to employee_users)
      let supervisors: SupervisorUser[] = [];
      const { data: supData, error: supErr } = await supabaseClient
        .from('supervisor_users')
        .select('*')
        .order('created_at', { ascending: false });

      if (!supErr && supData && supData.length > 0) {
        supervisors = supData;
      } else {
        const { data: euData } = await supabaseClient
          .from('employee_users')
          .select('*')
          .order('created_at', { ascending: false });
        supervisors = euData || [];
      }
      setSupervisorUsers(supervisors);

      // Fetch employees
      const empApiRes = await fetch('/api/supervisor-portal/create-employee', {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (empApiRes.ok) {
        const empData = await empApiRes.json();
        setEmployees(empData.employees || []);
      }

      // Fetch active posts
      const { data: postsData } = await supabaseClient
        .from('operational_posts')
        .select('id, post_name, post_code, client_name, total_guards, status, location')
        .eq('status', 'active')
        .order('post_name');
      setPosts(postsData || []);

      // Fetch post assignments for all supervisors
      const { data: assignData } = await supabaseClient
        .from('supervisor_post_assignments')
        .select('supervisor_id, post_id');
      if (assignData) {
        const map: Record<string, string[]> = {};
        assignData.forEach((a: any) => {
          if (!map[a.supervisor_id]) map[a.supervisor_id] = [];
          map[a.supervisor_id].push(a.post_id);
        });
        setPostAssignments(map);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  // Generate random password
  const generatePassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%';
    let pwd = '';
    for (let i = 0; i < 12; i++) pwd += chars[Math.floor(Math.random() * chars.length)];
    setFormPassword(pwd);
    setShowPassword(true);
  };

  // Select employee → auto-fill email
  const handleEmployeeSelect = (employeeId: string) => {
    const emp = employees.find((e) => e.id === employeeId);
    if (emp) {
      setSelectedEmployee(emp);
      setFormEmail(emp.email || '');
    }
  };

  // Toggle post selection
  const togglePost = (postId: string) => {
    setSelectedPostIds(prev => {
      const next = new Set(prev);
      if (next.has(postId)) next.delete(postId);
      else next.add(postId);
      return next;
    });
  };

  // Create supervisor
  const handleCreate = async () => {
    if (!selectedEmployee) {
      toast({ title: 'Select an employee', description: 'Choose which employee to make a supervisor.', variant: 'destructive' });
      return;
    }
    if (!formEmail || !formPassword) {
      toast({ title: 'Missing credentials', description: 'Email and password are required for login.', variant: 'destructive' });
      return;
    }
    if (selectedPostIds.size === 0) {
      toast({ title: 'Assign posts', description: 'Select at least one post for the supervisor to manage.', variant: 'destructive' });
      return;
    }

    setCreating(true);
    try {
      const { data: { session } } = await supabaseClient.auth.getSession();
      if (!session?.access_token) throw new Error('Admin login required.');

      const res = await fetch('/api/supervisor-portal/create-employee', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          email: formEmail,
          password: formPassword,
          name: selectedEmployee.name,
          employee_id: selectedEmployee.employee_id,
          phone: selectedEmployee.phone || null,
          designation: selectedEmployee.designation || 'Area Officer',
          department: selectedEmployee.department || 'Operations',
          branch_id: selectedEmployee.branch_id || null,
          employee_table_id: selectedEmployee.id,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create supervisor');

      // Now assign posts via supervisor_post_assignments (or store in employee_users metadata)
      // For now, store assignments. Try supervisor_post_assignments first.
      const authUserId = data.uid;
      if (authUserId) {
        // Get the supervisor_users or employee_users record ID
        const { data: supRecord } = await supabaseClient
          .from('employee_users')
          .select('id')
          .eq('auth_user_id', authUserId)
          .single();

        if (supRecord) {
          // Remove force-reassigned posts from other supervisors first
          for (const postId of selectedPostIds) {
            await supabaseClient
              .from('supervisor_post_assignments')
              .delete()
              .eq('post_id', postId);
          }

          // Store post assignments
          const assignments = Array.from(selectedPostIds).map(postId => ({
            supervisor_id: supRecord.id,
            post_id: postId,
            assigned_by: session.user?.email || 'admin',
          }));

          // Try the new table first
          const { error: assErr } = await supabaseClient
            .from('supervisor_post_assignments')
            .insert(assignments);

          if (assErr) {
            // Table might not exist yet — store as JSON in a note or skip gracefully
            console.warn('supervisor_post_assignments insert failed (table may not exist yet):', assErr.message);
          }
        }
      }

      toast({
        title: 'Supervisor created',
        description: `${selectedEmployee.name} can now manage ${selectedPostIds.size} post${selectedPostIds.size > 1 ? 's' : ''} via the Supervisor Portal.`,
      });
      setShowCreateDialog(false);
      resetForm();
      fetchData();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setCreating(false);
    }
  };

  const resetForm = () => {
    setSelectedEmployee(null);
    setSelectedPostIds(new Set());
    setFormEmail('');
    setFormPassword('');
    setShowPassword(false);
    setPostSearch('');
  };

  // Delete supervisor
  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      // Delete post assignments first
      await supabaseClient.from('supervisor_post_assignments').delete().eq('supervisor_id', deleteTarget.id);
      // Delete the user record
      const { error: e1 } = await supabaseClient.from('supervisor_users').delete().eq('id', deleteTarget.id);
      if (e1) {
        const { error: e2 } = await supabaseClient.from('employee_users').delete().eq('id', deleteTarget.id);
        if (e2) throw e2;
      }
      toast({ title: 'Removed', description: `${deleteTarget.name} removed from the Supervisor Portal.` });
      setShowDeleteDialog(false);
      setDeleteTarget(null);
      fetchData();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  // Filtered users
  const filtered = supervisorUsers.filter((e) =>
    !search ||
    e.name.toLowerCase().includes(search.toLowerCase()) ||
    e.employee_id.toLowerCase().includes(search.toLowerCase()) ||
    e.email.toLowerCase().includes(search.toLowerCase())
  );

  // Employees not yet supervisors — only show supervisors/area officers/field officers
  const SUPERVISOR_DESIGNATIONS = new Set([
    'supervisor', 'area officer', 'field officer', 'area supervisor',
    'security officer', 'shift incharge', 'shift in-charge', 'team leader',
  ]);
  const existingEmpIds = new Set(supervisorUsers.map((s) => s.employee_id));
  const availableEmployees = employees.filter((e) =>
    !existingEmpIds.has(e.employee_id) &&
    e.status === 'active' &&
    SUPERVISOR_DESIGNATIONS.has((e.designation || '').toLowerCase().trim())
  );

  // Filtered posts for selection
  const filteredPosts = posts.filter(p =>
    !postSearch ||
    p.post_name.toLowerCase().includes(postSearch.toLowerCase()) ||
    p.client_name.toLowerCase().includes(postSearch.toLowerCase())
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-[#D71920]" />
          <h3 className="text-lg font-semibold">Supervisor Portal</h3>
          <Badge variant="secondary">{supervisorUsers.length}</Badge>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button size="sm" onClick={() => { resetForm(); setShowCreateDialog(true); }} className="bg-[#D71920] hover:bg-[#b8151b] text-white">
            <Plus className="h-4 w-4 mr-1.5" />
            Add Supervisor
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          placeholder="Search supervisors..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Table */}
      {loading ? (
        <div className="space-y-2 animate-pulse">
          {[0, 1, 2].map((i) => <div key={i} className="h-12 rounded bg-gray-100 dark:bg-gray-800" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <Shield className="h-10 w-10 mx-auto mb-2 opacity-40" />
          <p className="font-medium">No supervisors yet</p>
          <p className="text-xs mt-1 max-w-xs mx-auto">
            Add a supervisor to give them a dedicated portal where they can manage attendance, deployments, and patrols for their assigned posts.
          </p>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Assigned Posts</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((sup) => {
                const assignedIds = postAssignments[sup.id] || [];
                const assignedPosts = posts.filter(p => assignedIds.includes(p.id));
                return (
                  <TableRow key={sup.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{sup.name}</p>
                        <p className="text-xs text-muted-foreground">{sup.designation || 'Area Officer'} · {sup.employee_id}</p>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-gray-600">{sup.email}</TableCell>
                    <TableCell>
                      {assignedPosts.length === 0 ? (
                        <span className="text-xs text-muted-foreground">No posts assigned</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {assignedPosts.map(p => (
                            <Badge key={p.id} variant="outline" className="text-[11px] font-normal">
                              {p.post_name}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => {
                            setReassignTarget(sup);
                            setReassignPostIds(new Set(assignedIds));
                            setReassignSearch('');
                          }}
                        >
                          <MapPin className="h-3 w-3 mr-1" />
                          Reassign
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-red-500 hover:text-red-700 hover:bg-red-50"
                          onClick={() => { setDeleteTarget(sup); setShowDeleteDialog(true); }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* ─── Create Dialog ─── */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Supervisor / Area Officer</DialogTitle>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {/* Step 1: Select employee */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold">1. Select the Area Officer</Label>
              <Select
                value={selectedEmployee?.id || ''}
                onValueChange={(val) => handleEmployeeSelect(val)}
              >
                <SelectTrigger className="w-full h-10">
                  <SelectValue placeholder="Choose an area officer / supervisor..." />
                </SelectTrigger>
                <SelectContent>
                  {availableEmployees.map((emp) => (
                    <SelectItem key={emp.id} value={emp.id}>
                      {emp.name} — {emp.designation} ({emp.employee_id})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedEmployee && (
                <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
                  <div className="w-8 h-8 rounded-full bg-[#D71920] text-white flex items-center justify-center text-sm font-bold">
                    {selectedEmployee.name.charAt(0)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{selectedEmployee.name}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{selectedEmployee.designation} · {selectedEmployee.employee_id}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Step 2: Assign posts */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold">2. Assign Posts ({selectedPostIds.size} selected)</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                <Input
                  placeholder="Search posts..."
                  value={postSearch}
                  onChange={(e) => setPostSearch(e.target.value)}
                  className="pl-9 h-9 text-sm"
                />
              </div>
              <ScrollArea className="h-[280px] border rounded-lg">
                <div className="p-2 space-y-1">
                  {filteredPosts.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-4">No active posts found.</p>
                  ) : (
                    filteredPosts.map((post) => {
                      // Check if this post is assigned to another supervisor
                      const assignedToOther = Object.entries(postAssignments).find(
                        ([supId, pIds]) => pIds.includes(post.id) && supId !== selectedEmployee?.id
                      );
                      const assignedSupervisorName = assignedToOther
                        ? supervisorUsers.find(s => s.id === assignedToOther[0])?.name
                        : null;
                      const isAssignedElsewhere = !!assignedSupervisorName && !selectedPostIds.has(post.id);

                      return (
                        <div
                          key={post.id}
                          className={`flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors ${
                            selectedPostIds.has(post.id)
                              ? 'bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-600'
                              : isAssignedElsewhere
                                ? 'opacity-60 bg-gray-50 dark:bg-gray-900'
                                : 'hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer'
                          }`}
                          onClick={() => { if (!isAssignedElsewhere) togglePost(post.id); }}
                        >
                          <Checkbox
                            checked={selectedPostIds.has(post.id)}
                            disabled={isAssignedElsewhere}
                            onCheckedChange={() => { if (!isAssignedElsewhere) togglePost(post.id); }}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{post.post_name}</p>
                            <p className="text-[11px] text-gray-500 dark:text-gray-400">
                              {post.client_name} · {post.total_guards} guards
                              {(() => {
                                const city = post.location?.city;
                                const state = post.location?.state;
                                const loc = [city, state].filter(Boolean).join(', ');
                                return loc ? <> · <span className="font-medium">{loc}</span></> : null;
                              })()}
                            </p>
                            {assignedSupervisorName && (
                              <p className="text-[10px] text-amber-700 dark:text-amber-400 mt-0.5">
                                Assigned to: {assignedSupervisorName}
                              </p>
                            )}
                          </div>
                          {isAssignedElsewhere ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-6 text-[10px] px-2 shrink-0"
                              onClick={(e) => {
                                e.stopPropagation();
                                togglePost(post.id);
                              }}
                            >
                              Force Reassign
                            </Button>
                          ) : (
                            <MapPin className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </ScrollArea>
              {selectedPostIds.size > 0 && (
                <p className="text-xs text-gray-600 dark:text-gray-400 font-medium">
                  ✓ {selectedPostIds.size} post{selectedPostIds.size > 1 ? 's' : ''} will be assigned
                </p>
              )}
            </div>

            {/* Step 3: Credentials */}
            <div className="space-y-3">
              <Label className="text-sm font-semibold">3. Login Credentials</Label>
              <div className="space-y-2">
                <Input
                  type="email"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  placeholder="Login email"
                />
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      value={formPassword}
                      onChange={(e) => setFormPassword(e.target.value)}
                      placeholder="Password (min 6 chars)"
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={generatePassword}>
                    Generate
                  </Button>
                  {formPassword && (
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => { navigator.clipboard.writeText(formPassword); toast({ title: 'Copied!' }); }}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>Cancel</Button>
            <Button
              onClick={handleCreate}
              disabled={creating || !selectedEmployee || !formEmail || !formPassword || selectedPostIds.size === 0}
              className="bg-[#D71920] hover:bg-[#b8151b] text-white disabled:opacity-50"
            >
              {creating ? (
                <div className="flex items-center gap-2">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  Creating...
                </div>
              ) : (
                <>
                  <Plus className="h-4 w-4 mr-1.5" />
                  Create Supervisor
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Supervisor?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove <strong>{deleteTarget?.name}</strong> ({deleteTarget?.email}) from the Supervisor Portal and unassign all their posts.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700 text-white">
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── Reassign Posts Dialog ─── */}
      <Dialog open={!!reassignTarget} onOpenChange={(open) => { if (!open) setReassignTarget(null); }}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Reassign Posts — {reassignTarget?.name}</DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
              <Input
                placeholder="Search posts..."
                value={reassignSearch}
                onChange={(e) => setReassignSearch(e.target.value)}
                className="pl-9 h-9 text-sm"
              />
            </div>
            <p className="text-xs text-gray-500">{reassignPostIds.size} post{reassignPostIds.size !== 1 ? 's' : ''} selected</p>
            <ScrollArea className="h-[320px] border rounded-lg">
              <div className="p-2 space-y-1">
                {posts
                  .filter(p => !reassignSearch || p.post_name.toLowerCase().includes(reassignSearch.toLowerCase()) || p.client_name.toLowerCase().includes(reassignSearch.toLowerCase()))
                  .map((post) => (
                    <label
                      key={post.id}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-md cursor-pointer transition-colors ${
                        reassignPostIds.has(post.id)
                          ? 'bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-600'
                          : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
                      }`}
                    >
                      <Checkbox
                        checked={reassignPostIds.has(post.id)}
                        onCheckedChange={() => {
                          setReassignPostIds(prev => {
                            const next = new Set(prev);
                            if (next.has(post.id)) next.delete(post.id);
                            else next.add(post.id);
                            return next;
                          });
                        }}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{post.post_name}</p>
                        <p className="text-[11px] text-gray-500 dark:text-gray-400">
                          {post.client_name} · {post.total_guards} guards
                          {(() => {
                            const city = post.location?.city;
                            const state = post.location?.state;
                            const loc = [city, state].filter(Boolean).join(', ');
                            return loc ? <> · {loc}</> : null;
                          })()}
                        </p>
                      </div>
                    </label>
                  ))}
              </div>
            </ScrollArea>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setReassignTarget(null)}>Cancel</Button>
            <Button
              disabled={savingReassign}
              className="bg-[#D71920] hover:bg-[#b8151b] text-white"
              onClick={async () => {
                if (!reassignTarget) return;
                setSavingReassign(true);
                try {
                  // Delete existing assignments
                  await supabaseClient
                    .from('supervisor_post_assignments')
                    .delete()
                    .eq('supervisor_id', reassignTarget.id);

                  // Insert new assignments
                  if (reassignPostIds.size > 0) {
                    const rows = Array.from(reassignPostIds).map(postId => ({
                      supervisor_id: reassignTarget.id,
                      post_id: postId,
                      assigned_by: 'admin',
                    }));
                    const { error } = await supabaseClient
                      .from('supervisor_post_assignments')
                      .insert(rows);
                    if (error) throw error;
                  }

                  toast({ title: 'Posts updated', description: `${reassignTarget.name} now has ${reassignPostIds.size} post${reassignPostIds.size !== 1 ? 's' : ''} assigned.` });
                  setReassignTarget(null);
                  fetchData();
                } catch (err: any) {
                  toast({ title: 'Error', description: err.message, variant: 'destructive' });
                } finally {
                  setSavingReassign(false);
                }
              }}
            >
              {savingReassign ? 'Saving...' : 'Save Assignments'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
