'use client';

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Phone,
  Mail,
  Calendar,
  MessageSquare,
  FileText,
  ArrowRightLeft,
  Plus,
  Clock,
  User,
  MessageCircle,
  Flag,
  Edit,
  Trash2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  LeadConversation,
  getLeadConversations,
  addLeadConversation,
  updateLeadConversation,
  deleteLeadConversation,
} from "@/services/supabase/LeadConversationService";
import { addFollowup } from "@/services/supabase/FollowupFirebaseService";
import { updateLead } from "@/services/supabase/LeadFirebaseService";
import { useFollowupsData } from "@/contexts/FollowupsDataContext";
import { useLeadsData } from "@/contexts/LeadsDataContext";

interface Lead {
  id: string;
  name: string;
  companyName: string;
  email: string;
  phone: string;
  status: string;
}

interface LeadConversationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  lead: Lead | null;
}

interface TimelineEntry {
  id: string;
  type: string;
  title: string;
  description: string;
  outcome?: string;
  createdBy: string;
  createdAt: string;
  source: 'conversation' | 'followup';
  followupStatus?: string;
}

const typeConfig: Record<string, { icon: React.ElementType; color: string; bgColor: string; label: string }> = {
  call: { icon: Phone, color: "text-green-600", bgColor: "bg-green-100 dark:bg-green-900/30", label: "Phone Call" },
  email: { icon: Mail, color: "text-blue-600", bgColor: "bg-blue-100 dark:bg-blue-900/30", label: "Email" },
  meeting: { icon: Calendar, color: "text-purple-600", bgColor: "bg-purple-100 dark:bg-purple-900/30", label: "Meeting" },
  note: { icon: FileText, color: "text-gray-600", bgColor: "bg-gray-100 dark:bg-gray-900/30", label: "Note" },
  followup: { icon: Clock, color: "text-amber-600", bgColor: "bg-amber-100 dark:bg-amber-900/30", label: "Follow-up" },
  status_change: { icon: ArrowRightLeft, color: "text-red-600", bgColor: "bg-red-100 dark:bg-red-900/30", label: "Status Change" },
  whatsapp: { icon: MessageCircle, color: "text-emerald-600", bgColor: "bg-emerald-100 dark:bg-emerald-900/30", label: "WhatsApp" },
};

export function LeadConversationDrawer({ isOpen, onClose, lead }: LeadConversationDrawerProps) {
  const [conversations, setConversations] = useState<LeadConversation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newType, setNewType] = useState<string>("call");
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newOutcome, setNewOutcome] = useState("");
  const [entryDateTime, setEntryDateTime] = useState("");
  // Follow-up specific fields
  const [scheduledDateTime, setScheduledDateTime] = useState("");
  const [followupPriority, setFollowupPriority] = useState("Medium");
  const [isSaving, setIsSaving] = useState(false);
  const [isStatusChanging, setIsStatusChanging] = useState(false);
  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editOutcome, setEditOutcome] = useState("");
  const { toast } = useToast();
  const { followups } = useFollowupsData();
  const { refreshLeads } = useLeadsData();

  const isFollowupType = newType === 'followup';

  // localStorage key for this lead's conversations
  const getLocalStorageKey = (leadId: string) => `lead_conversations_${leadId}`;

  const getLocalConversations = useCallback((leadId: string): TimelineEntry[] => {
    try {
      const stored = localStorage.getItem(getLocalStorageKey(leadId));
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }, []);

  const saveLocalConversation = (leadId: string, entry: TimelineEntry) => {
    const existing = getLocalConversations(leadId);
    existing.unshift(entry);
    localStorage.setItem(getLocalStorageKey(leadId), JSON.stringify(existing));
  };

  const removeLocalConversation = (leadId: string, entryId: string) => {
    const existing = getLocalConversations(leadId);
    const filtered = existing.filter(e => e.id !== entryId);
    localStorage.setItem(getLocalStorageKey(leadId), JSON.stringify(filtered));
  };

  const fetchConversations = useCallback(async () => {
    if (!lead?.id) return;
    setIsLoading(true);
    const result = await getLeadConversations(lead.id);
    if (result.success) {
      setConversations(result.data);
    }
    setIsLoading(false);
  }, [lead?.id]);

  useEffect(() => {
    if (isOpen && lead?.id) {
      fetchConversations();
    }
    if (!isOpen) {
      setShowAddForm(false);
      setEditingId(null);
      resetForm();
    }
  }, [isOpen, lead?.id, fetchConversations]);

  const resetForm = () => {
    setNewTitle("");
    setNewDescription("");
    setNewOutcome("");
    setNewType("call");
    setEntryDateTime("");
    setScheduledDateTime("");
    setFollowupPriority("Medium");
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!lead?.id || newStatus === lead.status) return;
    setIsStatusChanging(true);
    const oldStatus = lead.status;

    const result = await updateLead(lead.id, { status: newStatus });
    if (result.success) {
      toast({ title: "Status Updated", description: `Changed from "${oldStatus}" to "${newStatus}"` });
      await addLeadConversation({
        leadId: lead.id,
        type: 'status_change',
        title: `Status changed to ${newStatus}`,
        description: `Changed from "${oldStatus}" to "${newStatus}"`,
        outcome: newStatus,
        createdBy: localStorage.getItem('userName') || 'Admin',
      });
      refreshLeads();
      fetchConversations();
    } else {
      toast({ title: "Error", description: result.error || "Failed to update status", variant: "destructive" });
    }
    setIsStatusChanging(false);
  };

  const handleAddEntry = async () => {
    if (!lead?.id || !newTitle.trim()) return;
    setIsSaving(true);

    const userName = localStorage.getItem('userName') || 'Admin';
    const now = new Date().toISOString();
    // Use the user-specified date/time or current time
    const entryTime = entryDateTime ? new Date(entryDateTime).toISOString() : now;

    if (isFollowupType) {
      const followupData = {
        contact: lead.name,
        company: lead.companyName,
        email: lead.email,
        phone: lead.phone,
        type: 'Call',
        priority: followupPriority,
        dateTime: scheduledDateTime || now,
        subject: newTitle.trim(),
        status: 'Pending',
        notes: newDescription.trim(),
        leadId: lead.id,
      };

      const result = await addFollowup(followupData);
      if (result.success) {
        toast({ title: "Follow-up Scheduled", description: `Follow-up with ${lead.name} scheduled successfully.` });
      } else {
        saveLocalConversation(lead.id, {
          id: `local-${Date.now()}`,
          type: 'followup',
          title: newTitle.trim(),
          description: newDescription.trim() || `Scheduled for ${new Date(scheduledDateTime).toLocaleString('en-IN')}`,
          outcome: `Priority: ${followupPriority}`,
          createdBy: userName,
          createdAt: entryTime,
          source: 'conversation',
        });
        toast({ title: "Follow-up Saved", description: "Saved locally." });
      }
      await addLeadConversation({
        leadId: lead.id,
        type: 'followup',
        title: newTitle.trim(),
        description: newDescription.trim() || `Scheduled for ${new Date(scheduledDateTime).toLocaleString('en-IN')}`,
        outcome: `Priority: ${followupPriority}`,
        createdBy: userName,
      });
      resetForm();
      setShowAddForm(false);
      fetchConversations();
    } else {
      const result = await addLeadConversation({
        leadId: lead.id,
        type: newType as LeadConversation['type'],
        title: newTitle.trim(),
        description: newDescription.trim(),
        outcome: newOutcome.trim(),
        createdBy: userName,
      });

      if (result.success && result.tableExists !== false) {
        toast({ title: "Added", description: "Conversation entry added successfully." });
      } else {
        saveLocalConversation(lead.id, {
          id: `local-${Date.now()}`,
          type: newType,
          title: newTitle.trim(),
          description: newDescription.trim(),
          outcome: newOutcome.trim(),
          createdBy: userName,
          createdAt: entryTime,
          source: 'conversation',
        });
        toast({ title: "Saved", description: "Conversation entry saved locally." });
      }
      resetForm();
      setShowAddForm(false);
      fetchConversations();
    }
    setIsSaving(false);
  };

  const handleEditSave = async (entryId: string, source: string) => {
    if (source === 'conversation') {
      const result = await updateLeadConversation(entryId, {
        title: editTitle.trim(),
        description: editDescription.trim(),
        outcome: editOutcome.trim(),
      });
      if (result.success) {
        toast({ title: "Updated", description: "Entry updated successfully." });
        fetchConversations();
      } else {
        toast({ title: "Error", description: result.error || "Failed to update", variant: "destructive" });
      }
    } else {
      // Local entry — update in localStorage
      if (lead?.id) {
        const entries = getLocalConversations(lead.id);
        const updated = entries.map(e => e.id === entryId ? { ...e, title: editTitle.trim(), description: editDescription.trim(), outcome: editOutcome.trim() } : e);
        localStorage.setItem(getLocalStorageKey(lead.id), JSON.stringify(updated));
        toast({ title: "Updated", description: "Entry updated." });
      }
    }
    setEditingId(null);
  };

  const handleDelete = async (entryId: string, source: string) => {
    if (source === 'conversation') {
      const result = await deleteLeadConversation(entryId);
      if (result.success) {
        toast({ title: "Deleted", description: "Entry removed." });
        fetchConversations();
      } else {
        toast({ title: "Error", description: result.error || "Failed to delete", variant: "destructive" });
      }
    } else if (lead?.id) {
      // Local entry
      removeLocalConversation(lead.id, entryId);
      toast({ title: "Deleted", description: "Entry removed." });
      fetchConversations();
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return 'Unknown date';
    return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return '';
    return date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  };

  const formatFullDateTime = (dateStr: string) => {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return '';
    return date.toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  // Merge conversations from DB + follow-ups + localStorage into a unified timeline
  const timelineEntries: TimelineEntry[] = useMemo(() => {
    if (!lead?.id) return [];

    const convEntries: TimelineEntry[] = conversations.map(c => ({
      id: c.id,
      type: c.type,
      title: c.title,
      description: c.description,
      outcome: c.outcome,
      createdBy: c.createdBy,
      createdAt: c.createdAt,
      source: 'conversation' as const,
    }));

    const followupEntries: TimelineEntry[] = followups
      .filter(f => {
        if (f.leadId === lead.id) return true;
        if (!f.leadId && f.contact && lead.name && f.contact.toLowerCase() === lead.name.toLowerCase()) return true;
        return false;
      })
      .map(f => ({
        id: f.id,
        type: f.type?.toLowerCase() || 'followup',
        title: f.subject || `${f.type || 'Follow-up'} with ${f.contact}`,
        description: f.notes || '',
        outcome: f.status === 'Completed' ? 'Completed' : undefined,
        createdBy: 'System',
        createdAt: f.dateTime || (f.createdAt instanceof Date ? f.createdAt.toISOString() : String(f.createdAt || '')),
        source: 'followup' as const,
        followupStatus: f.status,
      }));

    const localEntries = getLocalConversations(lead.id);
    const convTitles = new Set(convEntries.map(c => c.title.toLowerCase()));
    const dedupedFollowups = followupEntries.filter(f => !convTitles.has(f.title.toLowerCase()));

    const all = [...convEntries, ...dedupedFollowups, ...localEntries];
    all.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return all;
  }, [conversations, followups, lead, getLocalConversations]);

  const groupedEntries = useMemo(() => {
    return timelineEntries.reduce<Record<string, TimelineEntry[]>>((groups, entry) => {
      const dateKey = formatDate(entry.createdAt);
      if (!groups[dateKey]) groups[dateKey] = [];
      groups[dateKey].push(entry);
      return groups;
    }, {});
  }, [timelineEntries]);

  return (
    <Sheet open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-lg p-0 flex flex-col">
        {/* Header */}
        <div className="p-6 pb-4 border-b">
          <SheetHeader>
            <SheetTitle className="text-lg font-semibold flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-red-600" />
              Conversation History
            </SheetTitle>
            <SheetDescription className="text-sm text-muted-foreground">
              {lead?.name} {lead?.companyName ? `• ${lead.companyName}` : ''}
            </SheetDescription>
          </SheetHeader>

          {/* Status Selector */}
          <div className="mt-3 flex items-center gap-3">
            <Label className="text-xs font-medium text-gray-500 shrink-0">Status:</Label>
            <Select value={lead?.status || ''} onValueChange={handleStatusChange} disabled={isStatusChanging}>
              <SelectTrigger className="h-8 w-[160px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="New Lead">New Lead</SelectItem>
                <SelectItem value="Qualified Lead">Qualified Lead</SelectItem>
                <SelectItem value="Opportunity">Opportunity</SelectItem>
                <SelectItem value="Client">Client</SelectItem>
                <SelectItem value="Inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
            {isStatusChanging && <span className="text-xs text-gray-400">Updating...</span>}
          </div>

          {/* Add Entry Button */}
          <Button size="sm" className="mt-3 bg-red-600 hover:bg-red-700 text-white" onClick={() => setShowAddForm(!showAddForm)}>
            <Plus className="h-4 w-4 mr-1" />
            {showAddForm ? "Cancel" : "Log Interaction"}
          </Button>
        </div>

        {/* Add Form */}
        {showAddForm && (
          <div className="p-4 border-b bg-gray-50 dark:bg-gray-900/50 space-y-3 max-h-[45vh] overflow-y-auto">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-gray-600">Type</Label>
              <Select value={newType} onValueChange={setNewType}>
                <SelectTrigger className="w-full h-9">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="call">Phone Call</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="meeting">Meeting</SelectItem>
                  <SelectItem value="whatsapp">WhatsApp</SelectItem>
                  <SelectItem value="followup">Schedule Follow-up</SelectItem>
                  <SelectItem value="note">Note</SelectItem>
                  <SelectItem value="status_change">Status Change</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-gray-600">
                {isFollowupType ? 'Subject' : 'Title'}
              </Label>
              <Input
                placeholder={isFollowupType ? "e.g., Discuss contract terms" : "e.g., Discussed pricing"}
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                className="h-9"
              />
            </div>

            {/* Date & Time of interaction */}
            {!isFollowupType && (
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-gray-600 flex items-center gap-1">
                  <Calendar className="h-3 w-3" /> Date & Time of Interaction
                </Label>
                <Input
                  type="datetime-local"
                  value={entryDateTime}
                  onChange={(e) => setEntryDateTime(e.target.value)}
                  className="h-9 text-sm"
                />
                <p className="text-[10px] text-gray-400">Leave empty to use current time</p>
              </div>
            )}

            {/* Follow-up specific fields */}
            {isFollowupType && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-gray-600 flex items-center gap-1">
                    <Calendar className="h-3 w-3" /> Schedule Date & Time
                  </Label>
                  <Input
                    type="datetime-local"
                    value={scheduledDateTime}
                    onChange={(e) => setScheduledDateTime(e.target.value)}
                    className="h-9 text-sm"
                    min={new Date().toISOString().slice(0, 16)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-gray-600 flex items-center gap-1">
                    <Flag className="h-3 w-3" /> Priority
                  </Label>
                  <Select value={followupPriority} onValueChange={setFollowupPriority}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Low">Low</SelectItem>
                      <SelectItem value="Medium">Medium</SelectItem>
                      <SelectItem value="High">High</SelectItem>
                      <SelectItem value="Critical">Critical</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-gray-600">
                {isFollowupType ? 'Notes (optional)' : 'Description'}
              </Label>
              <Textarea
                placeholder={isFollowupType ? "Any additional notes..." : "Conversation details..."}
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                rows={2}
                className="text-sm"
              />
            </div>

            {!isFollowupType && (
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-gray-600">Outcome (optional)</Label>
                <Input
                  placeholder="e.g., Client agreed to meeting"
                  value={newOutcome}
                  onChange={(e) => setNewOutcome(e.target.value)}
                  className="h-9"
                />
              </div>
            )}

            <Button
              size="sm"
              onClick={handleAddEntry}
              disabled={isSaving || !newTitle.trim() || (isFollowupType && !scheduledDateTime)}
              className="w-full bg-red-600 hover:bg-red-700 text-white"
            >
              {isSaving ? "Saving..." : isFollowupType ? "Schedule Follow-up" : "Save Entry"}
            </Button>
          </div>
        )}

        {/* Timeline */}
        <ScrollArea className="flex-1 p-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-600" />
            </div>
          ) : timelineEntries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <MessageSquare className="h-12 w-12 text-gray-300 mb-3" />
              <p className="text-gray-500 font-medium">No conversations yet</p>
              <p className="text-sm text-gray-400 mt-1">Click &quot;Log Interaction&quot; to record the first entry</p>
            </div>
          ) : (
            <div className="space-y-6">
              {Object.entries(groupedEntries).map(([date, items]) => (
                <div key={date}>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="h-px flex-1 bg-gray-200 dark:bg-gray-700" />
                    <span className="text-xs font-medium text-gray-500 px-2">{date}</span>
                    <div className="h-px flex-1 bg-gray-200 dark:bg-gray-700" />
                  </div>

                  <div className="relative">
                    <div className="absolute left-[18px] top-2 bottom-2 w-0.5 bg-gray-200 dark:bg-gray-700" />

                    <div className="space-y-4">
                      {items.map((entry) => {
                        const config = typeConfig[entry.type] || typeConfig.note;
                        const Icon = config.icon;
                        const isEditing = editingId === entry.id;

                        return (
                          <div key={`${entry.source}-${entry.id}`} className="relative flex gap-3">
                            <div className={`relative z-10 flex items-center justify-center w-9 h-9 rounded-full ${config.bgColor} shrink-0`}>
                              <Icon className={`h-4 w-4 ${config.color}`} />
                            </div>

                            <div className="flex-1 min-w-0 bg-white dark:bg-gray-800 rounded-lg border p-3 shadow-xs">
                              {isEditing ? (
                                /* Edit mode */
                                <div className="space-y-2">
                                  <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className="h-8 text-sm" placeholder="Title" />
                                  <Textarea value={editDescription} onChange={(e) => setEditDescription(e.target.value)} rows={2} className="text-sm" placeholder="Description" />
                                  <Input value={editOutcome} onChange={(e) => setEditOutcome(e.target.value)} className="h-8 text-sm" placeholder="Outcome" />
                                  <div className="flex gap-2">
                                    <Button size="sm" className="h-7 text-xs bg-red-600 hover:bg-red-700 text-white" onClick={() => handleEditSave(entry.id, entry.source)}>Save</Button>
                                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setEditingId(null)}>Cancel</Button>
                                  </div>
                                </div>
                              ) : (
                                /* View mode */
                                <>
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                      <p className="font-medium text-sm truncate">{entry.title}</p>
                                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                        <Badge variant="outline" className="text-[10px]">{config.label}</Badge>
                                        {entry.source === 'followup' && entry.followupStatus && (
                                          <Badge
                                            className={`text-[10px] ${
                                              entry.followupStatus === 'Completed' ? 'bg-green-100 text-green-700 border-green-300' :
                                              entry.followupStatus === 'Overdue' ? 'bg-red-100 text-red-700 border-red-300' :
                                              'bg-amber-100 text-amber-700 border-amber-300'
                                            }`}
                                            variant="outline"
                                          >
                                            {entry.followupStatus}
                                          </Badge>
                                        )}
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0">
                                      {entry.source !== 'followup' && (
                                        <>
                                          <Button variant="ghost" size="icon" className="h-6 w-6 text-gray-400 hover:text-blue-600"
                                            onClick={() => { setEditingId(entry.id); setEditTitle(entry.title); setEditDescription(entry.description); setEditOutcome(entry.outcome || ''); }}>
                                            <Edit className="h-3 w-3" />
                                          </Button>
                                          <Button variant="ghost" size="icon" className="h-6 w-6 text-gray-400 hover:text-red-600"
                                            onClick={() => handleDelete(entry.id, entry.source)}>
                                            <Trash2 className="h-3 w-3" />
                                          </Button>
                                        </>
                                      )}
                                    </div>
                                  </div>

                                  {entry.description && (
                                    <p className="text-sm text-gray-600 dark:text-gray-300 mt-2 line-clamp-3">{entry.description}</p>
                                  )}

                                  {entry.outcome && (
                                    <div className="mt-2 flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                                      <span className="font-medium">Outcome:</span> {entry.outcome}
                                    </div>
                                  )}

                                  {/* Audit info: who + when */}
                                  <div className="mt-2 flex items-center justify-between">
                                    <div className="flex items-center gap-1 text-[11px] text-gray-400">
                                      <User className="h-3 w-3" />
                                      {entry.createdBy}
                                    </div>
                                    <span className="text-[10px] text-gray-400">
                                      {formatFullDateTime(entry.createdAt)}
                                    </span>
                                  </div>
                                </>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
