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
  Calendar, 
  IndianRupee,
  FileSignature,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  FileText,
  Upload,
  Shield
} from "lucide-react";

interface AgreementDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  agreement: any;
}

const getStatusConfig = (status: string) => {
  switch (status) {
    case "Draft":
      return { color: "bg-gray-500", textColor: "text-gray-500", bgLight: "bg-gray-50 dark:bg-gray-900", icon: FileText };
    case "Pending Signature":
      return { color: "bg-amber-500", textColor: "text-amber-500", bgLight: "bg-amber-50 dark:bg-amber-900/20", icon: Clock };
    case "Pending Upload":
      return { color: "bg-red-600", textColor: "text-red-600", bgLight: "bg-red-50 dark:bg-red-900/20", icon: Upload };
    case "Signed":
      return { color: "bg-green-500", textColor: "text-green-500", bgLight: "bg-green-50 dark:bg-green-900/20", icon: CheckCircle2 };
    case "Active":
      return { color: "bg-[#D71920]", textColor: "text-[#D71920]", bgLight: "bg-red-50 dark:bg-red-900/20", icon: Shield };
    case "Expired":
      return { color: "bg-gray-500", textColor: "text-gray-500", bgLight: "bg-gray-50 dark:bg-gray-900", icon: Clock };
    case "Terminated":
      return { color: "bg-black", textColor: "text-black dark:text-white", bgLight: "bg-gray-100 dark:bg-gray-900", icon: XCircle };
    default:
      return { color: "bg-gray-500", textColor: "text-gray-500", bgLight: "bg-gray-50 dark:bg-gray-900", icon: FileText };
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

export function AgreementDetailModal({ isOpen, onClose, agreement }: AgreementDetailModalProps) {
  if (!agreement) return null;

  const statusConfig = getStatusConfig(agreement.status);
  const StatusIcon = statusConfig.icon;

  // Calculate days remaining for pending upload
  const getDaysRemaining = () => {
    if (agreement.status !== "Pending Upload" || !agreement.pendingUploadSince) return null;
    const pendingDate = agreement.pendingUploadSince instanceof Date 
      ? agreement.pendingUploadSince 
      : new Date(agreement.pendingUploadSince);
    const dueDate = new Date(pendingDate.getTime() + 10 * 24 * 60 * 60 * 1000);
    const daysRemaining = Math.ceil((dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return daysRemaining;
  };

  const daysRemaining = getDaysRemaining();

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" preventOutsideClose={true}>
        <DialogHeader className="pb-4">
          <DialogTitle className="text-2xl font-bold flex items-center gap-3">
            <div className="p-2 bg-[#D71920]/10 rounded-lg">
              <FileSignature className="h-6 w-6 text-[#D71920]" />
            </div>
            Agreement Details
          </DialogTitle>
        </DialogHeader>

        {/* Status & Value Banner */}
        <div className={`${statusConfig.bgLight} rounded-xl p-4 border ${statusConfig.textColor.replace('text-', 'border-')}/20`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <StatusIcon className={`h-8 w-8 ${statusConfig.textColor}`} />
              <div>
                <p className="text-sm text-muted-foreground">Agreement Status</p>
                <Badge className={`${statusConfig.color} text-white text-sm px-3 py-1 mt-1`}>
                  {agreement.status}
                </Badge>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm text-muted-foreground">Agreement Value</p>
              <p className={`text-2xl font-bold ${statusConfig.textColor} flex items-center justify-end gap-1`}>
                {agreement.value || "₹0"}
              </p>
            </div>
          </div>

          {/* Pending Upload Warning */}
          {agreement.status === "Pending Upload" && daysRemaining !== null && (
            <div className={`mt-3 p-3 rounded-lg ${daysRemaining > 0 ? 'bg-amber-100 dark:bg-amber-900/30' : 'bg-red-100 dark:bg-red-900/30'}`}>
              <div className="flex items-center gap-2">
                <AlertTriangle className={`h-5 w-5 ${daysRemaining > 0 ? 'text-amber-600' : 'text-red-600'}`} />
                <span className={`font-medium ${daysRemaining > 0 ? 'text-amber-700 dark:text-amber-400' : 'text-red-700 dark:text-red-400'}`}>
                  {daysRemaining > 0 ? `${daysRemaining} days remaining to upload signed agreement` : "Overdue! Please upload signed agreement immediately"}
                </span>
              </div>
            </div>
          )}
        </div>

        <Separator className="my-4" />

        {/* Client Information */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Building2 className="h-5 w-5 text-[#D71920]" />
            Client Information
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 border">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-[#D71920]/10 rounded-full">
                  <User className="h-4 w-4 text-[#D71920]" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Client Name</p>
                  <p className="font-semibold text-lg">{agreement.clientName || "N/A"}</p>
                </div>
              </div>
            </div>

            <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 border">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-500/10 rounded-full">
                  <User className="h-4 w-4 text-blue-500" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Contact Person</p>
                  <p className="font-semibold">{agreement.contactPerson || "N/A"}</p>
                </div>
              </div>
            </div>

            <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 border">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-500/10 rounded-full">
                  <Mail className="h-4 w-4 text-green-500" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Email</p>
                  <a href={`mailto:${agreement.clientEmail}`} className="font-medium text-sm text-blue-500 hover:underline">
                    {agreement.clientEmail || "N/A"}
                  </a>
                </div>
              </div>
            </div>

            <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 border">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-500/10 rounded-full">
                  <Phone className="h-4 w-4 text-purple-500" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Phone</p>
                  <a href={`tel:${agreement.clientPhone}`} className="font-medium text-green-500 hover:underline">
                    {agreement.clientPhone || "N/A"}
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>

        <Separator className="my-4" />

        {/* Reference & Service Details */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <FileText className="h-5 w-5 text-[#D71920]" />
            Reference & Service Details
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 border">
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Quotation Reference</p>
              <p className="font-semibold text-[#D71920]">{agreement.linkedQuoteId || agreement.quotationRef || "N/A"}</p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 border">
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Agreement ID</p>
              <p className="font-mono font-semibold">{agreement.id}</p>
            </div>
          </div>

          <div className="bg-linear-to-r from-[#D71920]/5 to-transparent rounded-lg p-4 border border-[#D71920]/20">
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Service Details</p>
            <p className="font-medium leading-relaxed">{agreement.serviceDetails || "No service details provided"}</p>
          </div>
        </div>

        <Separator className="my-4" />

        {/* Timeline */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Calendar className="h-5 w-5 text-[#D71920]" />
            Timeline
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="h-4 w-4 text-blue-500" />
                <p className="text-xs text-blue-600 dark:text-blue-400 uppercase tracking-wide">Created</p>
              </div>
              <p className="font-medium text-sm">{formatDate(agreement.createdAt)}</p>
            </div>

            <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4 border border-green-200 dark:border-green-800">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <p className="text-xs text-green-600 dark:text-green-400 uppercase tracking-wide">Signed Date</p>
              </div>
              <p className="font-medium text-sm">{formatDate(agreement.signedDate)}</p>
            </div>

            <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-4 border border-amber-200 dark:border-amber-800">
              <div className="flex items-center gap-2 mb-2">
                <Calendar className="h-4 w-4 text-amber-500" />
                <p className="text-xs text-amber-600 dark:text-amber-400 uppercase tracking-wide">Last Updated</p>
              </div>
              <p className="font-medium text-sm">{formatDate(agreement.updatedAt)}</p>
            </div>
          </div>
        </div>

        {/* Signed Document Link */}
        {agreement.signedDocumentUrl && (
          <>
            <Separator className="my-4" />
            <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4 border border-green-200 dark:border-green-800">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="h-6 w-6 text-green-500" />
                  <div>
                    <p className="font-semibold text-green-700 dark:text-green-400">Signed Agreement Uploaded</p>
                    <p className="text-sm text-green-600 dark:text-green-500">Document is available for download</p>
                    {/* Show URL for debugging */}
                    <p className="text-xs text-gray-400 mt-1 truncate max-w-[300px]" title={agreement.signedDocumentUrl}>
                      {agreement.signedDocumentUrl.includes('r2.dev') ? '✓ R2 Storage' : '⚠ Legacy URL'}
                    </p>
                  </div>
                </div>
                <a 
                  href={agreement.signedDocumentUrl} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
                >
                  View Document
                </a>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
