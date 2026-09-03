'use client';

import { useState, useEffect } from 'react';
import { supabaseClient } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
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
  Users, Plus, Trash2, RefreshCw, Eye, EyeOff, Copy, Building2, Search
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface ClientUser {
  id: string;
  auth_user_id: string | null;
  client_name: string;
  company_name: string | null;
  contact_person: string;
  email: string;
  phone: string | null;
  agreement_ids: string[];
  post_ids: string[];
  status: string;
  created_at: string;
}

interface OperationalPost {
  id: string;
  post_name: string;
  post_code: string | null;
  client_name: string;
  status: string;
}

export function ClientUserManager() {
  const { toast } = useToast();
  const [clients, setClients] = useState<ClientUser[]>([]);
  const [posts, setPosts] = useState<OperationalPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ClientUser | null>(null);
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);

  // Form state
  const [form, setForm] = useState({
    email: '',
    password: '',
    client_name: '',
    company_name: '',
    contact_person: '',
    phone: '',
    post_ids: [] as string[],
  });
  const [showPassword, setShowPassword] = useState(false);

  // Fetch clients and posts
  const fetchData = async () => {
    setLoading(true);
    try {
      const [clientRes, postRes] = await Promise.all([
        supabaseClient.from('client_users').select('*').order('created_at', { ascending: false }),
        supabaseClient.from('operational_posts').select('id, post_name, post_code, client_name, status').eq('status', 'active'),
      ]);
      if (clientRes.data) setClients(clientRes.data);
      if (postRes.data) setPosts(postRes.data);
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
    setForm({ ...form, password: pwd });
    setShowPassword(true);
  };

  // Auto-fill client name when selecting posts
  const handlePostToggle = (postId: string) => {
    const newPostIds = form.post_ids.includes(postId)
      ? form.post_ids.filter((id) => id !== postId)
      : [...form.post_ids, postId];
    setForm({ ...form, post_ids: newPostIds });

    // Auto-fill client name from first selected post
    if (newPostIds.length > 0 && !form.client_name) {
      const post = posts.find((p) => p.id === newPostIds[0]);
      if (post?.client_name) {
        setForm((prev) => ({ ...prev, post_ids: newPostIds, client_name: post.client_name }));
      }
    }
  };

  // Create client user
  const handleCreate = async () => {
    if (!form.email || !form.password || !form.client_name || !form.contact_person) {
      toast({ title: 'Missing fields', description: 'Email, password, client name and contact person are required.', variant: 'destructive' });
      return;
    }
    setCreating(true);
    try {
      // Get current session token for auth
      const { data: { session } } = await supabaseClient.auth.getSession();
      if (!session?.access_token) {
        throw new Error('You must be logged in as admin to create client users.');
      }

      const res = await fetch('/api/client-portal/create-client', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          email: form.email,
          password: form.password,
          client_name: form.client_name,
          company_name: form.company_name || null,
          contact_person: form.contact_person,
          phone: form.phone || null,
          post_ids: form.post_ids,
          agreement_ids: [],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create client');

      toast({ title: 'Client created', description: `${form.contact_person} (${form.email}) can now log in to the Client Portal.` });
      setShowCreateDialog(false);
      setForm({ email: '', password: '', client_name: '', company_name: '', contact_person: '', phone: '', post_ids: [] });
      fetchData();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setCreating(false);
    }
  };

  // Delete client user
  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      // Remove from client_users (cascade will handle incidents)
      const { error } = await supabaseClient.from('client_users').delete().eq('id', deleteTarget.id);
      if (error) throw error;
      toast({ title: 'Deleted', description: `Client ${deleteTarget.contact_person} has been removed.` });
      setShowDeleteDialog(false);
      setDeleteTarget(null);
      fetchData();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  // Filtered clients
  const filtered = clients.filter((c) =>
    !search ||
    c.client_name.toLowerCase().includes(search.toLowerCase()) ||
    c.contact_person.toLowerCase().includes(search.toLowerCase()) ||
    c.email.toLowerCase().includes(search.toLowerCase())
  );

  // Get unique client names from posts for quick selection
  const uniqueClientNames = [...new Set(posts.map((p) => p.client_name).filter(Boolean))];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Building2 className="h-5 w-5 text-[#D71920]" />
          <h3 className="text-lg font-semibold">Client Portal Users</h3>
          <Badge variant="secondary">{clients.length}</Badge>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button size="sm" onClick={() => setShowCreateDialog(true)} className="bg-[#D71920] hover:bg-[#b8151b] text-white">
            <Plus className="h-4 w-4 mr-1.5" />
            Add Client User
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          placeholder="Search clients..."
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
          <Users className="h-10 w-10 mx-auto mb-2 opacity-40" />
          <p>No client users yet. Create one to get started.</p>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client Name</TableHead>
                <TableHead>Contact Person</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Posts</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-16">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((client) => (
                <TableRow key={client.id}>
                  <TableCell className="font-medium">
                    {client.client_name}
                    {client.company_name && (
                      <span className="block text-xs text-gray-500">{client.company_name}</span>
                    )}
                  </TableCell>
                  <TableCell>{client.contact_person}</TableCell>
                  <TableCell className="text-sm text-gray-600">{client.email}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{client.post_ids?.length || 0} posts</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge className={
                      client.status === 'active' ? 'bg-green-100 text-green-700 border-green-200' :
                      client.status === 'suspended' ? 'bg-red-100 text-red-700 border-red-200' :
                      'bg-gray-100 text-gray-600'
                    }>
                      {client.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-red-500 hover:text-red-700 hover:bg-red-50"
                      onClick={() => { setDeleteTarget(client); setShowDeleteDialog(true); }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Client Portal User</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Client Name - dropdown or free text */}
            <div className="space-y-1.5">
              <Label>Client Name *</Label>
              <div className="flex gap-2">
                <Input
                  value={form.client_name}
                  onChange={(e) => setForm({ ...form, client_name: e.target.value })}
                  placeholder="e.g. ABC Corp"
                  className="flex-1"
                />
                {uniqueClientNames.length > 0 && (
                  <select
                    value=""
                    onChange={(e) => {
                      if (e.target.value) {
                        setForm({ ...form, client_name: e.target.value });
                        // Auto-select all posts for this client
                        const clientPosts = posts.filter((p) => p.client_name === e.target.value);
                        setForm((prev) => ({ ...prev, client_name: e.target.value, post_ids: clientPosts.map((p) => p.id) }));
                      }
                    }}
                    className="h-9 rounded-lg border border-gray-200 bg-white px-2 text-sm"
                  >
                    <option value="">Pick existing...</option>
                    {uniqueClientNames.map((name) => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Company Name</Label>
              <Input
                value={form.company_name}
                onChange={(e) => setForm({ ...form, company_name: e.target.value })}
                placeholder="Full company name (optional)"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Contact Person *</Label>
                <Input
                  value={form.contact_person}
                  onChange={(e) => setForm({ ...form, contact_person: e.target.value })}
                  placeholder="Person name"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Phone</Label>
                <Input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="9876543210"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Email *</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="client@company.com"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Password *</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    placeholder="Min 6 characters"
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
                {form.password && (
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => { navigator.clipboard.writeText(form.password); toast({ title: 'Copied!' }); }}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>

            {/* Post selection */}
            <div className="space-y-1.5">
              <Label>Linked Posts/Sites</Label>
              <p className="text-xs text-gray-500 mb-2">
                Select the posts this client should see attendance for
              </p>
              <div className="max-h-40 overflow-y-auto border rounded-lg divide-y">
                {posts.length === 0 ? (
                  <p className="text-sm text-gray-400 p-3 text-center">No active posts found</p>
                ) : (
                  posts.map((post) => (
                    <label
                      key={post.id}
                      className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={form.post_ids.includes(post.id)}
                        onChange={() => handlePostToggle(post.id)}
                        className="rounded border-gray-300"
                      />
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium truncate block">
                          {post.post_name || post.post_code || post.id}
                        </span>
                        {post.client_name && (
                          <span className="text-xs text-gray-400">{post.client_name}</span>
                        )}
                      </div>
                    </label>
                  ))
                )}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>Cancel</Button>
            <Button
              onClick={handleCreate}
              disabled={creating}
              className="bg-[#D71920] hover:bg-[#b8151b] text-white"
            >
              {creating ? (
                <div className="flex items-center gap-2">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  Creating...
                </div>
              ) : (
                <>
                  <Plus className="h-4 w-4 mr-1.5" />
                  Create Client User
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
            <AlertDialogTitle>Delete Client User?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove <strong>{deleteTarget?.contact_person}</strong> ({deleteTarget?.email}) from the client portal.
              Their reported incidents will also be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700 text-white">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
