'use client';
import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Clock, Calendar, User, Building2, Mail, Phone, Flag, CheckCircle, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ScheduleFollowupModalProps {
  isOpen: boolean;
  onClose: () => void;
  clientName: string;
  companyName: string;
  clientEmail?: string;
  clientPhone?: string;
  priority?: string;
  onSave: (followup: FollowupData) => void;
}

export interface FollowupData {
  contact: string;
  company: string;
  email?: string;
  phone?: string;
  type: string;
  priority: string;
  dateTime: string;
  subject: string;
  status: string;
  notes?: string;
}

export function ScheduleFollowupModal({ 
  isOpen, 
  onClose, 
  clientName, 
  companyName,
  clientEmail = "",
  clientPhone = "",
  priority = "Medium",
  onSave 
}: ScheduleFollowupModalProps) {
  const { toast } = useToast();
  
  // Get current date and time
  const now = new Date();
  const currentDateTime = now.toISOString().slice(0, 16);
  const displayDateTime = now.toLocaleString('en-IN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });

  const [status, setStatus] = useState("Pending");
  const [followupPriority, setFollowupPriority] = useState(priority);
  const [subject, setSubject] = useState(`Follow-up with ${clientName}`);
  const [followupType, setFollowupType] = useState("Call");
  const [scheduledDateTime, setScheduledDateTime] = useState(currentDateTime);
  const [email, setEmail] = useState(clientEmail);
  const [phone, setPhone] = useState(clientPhone);
  const [notes, setNotes] = useState("");

  const handleSave = () => {
    const followupData: FollowupData = {
      contact: clientName,
      company: companyName,
      email: email,
      phone: phone,
      type: followupType,
      priority: followupPriority,
      dateTime: scheduledDateTime,
      subject: subject,
      status: status,
      notes: notes
    };

    onSave(followupData);
    onClose();
  };

  const getPriorityColor = (p: string) => {
    switch (p) {
      case 'Critical': return 'text-[#D71920] bg-red-50 border-[#D71920]';
      case 'High': return 'text-orange-600 bg-orange-50 border-orange-400';
      case 'Medium': return 'text-yellow-600 bg-yellow-50 border-yellow-400';
      case 'Low': return 'text-green-600 bg-green-50 border-green-400';
      default: return 'text-gray-600 bg-gray-50 border-gray-400';
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl bg-white dark:bg-[#0a0a0a] border-2 border-[#D71920]/20" preventOutsideClose={true}>
        {/* Header with Red Accent */}
        <DialogHeader className="border-b border-[#D71920]/20 pb-4">
          <DialogTitle className="flex items-center gap-3 text-xl">
            <div className="p-2 bg-[#D71920] rounded-lg">
              <Clock className="h-5 w-5 text-white" />
            </div>
            <span className="text-[#000000] dark:text-white">Schedule Follow-up</span>
          </DialogTitle>
          <DialogDescription className="text-[#4A4A4A] dark:text-gray-400 mt-1">
            Create a follow-up reminder for this client
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 mt-4 max-h-[70vh] overflow-y-auto pr-2">
          {/* Client Info Card - Full Width */}
          <div className="bg-linear-to-r from-[#D71920]/10 to-[#000000]/5 dark:from-[#D71920]/20 dark:to-[#1a1a1a] p-5 rounded-xl border border-[#D71920]/30">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-[#D71920] rounded-full">
                <User className="h-6 w-6 text-white" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-[#D71920] uppercase tracking-wide">Client Information</p>
                <p className="text-2xl font-bold text-[#000000] dark:text-white mt-1">{clientName}</p>
                <div className="flex items-center gap-2 mt-1">
                  <Building2 className="h-4 w-4 text-[#4A4A4A]" />
                  <p className="text-[#4A4A4A] dark:text-gray-400">{companyName}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Current Time Banner */}
          <div className="bg-[#000000] dark:bg-[#1a1a1a] p-4 rounded-xl border border-[#4A4A4A]/30">
            <div className="flex items-center justify-center gap-3">
              <Calendar className="h-5 w-5 text-[#D71920]" />
              <p className="text-lg font-semibold text-white">
                Current Time: <span className="text-[#D71920]">{displayDateTime}</span>
              </p>
            </div>
          </div>

          {/* Contact Details Row - 2 Columns */}
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="email" className="flex items-center gap-2 text-[#000000] dark:text-white font-medium">
                <Mail className="h-4 w-4 text-[#D71920]" />
                Contact Email
              </Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter contact email"
                className="h-12 bg-[#F5F5F5] dark:bg-[#1a1a1a] border-2 border-[#4A4A4A]/30 focus:border-[#D71920] text-[#000000] dark:text-white placeholder:text-[#6C757D]"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone" className="flex items-center gap-2 text-[#000000] dark:text-white font-medium">
                <Phone className="h-4 w-4 text-[#D71920]" />
                Contact Phone
              </Label>
              <Input
                id="phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Enter contact phone"
                className="h-12 bg-[#F5F5F5] dark:bg-[#1a1a1a] border-2 border-[#4A4A4A]/30 focus:border-[#D71920] text-[#000000] dark:text-white placeholder:text-[#6C757D]"
              />
            </div>
          </div>

          {/* Follow-up Type & Priority Row - 2 Columns */}
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="followup-type" className="flex items-center gap-2 text-[#000000] dark:text-white font-medium">
                <FileText className="h-4 w-4 text-[#D71920]" />
                Follow-up Type
              </Label>
              <Select value={followupType} onValueChange={setFollowupType}>
                <SelectTrigger id="followup-type" className="h-12 bg-[#F5F5F5] dark:bg-[#1a1a1a] border-2 border-[#4A4A4A]/30 focus:border-[#D71920] text-[#000000] dark:text-white">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent className="bg-white dark:bg-[#1a1a1a] border-[#D71920]/30">
                  <SelectItem value="Call" className="hover:bg-[#D71920]/10">📞 Call</SelectItem>
                  <SelectItem value="Email" className="hover:bg-[#D71920]/10">📧 Email</SelectItem>
                  <SelectItem value="Meeting" className="hover:bg-[#D71920]/10">🤝 Meeting</SelectItem>
                  <SelectItem value="Visit" className="hover:bg-[#D71920]/10">🏢 Site Visit</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="priority" className="flex items-center gap-2 text-[#000000] dark:text-white font-medium">
                <Flag className="h-4 w-4 text-[#D71920]" />
                Priority
              </Label>
              <Select value={followupPriority} onValueChange={setFollowupPriority}>
                <SelectTrigger id="priority" className={`h-12 border-2 ${getPriorityColor(followupPriority)}`}>
                  <SelectValue placeholder="Select priority" />
                </SelectTrigger>
                <SelectContent className="bg-white dark:bg-[#1a1a1a] border-[#D71920]/30">
                  <SelectItem value="Low" className="hover:bg-green-50">🟢 Low</SelectItem>
                  <SelectItem value="Medium" className="hover:bg-yellow-50">🟡 Medium</SelectItem>
                  <SelectItem value="High" className="hover:bg-orange-50">🟠 High</SelectItem>
                  <SelectItem value="Critical" className="hover:bg-red-50">🔴 Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Status & Scheduled DateTime Row - 2 Columns */}
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="status" className="flex items-center gap-2 text-[#000000] dark:text-white font-medium">
                <CheckCircle className="h-4 w-4 text-[#D71920]" />
                Status
              </Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger id="status" className="h-12 bg-[#F5F5F5] dark:bg-[#1a1a1a] border-2 border-[#4A4A4A]/30 focus:border-[#D71920] text-[#000000] dark:text-white">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent className="bg-white dark:bg-[#1a1a1a] border-[#D71920]/30">
                  <SelectItem value="Pending" className="hover:bg-[#D71920]/10">⏳ Pending</SelectItem>
                  <SelectItem value="Completed" className="hover:bg-[#D71920]/10">✅ Completed</SelectItem>
                  <SelectItem value="Overdue" className="hover:bg-[#D71920]/10">⚠️ Overdue</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="scheduled-datetime" className="flex items-center gap-2 text-[#000000] dark:text-white font-medium">
                <Calendar className="h-4 w-4 text-[#D71920]" />
                Scheduled Date & Time
              </Label>
              <Input
                id="scheduled-datetime"
                type="datetime-local"
                value={scheduledDateTime}
                onChange={(e) => setScheduledDateTime(e.target.value)}
                className="h-12 bg-[#F5F5F5] dark:bg-[#1a1a1a] border-2 border-[#4A4A4A]/30 focus:border-[#D71920] text-[#000000] dark:text-white"
              />
            </div>
          </div>

          {/* Subject - Full Width */}
          <div className="space-y-2">
            <Label htmlFor="subject" className="flex items-center gap-2 text-[#000000] dark:text-white font-medium">
              <FileText className="h-4 w-4 text-[#D71920]" />
              Subject
            </Label>
            <Input
              id="subject"
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Enter follow-up subject"
              className="h-12 bg-[#F5F5F5] dark:bg-[#1a1a1a] border-2 border-[#4A4A4A]/30 focus:border-[#D71920] text-[#000000] dark:text-white placeholder:text-[#6C757D]"
            />
          </div>

          {/* Notes - Full Width */}
          <div className="space-y-2">
            <Label htmlFor="notes" className="flex items-center gap-2 text-[#000000] dark:text-white font-medium">
              <FileText className="h-4 w-4 text-[#D71920]" />
              Notes (Optional)
            </Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add any additional notes for this follow-up..."
              rows={3}
              className="bg-[#F5F5F5] dark:bg-[#1a1a1a] border-2 border-[#4A4A4A]/30 focus:border-[#D71920] text-[#000000] dark:text-white placeholder:text-[#6C757D] resize-none"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex gap-4 pt-4 border-t border-[#4A4A4A]/20">
            <Button
              onClick={handleSave}
              className="flex-1 h-12 bg-[#D71920] hover:bg-[#b8151b] text-white font-semibold text-base shadow-lg shadow-[#D71920]/30 transition-all duration-200"
            >
              <Clock className="h-5 w-5 mr-2" />
              Save Follow-up
            </Button>
            <Button
              variant="outline"
              onClick={onClose}
              className="flex-1 h-12 border-2 border-[#4A4A4A] text-[#000000] dark:text-white hover:bg-[#F5F5F5] dark:hover:bg-[#1a1a1a] font-semibold text-base"
            >
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
