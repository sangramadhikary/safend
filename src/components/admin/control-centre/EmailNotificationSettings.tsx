'use client';

import { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import {
  Bell, Mail, Clock, Save, Plus, Trash2, Send, CheckCircle2,
  AlertCircle, Calendar, Users, FileText, Shield, TrendingUp
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabaseClient } from "@/integrations/supabase/client";

interface NotificationRule {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  frequency: 'realtime' | 'daily' | 'weekly' | 'monthly';
  time?: string; // HH:MM for scheduled
  day?: string; // day of week for weekly
  recipients: string[];
  category: 'operations' | 'hr' | 'sales' | 'accounts' | 'security' | 'system';
  trigger: string;
}

const DEFAULT_RULES: NotificationRule[] = [
  {
    id: 'n1',
    name: 'Daily Attendance Summary',
    description: 'Send attendance report for all posts every evening',
    enabled: true,
    frequency: 'daily',
    time: '20:00',
    recipients: ['admin@safends.com'],
    category: 'operations',
    trigger: 'attendance_summary',
  },
  {
    id: 'n2',
    name: 'Rota Not Planned Alert',
    description: 'Alert when tomorrow\'s rota is not planned by 6 PM',
    enabled: true,
    frequency: 'daily',
    time: '18:00',
    recipients: ['admin@safends.com', 'operations@safends.com'],
    category: 'operations',
    trigger: 'rota_not_planned',
  },
  {
    id: 'n3',
    name: 'Weekly Payroll Summary',
    description: 'Summary of pending payroll, held salaries, and advances',
    enabled: true,
    frequency: 'weekly',
    day: 'saturday',
    time: '10:00',
    recipients: ['admin@safends.com', 'accounts@safends.com'],
    category: 'accounts',
    trigger: 'payroll_summary',
  },
  {
    id: 'n4',
    name: 'New Lead Notification',
    description: 'Immediate email when a new lead/enquiry comes in',
    enabled: true,
    frequency: 'realtime',
    recipients: ['admin@safends.com', 'sales@safends.com'],
    category: 'sales',
    trigger: 'new_lead',
  },
  {
    id: 'n5',
    name: 'Invoice Overdue Alert',
    description: 'Daily reminder for invoices past due date',
    enabled: true,
    frequency: 'daily',
    time: '09:00',
    recipients: ['admin@safends.com', 'accounts@safends.com'],
    category: 'accounts',
    trigger: 'invoice_overdue',
  },
  {
    id: 'n6',
    name: 'Employee Leave Request',
    description: 'Notify HR when an employee submits a leave request',
    enabled: true,
    frequency: 'realtime',
    recipients: ['hr@safends.com'],
    category: 'hr',
    trigger: 'leave_request',
  },
  {
    id: 'n7',
    name: 'Security Login Alert',
    description: 'Alert on failed login attempts or suspicious activity',
    enabled: true,
    frequency: 'realtime',
    recipients: ['admin@safends.com'],
    category: 'security',
    trigger: 'security_alert',
  },
  {
    id: 'n8',
    name: 'Monthly Revenue Report',
    description: 'Send monthly revenue, collections, and outstanding summary',
    enabled: true,
    frequency: 'monthly',
    day: '1',
    time: '09:00',
    recipients: ['admin@safends.com'],
    category: 'accounts',
    trigger: 'monthly_revenue',
  },
  {
    id: 'n9',
    name: 'Contract Renewal Reminder',
    description: 'Notify 30 days before a client contract expires',
    enabled: true,
    frequency: 'daily',
    time: '10:00',
    recipients: ['admin@safends.com', 'sales@safends.com'],
    category: 'sales',
    trigger: 'contract_renewal',
  },
  {
    id: 'n10',
    name: 'Vacancy Alert',
    description: 'Alert when post vacancy exceeds 20% for the day',
    enabled: true,
    frequency: 'daily',
    time: '12:00',
    recipients: ['admin@safends.com', 'operations@safends.com'],
    category: 'operations',
    trigger: 'vacancy_alert',
  },
];

const CATEGORY_CONFIG: Record<string, { icon: typeof Bell; color: string; label: string }> = {
  operations: { icon: Shield, color: 'text-blue-600 bg-blue-50 border-blue-200', label: 'Operations' },
  hr: { icon: Users, color: 'text-purple-600 bg-purple-50 border-purple-200', label: 'HR' },
  sales: { icon: TrendingUp, color: 'text-green-600 bg-green-50 border-green-200', label: 'Sales' },
  accounts: { icon: FileText, color: 'text-orange-600 bg-orange-50 border-orange-200', label: 'Accounts' },
  security: { icon: Shield, color: 'text-red-600 bg-red-50 border-red-200', label: 'Security' },
  system: { icon: Bell, color: 'text-gray-600 bg-gray-50 border-gray-200', label: 'System' },
};

const FREQUENCY_LABELS: Record<string, string> = {
  realtime: 'Real-time',
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
};

export function EmailNotificationSettings() {
  const [rules, setRules] = useState<NotificationRule[]>(DEFAULT_RULES);
  const [isSaving, setIsSaving] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const { toast } = useToast();

  const toggleRule = (id: string) => {
    setRules(rules.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r));
  };

  const updateRecipients = (id: string, value: string) => {
    const emails = value.split(',').map(e => e.trim()).filter(Boolean);
    setRules(rules.map(r => r.id === id ? { ...r, recipients: emails } : r));
  };

  const updateTime = (id: string, time: string) => {
    setRules(rules.map(r => r.id === id ? { ...r, time } : r));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // Store notification rules in a simple key-value or settings table
      // For now, we'll persist to localStorage as a quick solution
      // In production, this would go to a notification_rules table
      localStorage.setItem('notification_rules', JSON.stringify(rules));
      toast({ title: "Saved", description: "Notification settings saved successfully" });
    } catch {
      toast({ title: "Error", description: "Failed to save settings", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestEmail = async (rule: NotificationRule) => {
    setTestingId(rule.id);
    try {
      const response = await fetch('/api/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: rule.recipients[0],
          subject: `[TEST] ${rule.name}`,
          html: `<h2>Test Notification</h2><p>This is a test email for the notification rule: <strong>${rule.name}</strong></p><p>${rule.description}</p><p><em>Frequency: ${FREQUENCY_LABELS[rule.frequency]}</em></p><hr/><p style="color:#666;font-size:12px;">Sent from Safend ERP Notification System</p>`,
        }),
      });

      if (response.ok) {
        toast({ title: "Test Email Sent", description: `Sent to ${rule.recipients[0]}` });
      } else {
        const data = await response.json();
        toast({ title: "Failed", description: data.error || "Could not send test email", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Network error sending test email", variant: "destructive" });
    } finally {
      setTestingId(null);
    }
  };

  // Load saved rules on mount
  useEffect(() => {
    const saved = localStorage.getItem('notification_rules');
    if (saved) {
      try { setRules(JSON.parse(saved)); } catch {}
    }
  }, []);

  const enabledCount = rules.filter(r => r.enabled).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-xl font-bold flex items-center gap-2">
                <Mail className="h-5 w-5 text-red-600" />
                Email Notifications
              </CardTitle>
              <CardDescription>
                Configure periodic email reports and real-time alerts sent via Resend
              </CardDescription>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant="outline" className="text-sm">
                {enabledCount}/{rules.length} active
              </Badge>
              <Button onClick={handleSave} disabled={isSaving} className="gap-2">
                <Save className="h-4 w-4" />
                {isSaving ? 'Saving...' : 'Save All'}
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Notification Rules */}
      <div className="space-y-3">
        {rules.map((rule) => {
          const catConfig = CATEGORY_CONFIG[rule.category] || CATEGORY_CONFIG.system;
          const CatIcon = catConfig.icon;

          return (
            <Card key={rule.id} className={`transition-all ${!rule.enabled ? 'opacity-60' : ''}`}>
              <CardContent className="p-4">
                <div className="flex items-start gap-4">
                  {/* Toggle */}
                  <Switch
                    checked={rule.enabled}
                    onCheckedChange={() => toggleRule(rule.id)}
                    className="mt-1"
                  />

                  {/* Content */}
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-semibold text-sm">{rule.name}</h4>
                      <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${catConfig.color}`}>
                        {catConfig.label}
                      </Badge>
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                        <Clock className="h-2.5 w-2.5 mr-0.5" />
                        {FREQUENCY_LABELS[rule.frequency]}
                        {rule.time && ` at ${rule.time}`}
                        {rule.frequency === 'weekly' && rule.day && ` (${rule.day})`}
                        {rule.frequency === 'monthly' && rule.day && ` (day ${rule.day})`}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{rule.description}</p>

                    {/* Recipients */}
                    <div className="flex items-center gap-2">
                      <Mail className="h-3 w-3 text-muted-foreground shrink-0" />
                      <Input
                        value={rule.recipients.join(', ')}
                        onChange={(e) => updateRecipients(rule.id, e.target.value)}
                        placeholder="email1@company.com, email2@company.com"
                        className="h-7 text-xs"
                        disabled={!rule.enabled}
                      />
                    </div>

                    {/* Time config for scheduled */}
                    {rule.frequency !== 'realtime' && (
                      <div className="flex items-center gap-2">
                        <Clock className="h-3 w-3 text-muted-foreground shrink-0" />
                        <Input
                          type="time"
                          value={rule.time || '09:00'}
                          onChange={(e) => updateTime(rule.id, e.target.value)}
                          className="h-7 text-xs w-28"
                          disabled={!rule.enabled}
                        />
                        <span className="text-[10px] text-muted-foreground">IST</span>
                      </div>
                    )}
                  </div>

                  {/* Test button */}
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0 h-8 text-xs gap-1"
                    onClick={() => handleTestEmail(rule)}
                    disabled={!rule.enabled || testingId === rule.id}
                  >
                    <Send className="h-3 w-3" />
                    {testingId === rule.id ? 'Sending...' : 'Test'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Info Card */}
      <Card className="bg-muted/30">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
            <div className="text-xs text-muted-foreground space-y-1">
              <p><strong>How it works:</strong> Emails are sent via Resend (domain: update.safends.com).</p>
              <p><strong>Real-time:</strong> Sent immediately when the event occurs.</p>
              <p><strong>Scheduled:</strong> Sent at the configured time daily/weekly/monthly via Vercel Cron.</p>
              <p><strong>Recipients:</strong> Comma-separated emails. Each rule can have multiple recipients.</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
