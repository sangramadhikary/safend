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
  Mail, 
  Phone, 
  MapPin, 
  Calendar, 
  IndianRupee,
  Briefcase,
  Target,
  UserCheck,
  Clock,
  TrendingUp,
  AlertCircle,
  Shield,
  Users,
  MapPinned,
  Camera,
  DoorOpen,
  FileText,
} from "lucide-react";

interface LeadDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  lead: any;
}

const getStatusConfig = (status: string) => {
  switch (status) {
    case "New Lead":
      return { color: "bg-blue-500", icon: Target, textColor: "text-blue-500", bgLight: "bg-blue-50 dark:bg-blue-900/20" };
    case "Qualified Lead":
      return { color: "bg-purple-500", icon: TrendingUp, textColor: "text-purple-500", bgLight: "bg-purple-50 dark:bg-purple-900/20" };
    case "Opportunity":
      return { color: "bg-amber-500", icon: Briefcase, textColor: "text-amber-500", bgLight: "bg-amber-50 dark:bg-amber-900/20" };
    case "Client":
      return { color: "bg-green-500", icon: UserCheck, textColor: "text-green-500", bgLight: "bg-green-50 dark:bg-green-900/20" };
    case "Inactive":
      return { color: "bg-gray-500", icon: Clock, textColor: "text-gray-500", bgLight: "bg-gray-50 dark:bg-gray-900" };
    default:
      return { color: "bg-gray-500", icon: AlertCircle, textColor: "text-gray-500", bgLight: "bg-gray-50 dark:bg-gray-900" };
  }
};

const getPriorityConfig = (priority: string) => {
  switch (priority?.toLowerCase()) {
    case "high": case "critical": return { color: "bg-red-500", textColor: "text-red-500" };
    case "medium": return { color: "bg-amber-500", textColor: "text-amber-500" };
    case "low": return { color: "bg-green-500", textColor: "text-green-500" };
    default: return { color: "bg-gray-500", textColor: "text-gray-500" };
  }
};

const formatDate = (date: any) => {
  if (!date) return "N/A";
  try {
    const d = date.toDate ? date.toDate() : new Date(date);
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return "N/A";
  }
};

export function LeadDetailModal({ isOpen, onClose, lead }: LeadDetailModalProps) {
  if (!lead) return null;

  const statusConfig = getStatusConfig(lead.status);
  const StatusIcon = statusConfig.icon;
  const priorityConfig = getPriorityConfig(lead.priority || lead.urgency);

  // Security needs
  const securityNeeds = lead.securityNeeds || {};
  const hasSecurityNeeds = Object.values(securityNeeds).some(v => v === true);

  // Manpower requirements
  const manpower = lead.manpowerRequirements || {};

  // Site information
  const siteInfo = lead.siteInformation || {};
  const hasSiteInfo = siteInfo.siteCount || siteInfo.primaryLocation || siteInfo.locationType || siteInfo.siteArea;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" preventOutsideClose={true}>
        <DialogHeader className="pb-4">
          <DialogTitle className="text-2xl font-bold flex items-center gap-3">
            <div className="p-2 bg-[#D71920]/10 rounded-lg">
              <User className="h-6 w-6 text-[#D71920]" />
            </div>
            Lead Details
          </DialogTitle>
        </DialogHeader>

        {/* Status & Priority Banner */}
        <div className={`${statusConfig.bgLight} rounded-xl p-4 border ${statusConfig.textColor.replace('text-', 'border-')}/20`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <StatusIcon className={`h-8 w-8 ${statusConfig.textColor}`} />
              <div>
                <p className="text-sm text-muted-foreground">Current Status</p>
                <Badge className={`${statusConfig.color} text-white text-sm px-3 py-1 mt-1`}>
                  {lead.status}
                </Badge>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm text-muted-foreground">Priority</p>
              <Badge className={`${priorityConfig.color} text-white text-sm px-3 py-1 mt-1`}>
                {lead.priority || lead.urgency || "Medium"}
              </Badge>
            </div>
          </div>
        </div>

        <Separator className="my-4" />

        {/* Client Information */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <User className="h-5 w-5 text-[#D71920]" />
            Client Information
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <InfoCard icon={User} iconColor="text-[#D71920]" iconBg="bg-[#D71920]/10" label="Contact Name" value={lead.name} />
            <InfoCard icon={Building2} iconColor="text-blue-500" iconBg="bg-blue-500/10" label="Company" value={lead.companyName} />
            <InfoCard icon={Mail} iconColor="text-green-500" iconBg="bg-green-500/10" label="Email" value={lead.email} isLink={`mailto:${lead.email}`} />
            <InfoCard icon={Phone} iconColor="text-purple-500" iconBg="bg-purple-500/10" label="Phone" value={lead.phone} isLink={`tel:${lead.phone}`} />
          </div>
        </div>

        <Separator className="my-4" />

        {/* Location Information */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <MapPin className="h-5 w-5 text-[#D71920]" />
            Location Details
          </h3>
          <div className="bg-linear-to-r from-[#D71920]/5 to-transparent rounded-lg p-4 border border-[#D71920]/20">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <DetailField label="Address" value={lead.address} />
              <DetailField label="City" value={lead.city} />
              <DetailField label="State" value={lead.state} />
              <DetailField label="PIN Code" value={lead.pincode} />
            </div>
          </div>
        </div>

        <Separator className="my-4" />

        {/* Business Information */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Briefcase className="h-5 w-5 text-[#D71920]" />
            Business Details
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4 border border-green-200 dark:border-green-800">
              <div className="flex items-center gap-2 mb-2">
                <IndianRupee className="h-4 w-4 text-green-500" />
                <p className="text-xs text-green-600 dark:text-green-400 uppercase tracking-wide">Budget</p>
              </div>
              <p className="font-bold text-xl text-green-600 dark:text-green-400">{lead.budget || "N/A"}</p>
            </div>
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
              <div className="flex items-center gap-2 mb-2">
                <Target className="h-4 w-4 text-blue-500" />
                <p className="text-xs text-blue-600 dark:text-blue-400 uppercase tracking-wide">Source</p>
              </div>
              <p className="font-semibold">{lead.source || "N/A"}</p>
            </div>
            <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-4 border border-purple-200 dark:border-purple-800">
              <div className="flex items-center gap-2 mb-2">
                <UserCheck className="h-4 w-4 text-purple-500" />
                <p className="text-xs text-purple-600 dark:text-purple-400 uppercase tracking-wide">Assigned To</p>
              </div>
              <p className="font-semibold">{lead.assignedTo || "Unassigned"}</p>
            </div>
          </div>
          {lead.targetStartDate && (
            <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3 border border-amber-200 dark:border-amber-800 inline-flex items-center gap-2">
              <Calendar className="h-4 w-4 text-amber-500" />
              <span className="text-xs text-amber-600 uppercase tracking-wide">Target Start:</span>
              <span className="font-semibold text-sm">{formatDate(lead.targetStartDate)}</span>
            </div>
          )}
        </div>

        {/* Security Needs */}
        {hasSecurityNeeds && (
          <>
            <Separator className="my-4" />
            <div className="space-y-4">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Shield className="h-5 w-5 text-[#D71920]" />
                Security Requirements
              </h3>
              <div className="flex flex-wrap gap-2">
                {securityNeeds.unarmedGuards && <Badge variant="outline" className="border-blue-300 text-blue-700 bg-blue-50">Unarmed Guards</Badge>}
                {securityNeeds.armedGuards && <Badge variant="outline" className="border-red-300 text-red-700 bg-red-50">Armed Guards</Badge>}
                {securityNeeds.supervisors && <Badge variant="outline" className="border-green-300 text-green-700 bg-green-50">Supervisors</Badge>}
                {securityNeeds.patrolOfficers && <Badge variant="outline" className="border-purple-300 text-purple-700 bg-purple-50">Patrol Officers</Badge>}
                {securityNeeds.eventSecurity && <Badge variant="outline" className="border-amber-300 text-amber-700 bg-amber-50">Event Security</Badge>}
                {securityNeeds.personalSecurity && <Badge variant="outline" className="border-pink-300 text-pink-700 bg-pink-50">Personal Security</Badge>}
              </div>
            </div>
          </>
        )}

        {/* Manpower Requirements */}
        {(manpower.totalGuardsNeeded || manpower.unarmedGuardsCount || manpower.armedGuardsCount || manpower.supervisorsCount || manpower.patrolOfficersCount || manpower.eventSecurityCount || manpower.personalSecurityCount) && (
          <>
            <Separator className="my-4" />
            <div className="space-y-4">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Users className="h-5 w-5 text-[#D71920]" />
                Manpower Requirements
              </h3>
              <div className="grid grid-cols-1 gap-3">
                {manpower.totalGuardsNeeded && (
                  <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-3 border">
                    <span className="text-xs text-muted-foreground uppercase">Total Guards Needed:</span>
                    <span className="font-bold text-lg ml-2">{manpower.totalGuardsNeeded}</span>
                  </div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {manpower.unarmedGuardsCount && (
                    <ManpowerCard title="Unarmed Guards" count={manpower.unarmedGuardsCount} shift={manpower.unarmedGuardsShiftType} female={manpower.unarmedGuardsFemale} exServicemen={manpower.unarmedGuardsExServicemen} color="blue" />
                  )}
                  {manpower.armedGuardsCount && (
                    <ManpowerCard title="Armed Guards" count={manpower.armedGuardsCount} shift={manpower.armedGuardsShiftType} female={manpower.armedGuardsFemale} exServicemen={manpower.armedGuardsExServicemen} color="red" />
                  )}
                  {manpower.supervisorsCount && (
                    <ManpowerCard title="Supervisors" count={manpower.supervisorsCount} shift={manpower.supervisorsShiftType} female={manpower.supervisorsFemale} exServicemen={manpower.supervisorsExServicemen} color="green" />
                  )}
                  {manpower.patrolOfficersCount && (
                    <ManpowerCard title="Patrol Officers" count={manpower.patrolOfficersCount} shift={manpower.patrolOfficersShiftType} female={manpower.patrolOfficersFemale} exServicemen={manpower.patrolOfficersExServicemen} color="purple" />
                  )}
                  {manpower.eventSecurityCount && (
                    <ManpowerCard title="Event Security" count={manpower.eventSecurityCount} shift={manpower.eventSecurityShiftType} female={manpower.eventSecurityFemale} exServicemen={manpower.eventSecurityExServicemen} color="amber" />
                  )}
                  {manpower.personalSecurityCount && (
                    <ManpowerCard title="Personal Security" count={manpower.personalSecurityCount} shift={manpower.personalSecurityShiftType} female={manpower.personalSecurityFemale} exServicemen={manpower.personalSecurityExServicemen} color="pink" />
                  )}
                </div>
              </div>
            </div>
          </>
        )}

        {/* Site Information */}
        {hasSiteInfo && (
          <>
            <Separator className="my-4" />
            <div className="space-y-4">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <MapPinned className="h-5 w-5 text-[#D71920]" />
                Site Information
              </h3>
              <div className="bg-linear-to-r from-blue-50 to-transparent dark:from-blue-900/10 rounded-lg p-4 border border-blue-200/50">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <DetailField label="Number of Sites" value={siteInfo.siteCount} />
                  <DetailField label="Primary Location" value={siteInfo.primaryLocation} />
                  <DetailField label="Location Type" value={siteInfo.locationType} />
                  <DetailField label="Site Area" value={siteInfo.siteArea} />
                </div>
                <div className="flex gap-4 mt-3">
                  {siteInfo.accessControlNeeded && (
                    <div className="flex items-center gap-1.5 text-sm text-green-600">
                      <DoorOpen className="h-4 w-4" />
                      <span>Access Control Needed</span>
                    </div>
                  )}
                  {siteInfo.cameraSystemNeeded && (
                    <div className="flex items-center gap-1.5 text-sm text-blue-600">
                      <Camera className="h-4 w-4" />
                      <span>Camera System Needed</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        )}

        {/* Timeline */}
        <Separator className="my-4" />
        <div className="space-y-4">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Calendar className="h-5 w-5 text-[#D71920]" />
            Timeline
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="h-4 w-4 text-blue-500" />
                <p className="text-xs text-blue-600 dark:text-blue-400 uppercase tracking-wide">Created On</p>
              </div>
              <p className="font-medium">{formatDate(lead.createdAt)}</p>
            </div>
            <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-4 border border-amber-200 dark:border-amber-800">
              <div className="flex items-center gap-2 mb-2">
                <Calendar className="h-4 w-4 text-amber-500" />
                <p className="text-xs text-amber-600 dark:text-amber-400 uppercase tracking-wide">Last Updated</p>
              </div>
              <p className="font-medium">{formatDate(lead.updatedAt)}</p>
            </div>
          </div>
        </div>

        {/* Notes */}
        {lead.notes && (
          <>
            <Separator className="my-4" />
            <div className="space-y-4">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <FileText className="h-5 w-5 text-[#D71920]" />
                Notes
              </h3>
              <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 border">
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{lead.notes}</p>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// Helper components
function InfoCard({ icon: Icon, iconColor, iconBg, label, value, isLink }: { icon: any; iconColor: string; iconBg: string; label: string; value?: string; isLink?: string }) {
  return (
    <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 border">
      <div className="flex items-center gap-3">
        <div className={`p-2 ${iconBg} rounded-full`}>
          <Icon className={`h-4 w-4 ${iconColor}`} />
        </div>
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
          {isLink && value ? (
            <a href={isLink} className="font-medium text-sm text-blue-500 hover:underline">{value}</a>
          ) : (
            <p className="font-semibold">{value || "N/A"}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function DetailField({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">{label}</p>
      <p className="font-medium">{value || "N/A"}</p>
    </div>
  );
}

function ManpowerCard({ title, count, shift, female, exServicemen, color }: { title: string; count: string; shift?: string; female?: boolean; exServicemen?: boolean; color: string }) {
  return (
    <div className={`bg-${color}-50 dark:bg-${color}-900/20 rounded-lg p-3 border border-${color}-200 dark:border-${color}-800`}>
      <p className={`text-xs font-semibold text-${color}-700 dark:text-${color}-300 uppercase mb-1`}>{title}</p>
      <p className="font-bold text-lg">{count}</p>
      <div className="flex flex-wrap gap-2 mt-1">
        {shift && <span className="text-xs text-muted-foreground">{shift} shift</span>}
        {female && <Badge variant="outline" className="text-[10px] px-1.5 py-0">Female</Badge>}
        {exServicemen && <Badge variant="outline" className="text-[10px] px-1.5 py-0">Ex-Servicemen</Badge>}
      </div>
    </div>
  );
}
