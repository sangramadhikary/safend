'use client';
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, User, Phone, Mail, FileText } from "lucide-react";
import { addDeletionRequest } from "@/services/supabase/DeletionRequestService";
import { useToast } from "@/hooks/use-toast";

interface DeleteRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  itemType: 'lead' | 'quotation' | 'agreement' | 'followup' | 'workorder' | 'contract';
  itemId: string;
  clientName: string;
  contactEmail?: string;
  contactPhone?: string;
  additionalInfo?: string;
}

const itemTypeLabels: Record<string, string> = {
  lead: 'Lead',
  quotation: 'Quotation',
  agreement: 'Agreement',
  followup: 'Follow-up',
  workorder: 'Work Order',
  contract: 'Contract'
};

export function DeleteRequestModal({
  isOpen,
  onClose,
  itemType,
  itemId,
  clientName,
  contactEmail,
  contactPhone,
  additionalInfo
}: DeleteRequestModalProps) {
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async () => {
    if (!reason.trim()) {
      toast({
        title: "Error",
        description: "Please provide a reason for deletion",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);

    // Build contact details string
    const contactDetails = [
      contactEmail && `Email: ${contactEmail}`,
      contactPhone && `Phone: ${contactPhone}`
    ].filter(Boolean).join(" | ") || "No contact details available";

    const result = await addDeletionRequest({
      itemType,
      itemId,
      clientName,
      contactDetails,
      reason: reason.trim(),
      requestedBy: localStorage.getItem("userName") || "Employee", // Get actual user name
      additionalInfo
    });

    setIsSubmitting(false);

    if (result.success) {
      toast({
        title: "Request Submitted",
        description: "Your deletion request has been sent to the admin for approval.",
      });
      setReason("");
      onClose();
    } else {
      toast({
        title: "Error",
        description: result.error || "Failed to submit deletion request",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]" preventOutsideClose={true}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-600">
            <AlertTriangle className="h-5 w-5" />
            Request Deletion Approval
          </DialogTitle>
          <DialogDescription>
            {itemType === 'workorder' 
              ? "Submit a request to delete this work order. WARNING: This will permanently delete ALL related data including operational posts, attendance records, rotas, penalties, invoices, and other client activities across Operations, HR, Accounts, and Office Admin modules."
              : `Submit a request to delete this ${itemTypeLabels[itemType].toLowerCase()}. Admin approval is required for all deletions in the Sales module.`
            }
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Item Details Card */}
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-500">Type</span>
              <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
                {itemTypeLabels[itemType]}
              </Badge>
            </div>
            
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-500 flex items-center gap-1">
                <FileText className="h-3 w-3" /> ID
              </span>
              <span className="text-sm font-mono bg-gray-200 dark:bg-gray-700 px-2 py-0.5 rounded">
                {itemId}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-500 flex items-center gap-1">
                <User className="h-3 w-3" /> Client
              </span>
              <span className="text-sm font-semibold">{clientName || "N/A"}</span>
            </div>

            {contactEmail && (
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-500 flex items-center gap-1">
                  <Mail className="h-3 w-3" /> Email
                </span>
                <span className="text-sm">{contactEmail}</span>
              </div>
            )}

            {contactPhone && (
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-500 flex items-center gap-1">
                  <Phone className="h-3 w-3" /> Phone
                </span>
                <span className="text-sm">{contactPhone}</span>
              </div>
            )}

            {additionalInfo && (
              <div className="pt-2 border-t">
                <span className="text-xs text-gray-500">{additionalInfo}</span>
              </div>
            )}
          </div>

          {/* Reason Input */}
          <div className="space-y-2">
            <Label htmlFor="reason" className="text-sm font-medium">
              Reason for Deletion <span className="text-red-500">*</span>
            </Label>
            <Textarea
              id="reason"
              placeholder="Please explain why this record needs to be deleted..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={4}
              className="resize-none"
            />
            <p className="text-xs text-muted-foreground">
              This reason will be reviewed by the admin before approval.
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button 
            onClick={handleSubmit} 
            disabled={isSubmitting || !reason.trim()}
            className="bg-red-600 hover:bg-red-700"
          >
            {isSubmitting ? "Submitting..." : "Submit Request"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
