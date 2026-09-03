'use client';

import { useState } from "react";
import { EnhancedButton as Button } from "@/components/ui/enhanced-button";
import { Eye, Edit, Trash2, CheckCircle, FileText, MoreVertical } from "lucide-react";
import { useToastWithSound } from "@/hooks/use-toast-with-sound";
import { getSoundBus } from "@/services/SoundService";
import { updateQuotation, deleteQuotation } from "@/services/supabase/QuotationFirebaseService";
import { addWorkOrder } from "@/services/supabase/WorkOrderFirebaseService";
import { updateLead } from "@/services/supabase/LeadFirebaseService";
import { QuotationDocumentService } from "@/services/documents/QuotationDocumentService";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DeleteRequestModal } from "@/components/sales/DeleteRequestModal";
import { AdminDeleteConfirmModal } from "@/components/sales/AdminDeleteConfirmModal";
import { QuotationDetailModal } from "./QuotationDetailModal";

interface QuotationActionProps {
  quotation: any;
  onEdit: (quotation: any) => void;
}

export function QuotationActionButtons({ quotation, onEdit }: QuotationActionProps) {
  const { toast } = useToastWithSound();
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [adminDeleteModalOpen, setAdminDeleteModalOpen] = useState(false);
  const [viewModalOpen, setViewModalOpen] = useState(false);
  
  const handleDeleteClick = () => {
    if (typeof window !== 'undefined') getSoundBus().play('click');
    const userRole = typeof window !== 'undefined' ? localStorage.getItem("userRole") : "";
    if (userRole === "admin") {
      setAdminDeleteModalOpen(true);
    } else {
      setDeleteModalOpen(true);
    }
  };

  const handleAdminDirectDelete = async () => {
    const result = await deleteQuotation(quotation.id || quotation.quotationId || "");
    if (result.success) {
      toast.success({ title: "Quotation Deleted", description: `Quotation for "${quotation.client || 'Unknown Client'}" has been permanently deleted.` });
    } else {
      toast.error({ title: "Error", description: result.error || "Failed to delete quotation" });
    }
    setAdminDeleteModalOpen(false);
  };
  
  const handleView = (id: string) => {
    if (typeof window !== 'undefined') getSoundBus().play('click');
    setViewModalOpen(true);
  };
  
  const handleDownloadPDF = async () => {
    if (typeof window !== 'undefined') getSoundBus().play('download');
    try {
      await QuotationDocumentService.generatePDFDocument(quotation);
    } catch (error) {
      console.error('PDF generation error:', error);
      toast.error({
        title: "Error",
        description: "Failed to generate PDF. Please try again.",
      });
    }
  };
  
  const handleDownloadWord = async () => {
    if (typeof window !== 'undefined') getSoundBus().play('download');
    try {
      await QuotationDocumentService.generateWordDocument(quotation);
    } catch (error) {
      toast.error({
        title: "Error",
        description: "Failed to generate Word document",
      });
    }
  };
  
  const handlePreview = async () => {
    if (typeof window !== 'undefined') getSoundBus().play('click');
    try {
      await QuotationDocumentService.previewPDF(quotation);
    } catch (error) {
      console.error('PDF preview error:', error);
      toast.error({
        title: "Error",
        description: "Failed to generate PDF preview. Please try again.",
      });
    }
  };
  
  const handleApprove = async (quotation: any) => {
    if (typeof window !== 'undefined') getSoundBus().play('success');
    
    if (!quotation.id) {
      toast.error({ title: "Error", description: "Cannot approve: Quotation ID is missing." });
      return;
    }
    
    try {
      // Update quotation status to Accepted
      const updateResult = await updateQuotation(quotation.id, { status: "Accepted" });
      
      if (updateResult.success) {
        // Create Work Order from quotation (Work Order is the mandatory next step)
        const workOrderResult = await addWorkOrder({
          linkedAgreementId: '', // No agreement yet — will be created after work order is signed
          linkedQuoteId: quotation.quotationId || quotation.id, // Must be the display ID (QT-xxxx) for FK constraint
          clientName: quotation.client || quotation.clientName || "Unknown Client",
          companyName: quotation.companyName || quotation.client || '',
          contactPerson: quotation.contactPerson || "",
          contactEmail: quotation.contactEmail || "",
          contactPhone: quotation.contactPhone || "",
          address: quotation.address || "",
          city: quotation.city || "",
          state: quotation.state || "",
          pincode: quotation.pincode || "",
          serviceDetails: quotation.service || quotation.serviceDetails || "Security Services",
          value: quotation.amount || quotation.value || "₹0",
          status: "Draft",
          posts: (quotation.locations || []).map((loc: any, idx: number) => ({
            id: loc.id || `post-${idx}`,
            postName: loc.name || loc.postName || `Post ${idx + 1}`,
            postAddress: loc.address || loc.postAddress || "",
            state: loc.state || "",
            city: loc.city || "",
            pincode: loc.pincode || "",
            totalGuards: loc.guards || loc.totalGuards || 0,
            services: loc.services || []
          })),
        });
        
        if (workOrderResult.success) {
          // Update linked lead status to Converted
          if (quotation.leadId) {
            await updateLead(quotation.leadId, { status: 'Converted' });
          }
          
          toast.success({
            title: "Quotation Approved",
            description: "Work Order created. Upload signed work order to generate Agreement.",
            duration: 4000,
          });
          
          // Navigate to contracts tab
          window.dispatchEvent(new CustomEvent('navigateToTab', { detail: { tab: 'contracts' } }));
        } else {
          toast.error({
            title: "Partial Success",
            description: "Quotation approved but failed to create work order: " + (workOrderResult.error || "Unknown error"),
          });
        }
      } else {
        if (updateResult.error && updateResult.error.includes("No document to update")) {
          toast.error({ title: "Cannot Approve", description: "This quotation no longer exists. Please refresh and try again." });
        } else {
          toast.error({ title: "Error", description: updateResult.error || "Failed to approve quotation" });
        }
      }
    } catch (error) {
      console.error('Error in handleApprove:', error);
      toast.error({ title: "Error", description: "An unexpected error occurred while approving the quotation." });
    }
  };
  
  return (
    <>
      <div className="flex justify-end gap-2">
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={() => handleView(quotation.id)}
          soundEffect="click"
          title="View Details"
        >
          <Eye className="h-4 w-4" />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button 
              variant="ghost" 
              size="icon"
              soundEffect="click"
              title="More Actions"
            >
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={handlePreview}>
              <Eye className="mr-2 h-4 w-4" />
              Preview PDF
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleDownloadPDF}>
              <FileText className="mr-2 h-4 w-4" />
              Download PDF
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleDownloadWord}>
              <FileText className="mr-2 h-4 w-4" />
              Download Word
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {(quotation.status === "Pending" || quotation.status === "Draft" || quotation.status === "Sent" || quotation.status === "Revised") && (
              <DropdownMenuItem
                onClick={() => handleApprove(quotation)}
                className="text-green-600 focus:text-white focus:bg-green-600"
              >
                <CheckCircle className="mr-2 h-4 w-4" />
                Approve &amp; Create Work Order
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={() => onEdit(quotation)}>
              <Edit className="mr-2 h-4 w-4" />
              Edit Quotation
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={handleDeleteClick}
              className="text-red-600 focus:text-white focus:bg-red-600"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete Quotation
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      
      {/* Delete Request Modal (for non-admin users) */}
      <DeleteRequestModal
        isOpen={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        itemType="quotation"
        itemId={quotation.id || quotation.quotationId || ""}
        clientName={quotation.client || "Unknown Client"}
        contactEmail={quotation.contactEmail}
        contactPhone={quotation.contactPhone}
        additionalInfo={`Service: ${quotation.service} | Amount: ${quotation.amount}`}
      />

      {/* Admin Direct Delete Confirmation Modal */}
      <AdminDeleteConfirmModal
        isOpen={adminDeleteModalOpen}
        onClose={() => setAdminDeleteModalOpen(false)}
        onConfirm={handleAdminDirectDelete}
        itemType="Quotation"
        itemName={quotation.client || "Unknown Client"}
        itemId={quotation.quotationId || quotation.id || ""}
      />

      {/* View Details Modal */}
      <QuotationDetailModal
        isOpen={viewModalOpen}
        onClose={() => setViewModalOpen(false)}
        quotation={quotation}
      />
    </>
  );
}
