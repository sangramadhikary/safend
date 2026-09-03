'use client';

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { FileSignature, Loader2, Download } from "lucide-react";

interface AgreementDraftModalProps {
  isOpen: boolean;
  onClose: () => void;
  workOrder: any | null;
}

export function AgreementDraftModal({ isOpen, onClose, workOrder }: AgreementDraftModalProps) {
  const { toast } = useToast();
  const [generating, setGenerating] = useState(false);

  // Additional info needed for the agreement (not already in the work order)
  const [form, setForm] = useState({
    agreementDate: new Date().toISOString().split('T')[0],
    contractDurationMonths: '12',
    paymentCreditDays: '15',
    securityDeposit: '',
    noticePeriodDays: '30',
    rateEscalation: 'As per annual revision in Government-notified minimum wages',
    jurisdiction: 'Cuttack, Odisha',
    clientSignatoryName: workOrder?.contactPerson || '',
    clientSignatoryDesignation: '',
    specialTerms: '',
  });

  const handleChange = (field: string, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const handleGenerate = async () => {
    if (!form.clientSignatoryName.trim()) {
      toast({ title: "Required", description: "Please enter the client's authorized signatory name.", variant: "destructive" });
      return;
    }
    setGenerating(true);
    try {
      const res = await fetch('/api/agreement-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // Data from work order
          client: workOrder?.clientName || '',
          clientGst: workOrder?.clientGst || '',
          address: workOrder?.address || '',
          city: workOrder?.city || '',
          state: workOrder?.state || '',
          pincode: workOrder?.pincode || '',
          contactPerson: workOrder?.contactPerson || '',
          contactPhone: workOrder?.contactPhone || '',
          contactEmail: workOrder?.contactEmail || '',
          workOrderId: workOrder?.workOrderId || workOrder?.id || '',
          value: workOrder?.value || '₹0',
          posts: workOrder?.posts || [],
          serviceInstances: workOrder?.serviceInstances || {},
          locations: workOrder?.locations || [],
          // Additional collected info
          ...form,
        }),
      });
      if (!res.ok) {
        toast({ title: "Error", description: "Failed to generate agreement draft", variant: "destructive" });
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Agreement_${workOrder?.clientName || 'Draft'}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Agreement Draft Generated", description: "The agreement PDF has been downloaded." });
      onClose();
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Generation failed", variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSignature className="h-5 w-5 text-safend-red" />
            Generate Agreement Draft
          </DialogTitle>
          <DialogDescription>
            {workOrder?.clientName} — {workOrder?.workOrderId || workOrder?.id}. Provide the remaining details to generate a legal agreement draft.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="agreementDate">Agreement Date *</Label>
              <Input id="agreementDate" type="date" value={form.agreementDate} onChange={(e) => handleChange('agreementDate', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contractDurationMonths">Contract Duration (months) *</Label>
              <Input id="contractDurationMonths" type="text" inputMode="numeric" value={form.contractDurationMonths} onChange={(e) => handleChange('contractDurationMonths', e.target.value.replace(/\D/g, ''))} placeholder="12" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="paymentCreditDays">Payment Credit Period (days) *</Label>
              <Input id="paymentCreditDays" type="text" inputMode="numeric" value={form.paymentCreditDays} onChange={(e) => handleChange('paymentCreditDays', e.target.value.replace(/\D/g, ''))} placeholder="15" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="noticePeriodDays">Termination Notice (days) *</Label>
              <Input id="noticePeriodDays" type="text" inputMode="numeric" value={form.noticePeriodDays} onChange={(e) => handleChange('noticePeriodDays', e.target.value.replace(/\D/g, ''))} placeholder="30" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="securityDeposit">Security Deposit (₹)</Label>
              <Input id="securityDeposit" value={form.securityDeposit} onChange={(e) => handleChange('securityDeposit', e.target.value)} placeholder="Optional" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="jurisdiction">Jurisdiction *</Label>
              <Input id="jurisdiction" value={form.jurisdiction} onChange={(e) => handleChange('jurisdiction', e.target.value)} placeholder="Cuttack, Odisha" />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="rateEscalation">Rate Escalation Clause</Label>
            <Input id="rateEscalation" value={form.rateEscalation} onChange={(e) => handleChange('rateEscalation', e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="clientSignatoryName">Client Signatory Name *</Label>
              <Input id="clientSignatoryName" value={form.clientSignatoryName} onChange={(e) => handleChange('clientSignatoryName', e.target.value)} placeholder="Name of authorised person" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="clientSignatoryDesignation">Signatory Designation</Label>
              <Input id="clientSignatoryDesignation" value={form.clientSignatoryDesignation} onChange={(e) => handleChange('clientSignatoryDesignation', e.target.value)} placeholder="e.g. Director, Manager" />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="specialTerms">Special Terms / Remarks (optional)</Label>
            <Textarea id="specialTerms" value={form.specialTerms} onChange={(e) => handleChange('specialTerms', e.target.value)} placeholder="Any additional clauses specific to this client" rows={3} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={generating}>Cancel</Button>
          <Button onClick={handleGenerate} disabled={generating} className="bg-safend-red hover:bg-red-700 text-white">
            {generating ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Generating...</> : <><Download className="h-4 w-4 mr-2" />Generate Draft</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
