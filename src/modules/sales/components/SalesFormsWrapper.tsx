'use client';
import React, { useState } from "react";
import { LeadForm } from "./LeadForm";
import { QuotationForm } from "./QuotationForm";
import { ContactForm } from "./ContactForm";
import { WorkorderForm } from "./WorkorderForm";
import { FollowupForm } from "./FollowupForm";
import { AgreementForm } from "./AgreementForm";
import { AgingInvoiceForm } from "./AgingInvoiceForm";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload } from "lucide-react";
import { addAgreement, updateAgreement } from "@/services/supabase/AgreementFirebaseService";
import { updateWorkOrder } from "@/services/supabase/WorkOrderFirebaseService";
import { uploadDocument } from "@/lib/r2-storage";
import { useToast } from "@/hooks/use-toast";

interface SalesFormsWrapperProps {
  showLeadForm: boolean;
  showQuotationForm: boolean;
  showContactForm: boolean;
  showWorkorderForm: boolean;
  showFollowupForm: boolean;
  showAgreementForm: boolean;
  showAgingInvoiceForm: boolean;
  setShowLeadForm: (show: boolean) => void;
  setShowQuotationForm: (show: boolean) => void;
  setShowContactForm: (show: boolean) => void;
  setShowWorkorderForm: (show: boolean) => void;
  setShowFollowupForm: (show: boolean) => void;
  setShowAgreementForm: (show: boolean) => void;
  setShowAgingInvoiceForm: (show: boolean) => void;
  editingItem: any;
  initialQuotationData?: any;
  handleLeadFormSubmit: (data: any) => void;
  handleOtherFormSubmit: (data: any, type: string) => void;
}

export function SalesFormsWrapper({
  showLeadForm,
  showQuotationForm,
  showContactForm,
  showWorkorderForm,
  showFollowupForm,
  showAgreementForm,
  showAgingInvoiceForm,
  setShowLeadForm,
  setShowQuotationForm,
  setShowContactForm,
  setShowWorkorderForm,
  setShowFollowupForm,
  setShowAgreementForm,
  setShowAgingInvoiceForm,
  editingItem,
  initialQuotationData,
  handleLeadFormSubmit,
  handleOtherFormSubmit
}: SalesFormsWrapperProps) {
  const { toast } = useToast();
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Upload-only agreement modal: create agreement with uploaded doc and mark active
  const handleUploadOnlySubmit = async () => {
    if (!uploadFile) {
      toast({ title: "Error", description: "Please select a file to upload.", variant: "destructive" });
      return;
    }
    setIsUploading(true);
    try {
      let docUrl = '';
      try {
        const uploadResult = await uploadDocument(uploadFile, 'agreements');
        docUrl = uploadResult.success && uploadResult.url ? uploadResult.url : uploadFile.name;
      } catch {
        docUrl = uploadFile.name; // fallback if upload fails
      }

      const wo = editingItem;
      const result = await addAgreement({
        linkedQuoteId: wo.linkedQuoteId || '',
        quotationRef: wo.linkedQuoteId || '',
        clientName: wo.clientName || '',
        companyName: wo.companyName || wo.clientName || '',
        contactPerson: wo.contactPerson || '',
        contactEmail: wo.contactEmail || '',
        contactPhone: wo.contactPhone || '',
        serviceDetails: wo.serviceDetails || '',
        value: wo.value || '₹0',
        status: 'active',
        posts: wo.posts || [],
        signedDocumentUrl: docUrl,
        documentUrl: docUrl,
        notes: `Manual agreement uploaded: ${uploadFile.name}`,
      });

      if (result.success) {
        if (wo.id) await updateWorkOrder(wo.id, { linkedAgreementId: result.id } as any);

        // Sync posts to Operations so they appear in the Posts tab
        if (wo.linkedQuoteId) {
          try {
            const { getQuotationByDisplayId } = await import("@/services/supabase/QuotationFirebaseService");
            const { syncPostsFromStartedWorkOrder } = await import("@/services/supabase/OperationalPostService");
            const quotResult = await getQuotationByDisplayId(wo.linkedQuoteId);
            if (quotResult.success && quotResult.data) {
              await syncPostsFromStartedWorkOrder(
                { ...wo, status: 'Completed' },
                quotResult.data
              );
            }
          } catch (e) {
            console.error('Post sync failed:', e);
          }
        }

        toast({ title: "Agreement Uploaded", description: `${wo.clientName} is now onboarded.` });
        setUploadFile(null);
        handleOtherFormSubmit({}, "agreement_upload");
      } else {
        toast({ title: "Error", description: result.error || "Failed to save agreement", variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "Error", description: e.message || "Upload failed", variant: "destructive" });
    }
    setIsUploading(false);
  };

  // Check if editingItem is an upload-only request
  const isUploadOnly = showAgreementForm && editingItem?._uploadOnly;

  return (
    <>
      {showLeadForm && 
        <LeadForm 
          isOpen={showLeadForm} 
          onClose={() => setShowLeadForm(false)} 
          onSubmit={handleLeadFormSubmit}
          editData={editingItem}
        />
      }
      
      {showQuotationForm && 
        <QuotationForm 
          isOpen={showQuotationForm} 
          onClose={() => setShowQuotationForm(false)} 
          onSubmit={(data) => handleOtherFormSubmit(data, "quotation")}
          editData={editingItem}
          initialData={initialQuotationData}
        />
      }
      
      {showContactForm && 
        <ContactForm 
          isOpen={showContactForm} 
          onClose={() => setShowContactForm(false)} 
          onSubmit={(data) => handleOtherFormSubmit(data, "contact")}
          editData={editingItem}
        />
      }
      
      {showWorkorderForm && 
        <WorkorderForm 
          isOpen={showWorkorderForm} 
          onClose={() => setShowWorkorderForm(false)} 
          onSubmit={(data) => handleOtherFormSubmit(data, "workorder")}
          editData={editingItem}
        />
      }
      
      {showFollowupForm && 
        <FollowupForm 
          isOpen={showFollowupForm} 
          onClose={() => setShowFollowupForm(false)} 
          onSubmit={(data) => handleOtherFormSubmit(data, "followup")}
          editData={editingItem}
        />
      }
      
      {showAgreementForm && !isUploadOnly &&
        <AgreementForm 
          isOpen={showAgreementForm} 
          onClose={() => setShowAgreementForm(false)}
          onSubmit={(data) => handleOtherFormSubmit(data, "agreement")}
          editData={editingItem}
        />
      }

      {/* Upload-only agreement dialog */}
      {isUploadOnly && (
        <Dialog open={true} onOpenChange={(open) => { if (!open) { setUploadFile(null); setShowAgreementForm(false); } }}>
          <DialogContent className="sm:max-w-[440px]">
            <DialogHeader>
              <DialogTitle>Upload Signed Agreement</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <p className="text-sm text-muted-foreground">
                Upload the scanned signed agreement for <strong>{editingItem?.clientName}</strong>. Once uploaded, the client will be onboarded.
              </p>
              <div className="space-y-2">
                <Label>Signed Agreement Document</Label>
                <div className="flex gap-2">
                  <Input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                    className="cursor-pointer"
                    onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                  />
                </div>
                {uploadFile && (
                  <p className="text-xs text-green-600">Selected: {uploadFile.name}</p>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setUploadFile(null); setShowAgreementForm(false); }}>
                Cancel
              </Button>
              <Button
                onClick={handleUploadOnlySubmit}
                disabled={!uploadFile || isUploading}
                className="bg-safend-red hover:bg-red-700"
              >
                <Upload className="h-4 w-4 mr-2" />
                {isUploading ? "Uploading..." : "Upload & Onboard"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      
      {showAgingInvoiceForm && 
        <AgingInvoiceForm 
          isOpen={showAgingInvoiceForm} 
          onClose={() => setShowAgingInvoiceForm(false)}
          onSubmit={(data) => handleOtherFormSubmit(data, "aging invoice")}
          editData={editingItem}
        />
      }
    </>
  );
}
