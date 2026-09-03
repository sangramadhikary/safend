'use client';
import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { uploadProfilePicture } from "@/lib/r2-storage";
import { supabaseClient } from "@/integrations/supabase/client";
import { getSupabaseClient } from "@/integrations/supabase/client";
import {
  User, Mail, Phone, Calendar, Camera, Lock, Save,
  Shield, Bell, BellOff, Palette, GitBranch, Smartphone,
  Monitor, Trash2, AlertTriangle, CheckCircle2, Copy, RefreshCw,
  Sun, Moon, Volume2, VolumeX
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useTheme } from "@/components/ThemeProvider";
import { useSoundContext } from "@/components/sound/SoundEffectsProvider";
import { useTabWithHash } from "@/hooks/useTabWithHash";
import { MAX_SESSIONS } from "@/utils/sessionManager";
import { WhatsAppMfaSettings } from "@/components/auth/WhatsAppMfaSettings";

const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrator', branch_admin: 'Branch Admin', sales: 'Sales',
  operations: 'Operations', hr: 'HR', accounts: 'Accounts', office_admin: 'Office Admin',
};

interface SessionRow {
  id: string; ip_address: string | null; user_agent: string | null;
  device_info: string | null; location: string | null;
  created_at: string; last_active: string; is_current: boolean;
}

interface TotpFactor { id: string; friendly_name: string; factor_type: string; status: string; }

// ── Standalone Preferences Panel ─────────────────────────────────────────────
function PreferencesPanel({ email }: { email: string }) {
  const { theme, setTheme } = useTheme();
  const { isSoundEnabled, toggleSound } = useSoundContext();
  const [inAppNotifs, setInAppNotifs] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    return localStorage.getItem('pref:inAppNotifs') !== 'false';
  });

  const toggleInApp = (val: boolean) => {
    setInAppNotifs(val);
    localStorage.setItem('pref:inAppNotifs', val ? 'true' : 'false');
  };

  const isDark = theme === 'dark';

  const applyTheme = (dark: boolean) => {
    if (typeof document !== 'undefined' && (document as any).startViewTransition) {
      (document as any).startViewTransition(() => setTheme(dark ? 'dark' : 'light'));
    } else {
      setTheme(dark ? 'dark' : 'light');
    }
  };

  return (
    <div className="space-y-6">
      {/* Notifications */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Bell className="h-5 w-5" />Notifications</CardTitle>
          <CardDescription>Control how and where you receive alerts</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {inAppNotifs ? <Bell className="h-5 w-5 text-muted-foreground" /> : <BellOff className="h-5 w-5 text-muted-foreground" />}
              <div>
                <p className="font-medium text-sm">In-App Notifications</p>
                <p className="text-xs text-muted-foreground">Alerts shown in the notification bell</p>
              </div>
            </div>
            <Switch checked={inAppNotifs} onCheckedChange={toggleInApp} />
          </div>
          <Separator />
          <div className="flex items-center justify-between opacity-60">
            <div className="flex items-center gap-3">
              <Bell className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="font-medium text-sm">Email Notifications</p>
                <p className="text-xs text-muted-foreground">Powered by Resend — coming soon</p>
              </div>
            </div>
            <Badge variant="outline" className="text-xs">Coming Soon</Badge>
          </div>
        </CardContent>
      </Card>

      {/* Appearance */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Palette className="h-5 w-5" />Appearance</CardTitle>
          <CardDescription>Choose how the app looks</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {isDark ? <Moon className="h-5 w-5 text-muted-foreground" /> : <Sun className="h-5 w-5 text-muted-foreground" />}
              <div>
                <p className="font-medium text-sm">Theme</p>
                <p className="text-xs text-muted-foreground">Currently: {isDark ? 'Dark mode' : 'Light mode'}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Sun className="h-4 w-4 text-muted-foreground" />
              <Switch checked={isDark} onCheckedChange={applyTheme} />
              <Moon className="h-4 w-4 text-muted-foreground" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Sound */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {isSoundEnabled ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
            Sound Effects
          </CardTitle>
          <CardDescription>UI sounds for actions and notifications</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {isSoundEnabled ? <Volume2 className="h-5 w-5 text-muted-foreground" /> : <VolumeX className="h-5 w-5 text-muted-foreground" />}
              <div>
                <p className="font-medium text-sm">Sound Effects</p>
                <p className="text-xs text-muted-foreground">{isSoundEnabled ? 'Sounds are on' : 'Sounds are off'}</p>
              </div>
            </div>
            <Switch checked={isSoundEnabled} onCheckedChange={() => toggleSound()} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function UserProfile() {
  const { toast } = useToast();
  const [userId, setUserId] = useState<string | null>(null);
  const [isFetching, setIsFetching] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useTabWithHash("profile", ["profile", "security", "preferences"]);

  const [profileData, setProfileData] = useState({
    name: '', email: '', phone: '', roles: [] as string[],
    branch: '', status: '', photoURL: '', joinedYear: String(new Date().getFullYear()),
  });
  const [formData, setFormData] = useState({ name: '', phone: '' });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');

  // Password
  const [pwd, setPwd] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [passwordStrength, setPasswordStrength] = useState<{ score: number; label: string; color: string }>({ score: 0, label: '', color: '' });

  // 2FA / TOTP
  const [factors, setFactors] = useState<TotpFactor[]>([]);
  const [enrolling, setEnrolling] = useState(false);
  const [qr, setQr] = useState('');
  const [secret, setSecret] = useState('');
  const [factorId, setFactorId] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [verifying2fa, setVerifying2fa] = useState(false);

  // Sessions
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);

  // ── Load profile ──────────────────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      setIsFetching(true);
      try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) return;
        setUserId(user.id);
        const { data } = await supabaseClient.from('users').select('*').eq('id', user.id).single();
        let branchName = '';
        if (data?.branch_id) {
          const { data: br } = await supabaseClient.from('branches')
            .select('name').or(`id.eq.${data.branch_id},code.eq.${data.branch_id}`).maybeSingle();
          if (br) branchName = br.name;
        }
        const photoURL = data?.photo_url || localStorage.getItem('userPhotoURL') || '';
        const joined = new Date(data?.created_at || user.created_at);
        setProfileData({
          name: data?.name || user.email?.split('@')[0] || '',
          email: user.email || '',
          phone: data?.phone || '',
          roles: Array.isArray(data?.roles) ? data.roles : [],
          branch: branchName || data?.branch || '',
          status: data?.status || 'active',
          photoURL,
          joinedYear: isNaN(joined.getTime()) ? String(new Date().getFullYear()) : String(joined.getFullYear()),
        });
        setFormData({ name: data?.name || user.email?.split('@')[0] || '', phone: data?.phone || '' });
      } finally { setIsFetching(false); }
    };
    load();
  }, []);

  // ── Load MFA factors ──────────────────────────────────────────────────────
  const loadFactors = useCallback(async () => {
    const { data } = await getSupabaseClient().auth.mfa.listFactors();
    setFactors((data?.totp || []) as TotpFactor[]);
  }, []);
  useEffect(() => { loadFactors(); }, [loadFactors]);

  // ── Load sessions ─────────────────────────────────────────────────────────
  const loadSessions = useCallback(async () => {
    setLoadingSessions(true);
    const { data } = await supabaseClient.from('user_sessions')
      .select('*').order('last_active', { ascending: false }).limit(10);
    setSessions((data || []) as SessionRow[]);
    setLoadingSessions(false);
  }, []);
  useEffect(() => { loadSessions(); }, [loadSessions]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast({ title: 'Max 5 MB', variant: 'destructive' }); return; }
    setSelectedFile(file);
    const reader = new FileReader();
    reader.onloadend = () => setPreviewUrl(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleProfileUpdate = async () => {
    if (!userId) return;
    setIsLoading(true);
    try {
      let photoURL = profileData.photoURL;
      if (selectedFile) {
        const r = await uploadProfilePicture(selectedFile, userId);
        if (r.success && r.url) photoURL = r.url;
        else throw new Error(r.error || 'Upload failed');
      }
      // Build update payload — only include columns that exist in the schema.
      // `phone` and `photo_url` were added via migration
      // (scripts/alter_users_add_phone_photo.sql). If the migration hasn't been
      // applied yet, Supabase rejects the whole update with a
      // "Could not find the 'X' column" error — so we detect that and retry
      // after stripping the offending column, letting the rest of the save go through.
      const updatePayload: Record<string, unknown> = { name: formData.name };
      if (formData.phone !== undefined) updatePayload.phone = formData.phone || null;
      if (photoURL !== profileData.photoURL) updatePayload.photo_url = photoURL;

      let missingColumn = false;
      for (let attempt = 0; attempt < 3; attempt++) {
        const { error } = await supabaseClient.from('users')
          .update(updatePayload)
          .eq('id', userId);
        if (!error) break;

        // Postgres/PostgREST schema-cache error for an unknown column.
        const match = /Could not find the '(\w+)' column/i.exec(error.message);
        if (match && match[1] in updatePayload) {
          delete updatePayload[match[1]];
          missingColumn = true;
          continue; // retry without the missing column
        }
        throw new Error(error.message);
      }

      localStorage.setItem('userName', formData.name);
      if (photoURL) localStorage.setItem('userPhotoURL', photoURL);
      window.dispatchEvent(new Event('storage'));
      setProfileData(p => ({ ...p, name: formData.name, phone: formData.phone, photoURL }));
      setSelectedFile(null); setPreviewUrl('');
      if (missingColumn) {
        toast({
          title: 'Saved with limits',
          description: 'Some fields (phone/photo) could not be stored. Run the alter_users_add_phone_photo.sql migration to enable them.',
        });
      } else {
        toast({ title: 'Profile updated' });
      }
    } catch (e: any) { toast({ title: 'Error', description: e.message, variant: 'destructive' }); }
    finally { setIsLoading(false); }
  };

  // ── Password strength evaluator ────────────────────────────────────────────
  const evaluatePasswordStrength = useCallback((password: string) => {
    if (!password) { setPasswordStrength({ score: 0, label: '', color: '' }); return; }
    let score = 0;
    if (password.length >= 8) score++;
    if (password.length >= 12) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[a-z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;

    let label = 'Very Weak';
    let color = 'bg-red-500';
    if (score >= 5) { label = 'Strong'; color = 'bg-green-500'; }
    else if (score >= 4) { label = 'Good'; color = 'bg-blue-500'; }
    else if (score >= 3) { label = 'Fair'; color = 'bg-yellow-500'; }
    else if (score >= 2) { label = 'Weak'; color = 'bg-orange-500'; }
    setPasswordStrength({ score, label, color });
  }, []);

  const handlePasswordUpdate = async () => {
    if (!pwd.currentPassword) { toast({ title: 'Current password is required', variant: 'destructive' }); return; }
    if (pwd.newPassword !== pwd.confirmPassword) { toast({ title: 'Passwords do not match', variant: 'destructive' }); return; }
    if (pwd.newPassword.length < 8) { toast({ title: 'Min 8 characters', variant: 'destructive' }); return; }
    if (passwordStrength.score < 2) { toast({ title: 'Password too weak', description: 'Include uppercase, lowercase, numbers, and special characters', variant: 'destructive' }); return; }
    if (pwd.currentPassword === pwd.newPassword) { toast({ title: 'New password must be different from current password', variant: 'destructive' }); return; }
    setIsLoading(true);
    try {
      // Verify current password first by attempting sign-in
      const { error: signInError } = await supabaseClient.auth.signInWithPassword({
        email: profileData.email,
        password: pwd.currentPassword,
      });
      if (signInError) {
        toast({ title: 'Current password is incorrect', variant: 'destructive' });
        return;
      }
      // Now update to new password
      const { error } = await supabaseClient.auth.updateUser({ password: pwd.newPassword });
      if (error) throw new Error(error.message);
      toast({ title: 'Password updated successfully' });
      setPwd({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setPasswordStrength({ score: 0, label: '', color: '' });
    } catch (e: any) { toast({ title: 'Error', description: e.message, variant: 'destructive' }); }
    finally { setIsLoading(false); }
  };

  // ── TOTP enroll ───────────────────────────────────────────────────────────
  const startEnroll = async () => {
    setEnrolling(true);
    try {
      const { data, error } = await getSupabaseClient().auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Authenticator App' });
      if (error) throw new Error(error.message);
      setQr(data.totp.qr_code);
      setSecret(data.totp.secret);
      setFactorId(data.id);
    } catch (e: any) { toast({ title: 'Error', description: e.message, variant: 'destructive' }); setEnrolling(false); }
  };

  const verifyEnroll = async () => {
    if (!totpCode || totpCode.length !== 6) { toast({ title: 'Enter the 6-digit code from your app', variant: 'destructive' }); return; }
    setVerifying2fa(true);
    try {
      const { data: challenge, error: cErr } = await getSupabaseClient().auth.mfa.challenge({ factorId });
      if (cErr) throw new Error(cErr.message);
      const { error: vErr } = await getSupabaseClient().auth.mfa.verify({ factorId, challengeId: challenge.id, code: totpCode });
      if (vErr) throw new Error(vErr.message);
      toast({ title: '2FA enabled', description: 'Your authenticator app is now linked.' });
      setEnrolling(false); setQr(''); setSecret(''); setTotpCode('');
      loadFactors();
    } catch (e: any) { toast({ title: 'Invalid code', description: e.message, variant: 'destructive' }); }
    finally { setVerifying2fa(false); }
  };

  const unenroll2fa = async (id: string) => {
    try {
      const { error } = await getSupabaseClient().auth.mfa.unenroll({ factorId: id });
      if (error) throw new Error(error.message);
      toast({ title: '2FA removed' });
      loadFactors();
    } catch (e: any) { toast({ title: 'Error', description: e.message, variant: 'destructive' }); }
  };

  // ── Session revoke ────────────────────────────────────────────────────────
  const revokeSession = async (sessionId: string, isCurrent: boolean) => {
    if (isCurrent) { toast({ title: 'Cannot revoke your current session' }); return; }
    await supabaseClient.from('user_sessions').delete().eq('id', sessionId);
    setSessions(s => s.filter(x => x.id !== sessionId));
    toast({ title: 'Session revoked' });
  };

  const revokeAllOther = async () => {
    await supabaseClient.from('user_sessions').delete().eq('user_id', userId!).eq('is_current', false);
    setSessions(s => s.filter(x => x.is_current));
    toast({ title: 'All other sessions revoked' });
  };

  const getInitials = (n: string) => n.split(' ').map(x => x[0]).join('').toUpperCase().slice(0, 2) || 'U';
  const primaryRole = profileData.roles[0] || '';
  const roleLabel = ROLE_LABELS[primaryRole] || primaryRole || '—';

  if (isFetching) return (
    <div className="container mx-auto p-6 max-w-4xl space-y-6">
      {/* Page title */}
      <div className="space-y-1">
        <div className="h-7 w-36 rounded bg-muted animate-pulse" />
        <div className="h-4 w-64 rounded bg-muted animate-pulse" />
      </div>

      {/* Profile header card */}
      <div className="rounded-lg border p-6">
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
          <div className="h-24 w-24 rounded-full bg-muted animate-pulse shrink-0" />
          <div className="flex-1 space-y-3">
            <div className="h-6 w-48 rounded bg-muted animate-pulse" />
            <div className="h-4 w-40 rounded bg-muted animate-pulse" />
            <div className="flex gap-2 flex-wrap">
              {[80, 96, 72, 64].map((w, i) => (
                <div key={i} className="h-5 rounded-full bg-muted animate-pulse" style={{ width: w }} />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg bg-muted/50 p-1 animate-pulse">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-9 flex-1 rounded-md bg-muted" />
        ))}
      </div>

      {/* Form card */}
      <div className="rounded-lg border p-6 space-y-4 animate-pulse">
        <div className="h-5 w-40 rounded bg-muted" />
        <div className="h-3 w-56 rounded bg-muted" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="space-y-1">
              <div className="h-4 w-20 rounded bg-muted" />
              <div className="h-10 w-full rounded-md bg-muted" />
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <div className="h-9 w-20 rounded-md bg-muted" />
          <div className="h-9 w-28 rounded-md bg-muted" />
        </div>
      </div>
    </div>
  );

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-red-600">User Profile</h1>
        <p className="text-muted-foreground text-sm">Manage your account settings and security</p>
      </div>

      {/* Profile header */}
      <Card className="mb-6 bg-linear-to-r from-red-50 to-gray-50 dark:from-red-900/20 dark:to-gray-900/20 border-red-100 dark:border-red-800/30">
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
            <div className="relative shrink-0">
              <Avatar className="h-24 w-24 border-4 border-white shadow-md">
                <AvatarImage src={previewUrl || profileData.photoURL} alt={profileData.name} />
                <AvatarFallback className="text-2xl bg-linear-to-br from-red-500 to-gray-600 text-white">
                  {getInitials(profileData.name)}
                </AvatarFallback>
              </Avatar>
              <label htmlFor="profile-upload" className="absolute bottom-0 right-0 bg-red-600 text-white p-1.5 rounded-full cursor-pointer hover:bg-red-700 shadow-sm">
                <Camera className="h-3.5 w-3.5" />
                <input id="profile-upload" type="file" accept="image/*" className="hidden" onChange={handleFileSelect} />
              </label>
            </div>
            <div className="flex-1 text-center sm:text-left">
              <h2 className="text-xl font-bold">{profileData.name || '—'}</h2>
              <p className="text-sm text-muted-foreground mb-3">{profileData.email}</p>
              <div className="flex flex-wrap gap-2 justify-center sm:justify-start">
                {profileData.branch && <Badge variant="secondary" className="flex items-center gap-1 text-xs"><GitBranch className="h-3 w-3" />{profileData.branch}</Badge>}
                <Badge variant="secondary" className="flex items-center gap-1 text-xs"><Shield className="h-3 w-3" />{roleLabel}</Badge>
                <Badge variant="secondary" className="flex items-center gap-1 text-xs"><Calendar className="h-3 w-3" />Since {profileData.joinedYear}</Badge>
                {factors.length > 0 && <Badge className="text-xs bg-green-100 text-green-700 flex items-center gap-1"><CheckCircle2 className="h-3 w-3" />2FA On</Badge>}
                <Badge className={`text-xs ${profileData.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`} variant="secondary">
                  {profileData.status === 'active' ? 'Active' : 'Inactive'}
                </Badge>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="profile" className="flex items-center gap-2"><User className="h-4 w-4" />Profile</TabsTrigger>
          <TabsTrigger value="security" className="flex items-center gap-2"><Lock className="h-4 w-4" />Security</TabsTrigger>
          <TabsTrigger value="preferences" className="flex items-center gap-2"><Palette className="h-4 w-4" />Preferences</TabsTrigger>
        </TabsList>

        {/* ── Profile Tab ── */}
        <TabsContent value="profile">
          <Card>
            <CardHeader><CardTitle>Personal Information</CardTitle><CardDescription>Update your name, phone, and profile picture</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Full Name</Label>
                  <div className="relative"><User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input value={formData.name} onChange={e => setFormData(p => ({ ...p, name: e.target.value }))} className="pl-9" placeholder="Your full name" /></div>
                </div>
                <div className="space-y-2">
                  <Label>Email Address</Label>
                  <div className="relative"><Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input value={profileData.email} disabled className="pl-9 bg-muted" /></div>
                </div>
                <div className="space-y-2">
                  <Label>Phone Number</Label>
                  <div className="relative"><Phone className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input value={formData.phone} onChange={e => setFormData(p => ({ ...p, phone: e.target.value }))} className="pl-9" placeholder="+91 98765 43210" /></div>
                </div>
                <div className="space-y-2">
                  <Label>Assigned Branch</Label>
                  <div className="relative"><GitBranch className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input value={profileData.branch || '—'} disabled className="pl-9 bg-muted" /></div>
                  <p className="text-[11px] text-muted-foreground">Managed by administrator</p>
                </div>
                <div className="space-y-2">
                  <Label>Role</Label>
                  <div className="relative"><Shield className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input value={roleLabel} disabled className="pl-9 bg-muted" /></div>
                  <p className="text-[11px] text-muted-foreground">Managed by administrator</p>
                </div>
              </div>
              <Separator />
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => { setFormData({ name: profileData.name, phone: profileData.phone }); setSelectedFile(null); setPreviewUrl(''); }}>Cancel</Button>
                <Button onClick={handleProfileUpdate} disabled={isLoading}><Save className="h-4 w-4 mr-2" />{isLoading ? 'Saving…' : 'Save Changes'}</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Security Tab ── */}
        <TabsContent value="security" className="space-y-6">

          {/* Change Password */}
          <Card>
            <CardHeader><CardTitle>Change Password</CardTitle><CardDescription>Choose a strong password of at least 8 characters</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              {/* Current Password */}
              <div className="space-y-2">
                <Label>Current Password</Label>
                <div className="relative"><Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input type="password" value={pwd.currentPassword} onChange={e => setPwd(p => ({ ...p, currentPassword: e.target.value }))} className="pl-9" placeholder="Enter current password" /></div>
              </div>
              <Separator />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>New Password</Label>
                  <div className="relative"><Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input type="password" value={pwd.newPassword} onChange={e => { setPwd(p => ({ ...p, newPassword: e.target.value })); evaluatePasswordStrength(e.target.value); }} className="pl-9" placeholder="Minimum 8 characters" /></div>
                  {/* Password Strength Indicator */}
                  {pwd.newPassword && (
                    <div className="space-y-1">
                      <div className="flex gap-1">
                        {[1, 2, 3, 4, 5].map(i => (
                          <div key={i} className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${i <= passwordStrength.score ? passwordStrength.color : 'bg-gray-200 dark:bg-gray-700'}`} />
                        ))}
                      </div>
                      <p className={`text-xs ${passwordStrength.score >= 4 ? 'text-green-600 dark:text-green-400' : passwordStrength.score >= 3 ? 'text-yellow-600 dark:text-yellow-400' : 'text-red-600 dark:text-red-400'}`}>
                        {passwordStrength.label}
                      </p>
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Confirm New Password</Label>
                  <div className="relative"><Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input type="password" value={pwd.confirmPassword} onChange={e => setPwd(p => ({ ...p, confirmPassword: e.target.value }))} className="pl-9" placeholder="Re-enter new password" /></div>
                  {pwd.confirmPassword && pwd.newPassword !== pwd.confirmPassword && (
                    <p className="text-xs text-red-600 dark:text-red-400">Passwords do not match</p>
                  )}
                  {pwd.confirmPassword && pwd.newPassword === pwd.confirmPassword && pwd.confirmPassword.length >= 8 && (
                    <p className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1"><CheckCircle2 className="h-3 w-3" />Passwords match</p>
                  )}
                </div>
              </div>
              <div className="flex justify-end">
                <Button onClick={handlePasswordUpdate} disabled={isLoading || !pwd.currentPassword || !pwd.newPassword || !pwd.confirmPassword}><Shield className="h-4 w-4 mr-2" />{isLoading ? 'Updating…' : 'Update Password'}</Button>
              </div>
            </CardContent>
          </Card>

          {/* Two-Factor Authentication */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Smartphone className="h-5 w-5" />Two-Factor Authentication</CardTitle>
              <CardDescription>Add an authenticator app (Google Authenticator, Authy, etc.) for extra security</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {factors.filter(f => f.status === 'verified').length > 0 ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
                    <CheckCircle2 className="h-5 w-5" />
                    <span className="font-medium text-sm">2FA is enabled on your account</span>
                  </div>
                  {factors.filter(f => f.status === 'verified').map(f => (
                    <div key={f.id} className="flex items-center justify-between p-3 rounded-lg border bg-muted/40">
                      <div className="flex items-center gap-3">
                        <Smartphone className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="text-sm font-medium">{f.friendly_name || 'Authenticator App'}</p>
                          <p className="text-xs text-muted-foreground">TOTP · Active</p>
                        </div>
                      </div>
                      <Button size="sm" variant="destructive" onClick={() => unenroll2fa(f.id)}><Trash2 className="h-3.5 w-3.5 mr-1" />Remove</Button>
                    </div>
                  ))}
                </div>
              ) : !enrolling ? (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                    <AlertTriangle className="h-4 w-4" />
                    <span className="text-sm">2FA is not enabled. Your account is less secure.</span>
                  </div>
                  <Button onClick={startEnroll} className="w-fit"><Smartphone className="h-4 w-4 mr-2" />Set Up Authenticator App</Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">Scan this QR code with your authenticator app, then enter the 6-digit code to confirm.</p>
                  {qr && (
                    <div className="flex flex-col sm:flex-row gap-6 items-start">
                      <div className="border rounded-lg p-3 bg-white">
                        <img src={qr} alt="2FA QR Code" className="w-40 h-40" />
                      </div>
                      <div className="space-y-3 flex-1">
                        <p className="text-xs text-muted-foreground">Can't scan? Enter this code manually in your app:</p>
                        <div className="flex items-center gap-2">
                          <code className="text-xs bg-muted px-3 py-1.5 rounded font-mono break-all">{secret}</code>
                          <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={() => { navigator.clipboard.writeText(secret); toast({ title: 'Secret copied' }); }}>
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs">Enter 6-digit code from your app</Label>
                          <div className="flex gap-2">
                            <Input value={totpCode} onChange={e => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="000000" className="font-mono w-36 text-center text-lg tracking-widest" maxLength={6} />
                            <Button onClick={verifyEnroll} disabled={verifying2fa}>{verifying2fa ? 'Verifying…' : 'Confirm'}</Button>
                            <Button variant="outline" onClick={() => { setEnrolling(false); setQr(''); setSecret(''); setTotpCode(''); }}>Cancel</Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* WhatsApp 2FA */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <svg viewBox="0 0 24 24" className="h-5 w-5 fill-[#25D366]"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                WhatsApp 2FA
              </CardTitle>
              <CardDescription>Get a one-time code via WhatsApp every time you log in</CardDescription>
            </CardHeader>
            <CardContent>
              <WhatsAppMfaSettings />
            </CardContent>
          </Card>

          {/* Active Sessions */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2"><Monitor className="h-5 w-5" />Active Sessions</CardTitle>
                  <CardDescription>
                    Devices where your account is signed in (max {MAX_SESSIONS} allowed)
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={loadSessions} disabled={loadingSessions}><RefreshCw className={`h-3.5 w-3.5 mr-1 ${loadingSessions ? 'animate-spin' : ''}`} />Refresh</Button>
                  {sessions.filter(s => !s.is_current).length > 0 && (
                    <Button size="sm" variant="destructive" onClick={revokeAllOther}><Trash2 className="h-3.5 w-3.5 mr-1" />Revoke All Others</Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {sessions.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">No session history. Sessions are recorded on each login.</p>
              ) : (
                <div className="space-y-3">
                  {sessions.map(s => (
                    <div key={s.id} className={`flex items-start justify-between p-3 rounded-lg border ${s.is_current ? 'border-green-200 bg-green-50 dark:bg-green-900/20 dark:border-green-800' : 'bg-muted/30'}`}>
                      <div className="flex items-start gap-3 min-w-0">
                        <Monitor className={`h-4 w-4 mt-0.5 shrink-0 ${s.is_current ? 'text-green-600' : 'text-muted-foreground'}`} />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium truncate">{s.device_info || 'Unknown device'}</span>
                            {s.is_current && <Badge className="text-[10px] px-1.5 py-0 h-4 bg-green-600 text-white">Current</Badge>}
                          </div>
                          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                            {s.ip_address && <span className="text-xs text-muted-foreground">IP: {s.ip_address}</span>}
                            {s.location && <span className="text-xs text-muted-foreground">{s.location}</span>}
                            <span className="text-xs text-muted-foreground">
                              {new Date(s.last_active).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                        </div>
                      </div>
                      {!s.is_current && (
                        <Button size="sm" variant="ghost" className="text-red-600 hover:text-red-700 hover:bg-red-50 shrink-0 ml-2" onClick={() => revokeSession(s.id, s.is_current)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Preferences Tab ── */}
        <TabsContent value="preferences" className="space-y-6">
          <PreferencesPanel email={profileData.email} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
