'use client';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { 
  Building2, 
  User, 
  Calendar, 
  Clock,
  CheckCircle2,
  AlertTriangle,
  Phone,
  Mail,
  MessageSquare,
  Flag,
  FileText
} from "lucide-react";
import { Followup } from "@/services/supabase/FollowupFirebaseService";

interface FollowupDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  followup: Followup | null;
}

const getStatusConfig = (status: string) => {
  switch (status) {
    case "Pending":
      return { color: "bg-blue-500", textColor: "text-blue-500", bgLight: "bg-blue-50 dark:bg-blue-900/20", icon: Clock };
    case "Completed":
      return { color: "bg-green-500", textColor: "text-green-500", bgLight: "bg-green-50 dark:bg-green-900/20", icon: CheckCircle2 };
    case "Overdue":
      return { color: "bg-red-500", textColor: "text-red-500", bgLight: "bg-red-50 dark:bg-red-900/20", icon: AlertTriangle };
    default:
      return { color: "bg-gray-500", textColor: "text-gray-500", bgLight: "bg-gray-50 dark:bg-gray-900", icon: Clock };
  }
};

const getPriorityConfig = (priority: string) => {
  switch (priority) {
    case "High":
      return { color: "bg-red-500", textColor: "text-red-500", bgLight: "bg-red-50 dark:bg-red-900/20" };
    case "Medium":
      return { color: "bg-amber-500", textColor: "text-amber-500", bgLight: "bg-amber-50 dark:bg-amber-900/20" };
    case "Low":
      return { color: "bg-blue-500", textColor: "text-blue-500", bgLight: "bg-blue-50 dark:bg-blue-900/20" };
    default:
      return { color: "bg-gray-500", textColor: "text-gray-500", bgLight: "bg-gray-50 dark:bg-gray-900" };
  }
};

const getTypeIcon = (type: string) => {
  switch (type?.toLowerCase()) {
    case "call":
      return Phone;
    case "email":
      return Mail;
    case "meeting":
      return Calendar;
    default:
      return MessageSquare;
  }
};

const formatDateTime = (dateTime: string) => {
  if (!dateTime) return { date: "N/A", time: "N/A" };
  try {
    const d = new Date(dateTime);
    return {
      date: d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
      time: d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
    };
  } catch {
    return { date: "N/A", time: "N/A" };
  }
};

export function FollowupDetailModal({ isOpen, onClose, followup }: FollowupDetailModalProps) {
  if (!followup) return null;

  const statusConfig = getStatusConfig(followup.status);
  const priorityConfig = getPriorityConfig(followup.priority || "Medium");
  const StatusIcon = statusConfig.icon;
  const TypeIcon = getTypeIcon(followup.type);
  const { date, time } = formatDateTime(followup.dateTime);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" preventOutsideClose={true}>
        <DialogHeader className="pb-4">
          <DialogTitle className="text-2xl font-bold flex items-center gap-3">
            <div className="p-2 bg-[#D71920]/10 rounded-lg">
              <Calendar className="h-6 w-6 text-[#D71920]" />
            </div>
            Follow-up Details
          </DialogTitle>
        </DialogHeader>

        {/* Status & Type Banner */}
        <div className={`${statusConfig.bgLight} rounded-xl p-4 border ${statusConfig.textColor.replace('text-', 'border-')}/20`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <StatusIcon className={`h-8 w-8 ${statusConfig.textColor}`} />
              <div>
                <p className="text-sm text-muted-foreground">Status</p>
                <Badge className={`${statusConfig.color} text-white text-sm px-3 py-1 mt-1`}>
                  {followup.status}
                </Badge>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm text-muted-foreground">Follow-up Type</p>
              <div className="flex items-center gap-2 justify-end mt-1">
                <TypeIcon className={`h-5 w-5 ${statusConfig.textColor}`} />
                <span className={`text-lg font-bold ${statusConfig.textColor}`}>{followup.type}</span>
              </div>
            </div>
          </div>
        </div>

        <Separator className="my-4" />

        {/* Contact & Company Information */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Building2 className="h-5 w-5 text-[#D71920]" />
            Contact Information
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 border">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-[#D71920]/10 rounded-full">
                  <User className="h-4 w-4 text-[#D71920]" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Contact Person</p>
                  <p className="font-semibold text-lg">{followup.contact || "N/A"}</p>
                </div>
              </div>
            </div>

            <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 border">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-500/10 rounded-full">
                  <Building2 className="h-4 w-4 text-blue-500" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Company</p>
                  <p className="font-semibold">{followup.company || "N/A"}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <Separator className="my-4" />

        {/* Schedule Details */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Clock className="h-5 w-5 text-[#D71920]" />
            Schedule Details
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
              <div className="flex items-center gap-2 mb-2">
                <Calendar className="h-4 w-4 text-blue-500" />
                <p className="text-xs text-blue-600 dark:text-blue-400 uppercase tracking-wide">Date</p>
              </div>
              <p className="font-semibold text-lg">{date}</p>
            </div>

            <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-4 border border-purple-200 dark:border-purple-800">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="h-4 w-4 text-purple-500" />
                <p className="text-xs text-purple-600 dark:text-purple-400 uppercase tracking-wide">Time</p>
              </div>
              <p className="font-semibold text-lg">{time}</p>
            </div>

            <div className={`${priorityConfig.bgLight} rounded-lg p-4 border`}>
              <div className="flex items-center gap-2 mb-2">
                <Flag className={`h-4 w-4 ${priorityConfig.textColor}`} />
                <p className={`text-xs ${priorityConfig.textColor} uppercase tracking-wide`}>Priority</p>
              </div>
              <Badge className={`${priorityConfig.color} text-white`}>
                {followup.priority || "Medium"}
              </Badge>
            </div>
          </div>
        </div>

        <Separator className="my-4" />

        {/* Subject & Notes */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <FileText className="h-5 w-5 text-[#D71920]" />
            Subject & Notes
          </h3>
          
          <div className="bg-linear-to-r from-[#D71920]/5 to-transparent rounded-lg p-4 border border-[#D71920]/20">
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Subject</p>
            <p className="font-semibold text-lg">{followup.subject || "No subject provided"}</p>
          </div>

          {followup.notes && (
            <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 border">
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Notes</p>
              <p className="font-medium leading-relaxed whitespace-pre-wrap">{followup.notes}</p>
            </div>
          )}
        </div>

        {/* Lead Reference */}
        {followup.leadId && (
          <>
            <Separator className="my-4" />
            <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-4 border border-amber-200 dark:border-amber-800">
              <div className="flex items-center gap-3">
                <FileText className="h-6 w-6 text-amber-500" />
                <div>
                  <p className="text-xs text-amber-600 dark:text-amber-400 uppercase tracking-wide">Linked Lead</p>
                  <p className="font-mono font-semibold">{followup.leadId}</p>
                </div>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
