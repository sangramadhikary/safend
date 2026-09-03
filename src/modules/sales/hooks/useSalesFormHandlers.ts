'use client';
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { handleFormSubmit } from "@/services/supabase/LeadService";

export function useSalesFormHandlers() {
  const [showLeadForm, setShowLeadForm] = useState(false);
  const [showQuotationForm, setShowQuotationForm] = useState(false);
  const [showContactForm, setShowContactForm] = useState(false);
  const [showWorkorderForm, setShowWorkorderForm] = useState(false);
  const [showFollowupForm, setShowFollowupForm] = useState(false);
  const [showAgreementForm, setShowAgreementForm] = useState(false);
  const [showAgingInvoiceForm, setShowAgingInvoiceForm] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [initialQuotationData, setInitialQuotationData] = useState(null);
  
  const { toast } = useToast();

  // Enhanced form submission handler for leads using Firebase
  const handleLeadFormSubmit = async (formData: any) => {
    try {
      await handleFormSubmit(formData, toast);
      setShowLeadForm(false);
      setEditingItem(null);
    } catch (error) {
      console.error('Form submission failed:', error);
    }
  };

  // Form submission handlers for other forms
  const handleOtherFormSubmit = async (formData: any, type: string) => {
    try {
      // Handle followup updates
      if (type === "followup" && editingItem?.id) {
        const { updateFollowup } = await import("@/services/supabase/FollowupFirebaseService");
        const result = await updateFollowup(editingItem.id, formData);
        if (!result.success) {
          toast({ title: "Error", description: result.error || "Failed to update follow-up", variant: "destructive" });
          return;
        }
      }

      // Handle agreement creation/update + post sync
      if (type === "agreement") {
        const { addAgreement, updateAgreement } = await import("@/services/supabase/AgreementFirebaseService");
        const { updateWorkOrder } = await import("@/services/supabase/WorkOrderFirebaseService");

        let result;
        if (editingItem?.id) {
          result = await updateAgreement(editingItem.id, {
            clientName: formData.clientName,
            contactPerson: formData.contactPerson,
            contactEmail: formData.clientEmail,
            contactPhone: formData.clientPhone,
            serviceDetails: formData.serviceDetails,
            value: formData.value,
            status: formData.status,
            signedOn: formData.signedOn,
            validUntil: formData.validUntil,
            posts: formData.posts,
            complianceInfo: formData.complianceInfo,
            legalTerms: formData.legalTerms,
            paymentTerms: formData.paymentTerms,
            companySignatory: formData.companySignatory,
            companySignatoryDesignation: formData.companySignatoryDesignation,
            clientSignatory: formData.clientSignatory,
            clientSignatoryDesignation: formData.clientSignatoryDesignation,
            notes: formData.notes,
          });
        } else {
          result = await addAgreement({
            linkedQuoteId: formData.quotationRef || '',
            quotationRef: formData.quotationRef || '',
            clientName: formData.clientName || '',
            companyName: formData.clientName || '',
            contactPerson: formData.contactPerson || '',
            contactEmail: formData.clientEmail || '',
            contactPhone: formData.clientPhone || '',
            serviceDetails: formData.serviceDetails || '',
            value: formData.value || '₹0',
            status: 'active',
            posts: formData.posts || [],
            signedOn: formData.signedOn || '',
            validUntil: formData.validUntil || '',
            complianceInfo: formData.complianceInfo,
            legalTerms: formData.legalTerms,
            paymentTerms: formData.paymentTerms,
            companySignatory: formData.companySignatory,
            companySignatoryDesignation: formData.companySignatoryDesignation,
            clientSignatory: formData.clientSignatory,
            clientSignatoryDesignation: formData.clientSignatoryDesignation,
            notes: formData.notes,
          });

          if (result.success && formData.workOrderId) {
            await updateWorkOrder(formData.workOrderId, { linkedAgreementId: result.id } as any);
          }

          // Sync posts to Operations
          if (result.success && formData.quotationRef) {
            try {
              const { getQuotationByDisplayId } = await import("@/services/supabase/QuotationFirebaseService");
              const { syncPostsFromStartedWorkOrder } = await import("@/services/supabase/OperationalPostService");
              const quotResult = await getQuotationByDisplayId(formData.quotationRef);
              if (quotResult.success && quotResult.data) {
                await syncPostsFromStartedWorkOrder(
                  { linkedQuoteId: formData.quotationRef, clientName: formData.clientName, status: 'Completed', id: formData.workOrderId },
                  quotResult.data
                );
              }
            } catch (e) {
              console.error('Post sync failed:', e);
            }
          }
        }

        if (result && !result.success) {
          toast({ title: "Error", description: (result as any).error || "Failed to save agreement", variant: "destructive" });
          return;
        }
      }

      // Close all forms
      setShowQuotationForm(false);
      setShowContactForm(false);
      setShowWorkorderForm(false);
      setShowFollowupForm(false);
      setShowAgreementForm(false);
      setShowAgingInvoiceForm(false);
      setEditingItem(null);
    } catch (error) {
      console.error('Form submission failed:', error);
      toast({ title: "Error", description: "Failed to save changes", variant: "destructive" });
    }
  };

  // Handling edit actions
  const handleEdit = (item: any, type: string) => {
    setEditingItem(item);
    switch (type) {
      case "lead":
        setShowLeadForm(true);
        break;
      case "quotation":
        setShowQuotationForm(true);
        break;
      case "contact":
        setShowContactForm(true);
        break;
      case "workorder":
        setShowWorkorderForm(true);
        break;
      case "followup":
        setShowFollowupForm(true);
        break;
      case "agreement":
        setShowAgreementForm(true);
        break;
      case "agreement_upload":
        setShowAgreementForm(true); // SalesFormsWrapper checks _uploadOnly flag
        break;
      case "aging":
        setShowAgingInvoiceForm(true);
        break;
      default:
        break;
    }
  };

  return {
    // Form states
    showLeadForm,
    showQuotationForm,
    showContactForm,
    showWorkorderForm,
    showFollowupForm,
    showAgreementForm,
    showAgingInvoiceForm,
    editingItem,
    initialQuotationData,
    setShowLeadForm,
    setShowQuotationForm,
    setShowContactForm,
    setShowWorkorderForm,
    setShowFollowupForm,
    setShowAgreementForm,
    setShowAgingInvoiceForm,
    setEditingItem,
    setInitialQuotationData,
    
    // Form handlers
    handleLeadFormSubmit,
    handleOtherFormSubmit,
    handleEdit
  };
}
