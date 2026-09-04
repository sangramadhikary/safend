'use client';

import { useState, useMemo, useEffect } from "react";import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  FileText, FileSignature, Shirt, CheckCircle2,
  Download, Loader2, CheckCircle, AlertTriangle, Save,
  Layers, Wind, HardHat, Footprints, ShoppingBag,
  Siren, Gift, Package, Radio, Flashlight, Zap, ScanLine,
  Lock, Wrench, Sparkles, Box, Award, Star, ExternalLink,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  createOnboardingCandidate, updateOnboardingCandidate, type OnboardingCandidate, type OnboardingStage,
} from "@/services/supabase/OnboardingService";
import { addHREmployee, generateEmployeeId } from "@/services/supabase/HREmployeeService";
import { uploadDocument, uploadProfilePicture, uploadSignedAgreement } from "@/lib/r2-storage";
import { useInventoryStore } from "@/modules/office-admin/components/inventory/inventoryStore";
import { SUB_CATEGORY_LABELS } from "@/modules/office-admin/components/inventory/types";

// Mirrors SUBCAT_CONFIG in InventoryItemsView — icon + colour per garment type
const SUBCAT_ICON: Record<string, { icon: React.ElementType; color: string; bg: string }> = {
  shirt:          { icon: Shirt,       color: "text-sky-500",     bg: "bg-sky-100"     },
  pant:           { icon: Layers,      color: "text-indigo-500",  bg: "bg-indigo-100"  },
  safari:         { icon: Shirt,       color: "text-teal-500",    bg: "bg-teal-100"    },
  "t-shirt":      { icon: Shirt,       color: "text-cyan-500",    bg: "bg-cyan-100"    },
  sweater:        { icon: Wind,        color: "text-blue-400",    bg: "bg-blue-100"    },
  jacket:         { icon: Wind,        color: "text-blue-600",    bg: "bg-blue-100"    },
  raincoat:       { icon: Wind,        color: "text-blue-700",    bg: "bg-blue-200"    },
  cap:            { icon: HardHat,     color: "text-amber-500",   bg: "bg-amber-100"   },
  shoes:          { icon: Footprints,  color: "text-stone-500",   bg: "bg-stone-100"   },
  belt:           { icon: ShoppingBag, color: "text-yellow-600",  bg: "bg-yellow-100"  },
  whistle:        { icon: Siren,       color: "text-red-400",     bg: "bg-red-100"     },
  lanyard:        { icon: ShoppingBag, color: "text-violet-500",  bg: "bg-violet-100"  },
  id_card_holder: { icon: Gift,        color: "text-pink-500",    bg: "bg-pink-100"    },
  id_card_lanyard:{ icon: ShoppingBag, color: "text-fuchsia-500", bg: "bg-fuchsia-100" },
  walkie_talkie:  { icon: Radio,       color: "text-green-500",   bg: "bg-green-100"   },
  torch:          { icon: Flashlight,  color: "text-yellow-500",  bg: "bg-yellow-100"  },
  lathi:          { icon: Zap,         color: "text-orange-500",  bg: "bg-orange-100"  },
  pepper_spray:   { icon: Zap,         color: "text-red-500",     bg: "bg-red-100"     },
  metal_detector: { icon: ScanLine,    color: "text-slate-500",   bg: "bg-slate-100"   },
  uvs:            { icon: ScanLine,    color: "text-purple-500",  bg: "bg-purple-100"  },
  baton:          { icon: Zap,         color: "text-orange-600",  bg: "bg-orange-100"  },
  handcuffs:      { icon: Lock,        color: "text-zinc-500",    bg: "bg-zinc-100"    },
  other_tool:     { icon: Wrench,      color: "text-gray-500",    bg: "bg-gray-100"    },
  event_uniform:  { icon: Sparkles,    color: "text-fuchsia-500", bg: "bg-fuchsia-100" },
  decoration_kit: { icon: Gift,        color: "text-rose-500",    bg: "bg-rose-100"    },
  event_kit:      { icon: Box,         color: "text-indigo-400",  bg: "bg-indigo-100"  },
  ceremonial_item:{ icon: Award,       color: "text-amber-600",   bg: "bg-amber-100"   },
  other_special:  { icon: Star,        color: "text-violet-500",  bg: "bg-violet-100"  },
};
const DEFAULT_SUBCAT = { icon: Package, color: "text-muted-foreground", bg: "bg-muted" };

/**
 * Accepted address proofs, and how many sides each one actually has.
 *
 * Photo ID cards carry the holder's details on the front and the address on the
 * back, so both sides are needed for the document to prove anything. Utility
 * bills and agreements are single-sided (or multi-page, captured as one file),
 * so asking for a "back side" there just leaves an empty box on screen.
 *
 * `value` matches the slugs already stored in address_proof_type, so existing
 * candidate records keep resolving.
 */
const ADDRESS_PROOF_TYPES: { value: string; label: string; sides: 1 | 2; frontLabel: string; backLabel?: string }[] = [
  { value: 'aadhaar-as-proof', label: 'Aadhaar Card',      sides: 2, frontLabel: 'Front Side',        backLabel: 'Back Side (address)' },
  { value: 'passport',         label: 'Passport',          sides: 2, frontLabel: 'Photo Page',        backLabel: 'Address Page' },
  { value: 'voter-id',         label: 'Voter ID (EPIC)',   sides: 2, frontLabel: 'Front Side',        backLabel: 'Back Side (address)' },
  { value: 'driving-license',  label: 'Driving License',   sides: 2, frontLabel: 'Front Side',        backLabel: 'Back Side (address)' },
  { value: 'electricity-bill', label: 'Electricity Bill',  sides: 1, frontLabel: 'Bill (latest)' },
  { value: 'water-bill',       label: 'Water Bill',        sides: 1, frontLabel: 'Bill (latest)' },
  { value: 'gas-bill',         label: 'Piped Gas Bill',    sides: 1, frontLabel: 'Bill (latest)' },
  { value: 'bank-statement',   label: 'Bank Statement',    sides: 1, frontLabel: 'Statement' },
  { value: 'rent-agreement',   label: 'Rent Agreement',    sides: 1, frontLabel: 'Agreement (all pages)' },
];

const proofConfig = (value: string) => ADDRESS_PROOF_TYPES.find(t => t.value === value);

/**
 * One upload tile: dropzone when empty, preview with replace/remove when filled.
 *
 * Kept at module scope so it does not remount on every parent render, and it owns
 * its own object-URL lifecycle — the previous inline markup called
 * URL.createObjectURL() during render and never revoked it, and rendered PDFs
 * into an <img> where they showed as a broken image.
 */
function DocSlot({
  label, file, existingUrl, onPick, aspect = '86/54', invalid = false, accept = '.pdf,.jpg,.jpeg,.png',
}: {
  label: string;
  file: File | null;
  existingUrl?: string;
  onPick: (f: File | null) => void;
  aspect?: string;
  invalid?: boolean;
  accept?: string;
}) {
  const isImage = Boolean(file?.type.startsWith('image/'));
  const previewUrl = useMemo(
    () => (file && isImage ? URL.createObjectURL(file) : null),
    [file, isImage]
  );
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  const filled = Boolean(file || existingUrl);

  return (
    <div
      className={`relative w-full rounded-lg border-2 border-dashed overflow-hidden group transition-colors
        ${invalid ? 'border-red-400 bg-red-50/40'
          : filled ? 'border-green-300 bg-green-50/30'
          : 'border-muted-foreground/25 bg-muted/20 hover:border-safend-red/40 hover:bg-muted/40'}`}
      style={{ aspectRatio: aspect }}
    >
      {file ? (
        <>
          {previewUrl
            ? <img src={previewUrl} alt={label} className="w-full h-full object-contain bg-white" />
            : (
              <div className="w-full h-full flex flex-col items-center justify-center gap-1 bg-white px-2">
                <FileText className="h-5 w-5 text-safend-red/60" />
                <span className="text-[9px] font-medium text-center line-clamp-2 break-all">{file.name}</span>
              </div>
            )}
          <div className="absolute inset-0 bg-black/55 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5">
            <button type="button" onClick={() => onPick(null)} className="text-[9px] text-white bg-red-600 rounded px-1.5 py-0.5">Remove</button>
            <label className="text-[9px] text-white bg-white/25 rounded px-1.5 py-0.5 cursor-pointer">
              Change<input type="file" accept={accept} className="hidden" onChange={e => onPick(e.target.files?.[0] || null)} />
            </label>
          </div>
        </>
      ) : existingUrl ? (
        <>
          <div className="w-full h-full flex flex-col items-center justify-center gap-1 bg-white">
            <CheckCircle className="h-5 w-5 text-green-600" />
            <span className="text-[9px] text-green-700 font-medium">On file</span>
          </div>
          <div className="absolute inset-0 bg-black/55 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5">
            <a href={existingUrl} target="_blank" rel="noopener noreferrer" className="text-[9px] text-white bg-white/25 rounded px-1.5 py-0.5">View</a>
            <label className="text-[9px] text-white bg-white/25 rounded px-1.5 py-0.5 cursor-pointer">
              Replace<input type="file" accept={accept} className="hidden" onChange={e => onPick(e.target.files?.[0] || null)} />
            </label>
          </div>
        </>
      ) : (
        <label className="w-full h-full flex flex-col items-center justify-center gap-1 cursor-pointer px-2">
          <FileText className={`h-4 w-4 ${invalid ? 'text-red-400' : 'text-muted-foreground/40'}`} />
          <span className={`text-[9px] font-medium text-center ${invalid ? 'text-red-500' : 'text-muted-foreground'}`}>{label}</span>
          <input type="file" accept={accept} className="hidden" onChange={e => onPick(e.target.files?.[0] || null)} />
        </label>
      )}
    </div>
  );
}

/** Consistent card wrapper so every document block lines up at the same height. */
function DocCard({
  title, required, children, hint,
}: { title: string; required?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <div className="p-4 border rounded-xl space-y-2.5 h-full flex flex-col">
      <div className="flex items-center justify-between gap-2">
        <Label className="font-medium text-sm">
          {title} {required && <span className="text-red-500">*</span>}
        </Label>
        {!required && (
          <span className="text-[10px] text-muted-foreground border rounded px-1.5 py-0.5 shrink-0">Optional</span>
        )}
      </div>
      {hint && <p className="text-[11px] text-muted-foreground -mt-1">{hint}</p>}
      <div className="flex-1 flex flex-col justify-end space-y-2.5">{children}</div>
    </div>
  );
}
import { EmployeeForm } from "../employee/EmployeeForm";
interface Props {
  candidate: OnboardingCandidate | null;
  /** Branch code (e.g. BR001) — what onboarding candidate rows are keyed on. */
  branchId?: string;
  /** Branch UUID — what inventory_items.branch is keyed on. */
  branchUuid?: string;
  stepOverride: OnboardingStage;
  onClose: (didChange: boolean) => void;
}

export function OnboardingWizard({ candidate, branchId, branchUuid, stepOverride, onClose }: Props) {
  const { toast } = useToast();
  const items = useInventoryStore(s => s.items);
  const issueStock = useInventoryStore(s => s.issueStock);
  const fetchItems = useInventoryStore(s => s.fetchItems);
  const isLoadingItems = useInventoryStore(s => s.isLoadingItems);

  // Fetch inventory when the uniform step opens, in case the store is cold
  // (user hasn't visited Office Admin → Inventory in this session).
  useEffect(() => {
    if (stepOverride === 'uniform' && branchUuid) {
      fetchItems(branchUuid);
    }
  }, [stepOverride, branchUuid, fetchItems]);

  const [record, setRecord] = useState<OnboardingCandidate | null>(candidate);
  const [saving, setSaving] = useState(false);
  const [showEmployeeForm, setShowEmployeeForm] = useState(stepOverride === 'details');

  // Documents
  const [aadharNumber, setAadharNumber] = useState(candidate?.aadharNumber || '');
  const [aadharFile, setAadharFile] = useState<File | null>(null);
  const [aadharBackFile, setAadharBackFile] = useState<File | null>(null);
  const [panNumber, setPanNumber] = useState(candidate?.panNumber || '');
  const [panFile, setPanFile] = useState<File | null>(null);
  const [addressProofType, setAddressProofType] = useState(candidate?.addressProofType || '');
  const [addressProofFile, setAddressProofFile] = useState<File | null>(null);
  const [addressProofBackFile, setAddressProofBackFile] = useState<File | null>(null);
  const [passportPhotoFile, setPassportPhotoFile] = useState<File | null>(null);
  const [bankPassbookFile, setBankPassbookFile] = useState<File | null>(null);
  const [cancelledChequeFile, setCancelledChequeFile] = useState<File | null>(null);

  // Agreement
  const [signedAgreementFile, setSignedAgreementFile] = useState<File | null>(null);

  // Uniform — each line: pick garment type, then size, then qty
  // subCategory + size together identify a unique inventory row
  const [uniformLines, setUniformLines] = useState<{ subCategory: string; size: string; itemId: string; qty: number }[]>([
    { subCategory: '', size: '', itemId: '', qty: 1 },
  ]);

  const addUniformLine = () =>
    setUniformLines(prev => [...prev, { subCategory: '', size: '', itemId: '', qty: 1 }]);
  const removeUniformLine = (idx: number) =>
    setUniformLines(prev => prev.filter((_, i) => i !== idx));
  const updateUniformLine = (idx: number, patch: Partial<{ subCategory: string; size: string; itemId: string; qty: number }>) =>
    setUniformLines(prev => prev.map((l, i) => i === idx ? { ...l, ...patch } : l));

  // Review
  const [reviewNotes, setReviewNotes] = useState('');

  /** Set once the user tries to save, so required slots only turn red after an attempt. */
  const [showDocErrors, setShowDocErrors] = useState(false);

  // ── Which documents are mandatory ──────────────────────────────────────────
  // Only Aadhaar and Address Proof are required. Everything else (photo, PAN,
  // passbook, cheque) is nice to have and must never block the pipeline.
  const proof = proofConfig(addressProofType);
  const aadhaarFrontOk = Boolean(aadharFile || record?.aadharFileUrl);
  const aadhaarBackOk = Boolean(aadharBackFile || record?.aadharBackFileUrl);
  const proofFrontOk = Boolean(addressProofFile || record?.addressProofFileUrl);
  const proofBackOk = Boolean(addressProofBackFile || record?.addressProofBackFileUrl);
  // Back side only counts when the chosen proof actually has two sides
  const proofBackRequired = proof?.sides === 2;

  const docProblems: string[] = [];
  if (!aadharNumber?.trim() || aadharNumber.trim().length !== 12) docProblems.push('Aadhaar number (12 digits)');
  if (!aadhaarFrontOk) docProblems.push('Aadhaar front side');
  if (!aadhaarBackOk) docProblems.push('Aadhaar back side');
  if (!addressProofType) docProblems.push('Address proof type');
  else {
    if (!proofFrontOk) docProblems.push(`Address proof — ${proof?.frontLabel || 'document'}`);
    if (proofBackRequired && !proofBackOk) docProblems.push(`Address proof — ${proof?.backLabel || 'back side'}`);
  }
  const docsValid = docProblems.length === 0;

  const uniformItems = useMemo(
    () => items.filter(i => i.category === 'uniforms' && i.branch === branchUuid && i.currentStock > 0),
    [items, branchUuid]
  );

  // ── Step 1: Employee Form ──
  const handleEmployeeFormSave = async (formData: any) => {
    setSaving(true);
    try {
      let photoUrl = formData.passportPhotoUrl || undefined;
      if (formData.passportPhotoFile) {
        const r = await uploadProfilePicture(formData.passportPhotoFile, `onboarding_${Date.now()}`);
        if (r.success) photoUrl = r.url;
      }
      const payload: Partial<OnboardingCandidate> = {
        name: formData.name, phone: formData.phone, email: formData.email,
        gender: formData.gender, dateOfBirth: formData.dateOfBirth,
        department: formData.department, designation: formData.designation,
        joinDate: formData.joinDate, photoUrl, branchId,
        stage: 'documents' as OnboardingStage,
        aadharNumber: formData.aadharNumber || undefined,
        panNumber: formData.panNumber || undefined,
      };
      if (record?.id) {
        const r = await updateOnboardingCandidate(record.id, payload);
        if (!r.success) throw new Error(r.error);
      } else {
        const r = await createOnboardingCandidate({ ...payload, name: formData.name, stage: 'documents' } as any);
        if (!r.success) throw new Error(r.error);
      }
      toast({ title: "Details Saved", description: `${formData.name} saved.` });
      setShowEmployeeForm(false);
      onClose(true);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  // ── Step 2: Documents ──
  const handleSaveDocuments = async () => {
    if (!record?.id) return;

    // Aadhaar + address proof are the only hard requirements
    if (!docsValid) {
      setShowDocErrors(true);
      toast({
        title: 'Required documents missing',
        description: docProblems.join(', '),
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);
    try {
      const updates: Partial<OnboardingCandidate> = { aadharNumber, panNumber, addressProofType, stage: 'agreement' };
      if (passportPhotoFile) {
        const r = await uploadProfilePicture(passportPhotoFile, `onboarding_${record.id}`);
        if (r.success) updates.photoUrl = r.url;
      }
      if (aadharFile) { const r = await uploadDocument(aadharFile, 'aadhar', record.id); if (r.success) updates.aadharFileUrl = r.url; }
      if (aadharBackFile) { const r = await uploadDocument(aadharBackFile, 'aadhar-back', record.id); if (r.success) updates.aadharBackFileUrl = r.url; }
      if (panFile) { const r = await uploadDocument(panFile, 'pan', record.id); if (r.success) updates.panFileUrl = r.url; }
      if (addressProofFile) { const r = await uploadDocument(addressProofFile, 'address-proof', record.id); if (r.success) updates.addressProofFileUrl = r.url; }
      if (addressProofBackFile) { const r = await uploadDocument(addressProofBackFile, 'address-proof-back', record.id); if (r.success) updates.addressProofBackFileUrl = r.url; }
      if (bankPassbookFile) { await uploadDocument(bankPassbookFile, 'bank-passbook', record.id); }
      if (cancelledChequeFile) { await uploadDocument(cancelledChequeFile, 'cancelled-cheque', record.id); }

      // Reflects the same rule the form enforces: Aadhaar + address proof only
      updates.documentsCompleted = true;

      const result = await updateOnboardingCandidate(record.id, updates);
      if (!result.success) throw new Error(result.error);
      toast({ title: "Documents Saved" });
      onClose(true);
    } catch (err: any) { toast({ title: "Error", description: err.message, variant: "destructive" }); }
    finally { setSaving(false); }
  };

  // ── Step 3: Agreement ──
  const handleGenerateAgreement = async () => {
    if (!record) return;
    setSaving(true);
    try {
      const response = await fetch('/api/employee-agreement-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: record.name,
          phone: record.phone || '',
          email: record.email || '',
          gender: record.gender || '',
          dateOfBirth: record.dateOfBirth || '',
          fatherName: '',
          designation: record.designation || '',
          department: record.department || '',
          joinDate: record.joinDate || '',
          salary: '',
          aadharNumber: record.aadharNumber || '',
          panNumber: record.panNumber || '',
          address: '',
          employeeId: record.employeeId || '',
          employmentType: 'Permanent (Full-Time)',
        }),
      });
      if (!response.ok) throw new Error('Failed to generate PDF');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Employment_Agreement_${record.name.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      if (record.id) {
        const r = await updateOnboardingCandidate(record.id, { agreementGeneratedAt: new Date().toISOString() });
        if (r.success) setRecord(r.data!);
      }
      toast({ title: "Agreement Downloaded", description: "Print it and get it signed by the employee." });
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to generate agreement", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAgreement = async () => {
    if (!record?.id) return;
    if (!signedAgreementFile && !record.agreementSignedFileUrl) {
      toast({ title: "Upload required", description: "Upload the signed contract.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const updates: Partial<OnboardingCandidate> = { stage: 'uniform' };
      if (signedAgreementFile) {
        const r = await uploadSignedAgreement(signedAgreementFile, record.id);
        if (r.success) { updates.agreementSignedFileUrl = r.url; updates.agreementSignedAt = new Date().toISOString(); }
      }
      const result = await updateOnboardingCandidate(record.id, updates);
      if (!result.success) throw new Error(result.error);
      toast({ title: "Agreement Saved" });
      onClose(true);
    } catch (err: any) { toast({ title: "Error", description: err.message, variant: "destructive" }); }
    finally { setSaving(false); }
  };

  // ── Step 4: Uniform ──
  const handleSaveUniform = async () => {
    if (!record?.id) return;
    setSaving(true);
    try {
      const toIssue = uniformLines.filter(l => l.itemId && l.qty > 0);
      await Promise.all(
        toIssue.map(l =>
          issueStock(l.itemId, l.qty, { type: 'employee', id: record.id!, name: record.name }, 'HR Onboarding')
        )
      );
      const result = await updateOnboardingCandidate(record.id, {
        stage: 'review',
        uniformIssuedAt: toIssue.length > 0 ? new Date().toISOString() : record.uniformIssuedAt,
      });
      if (!result.success) throw new Error(result.error);
      toast({ title: "Uniform Step Complete" });
      onClose(true);
    } catch (err: any) { toast({ title: "Error", description: err.message, variant: "destructive" }); }
    finally { setSaving(false); }
  };

  // ── Step 5: Finalize ──
  const handleFinalize = async () => {
    if (!record) return;
    setSaving(true);
    try {
      const empId = record.employeeId || (await generateEmployeeId());
      const result = await addHREmployee({
        employeeId: empId, name: record.name, email: record.email || '', phone: record.phone || '',
        gender: (record.gender as any) || 'male', dateOfBirth: record.dateOfBirth,
        department: record.department || 'Operations', designation: record.designation || 'Unarmed Guards',
        joinDate: record.joinDate || new Date().toISOString().split('T')[0],
        employmentType: 'Full-Time', status: 'Active',
        photoUrl: record.photoUrl, avatar: record.photoUrl,
        aadharNumber: record.aadharNumber, panNumber: record.panNumber, branchId,
      } as any);
      if (!result.success) throw new Error(result.error);
      // Use the ID the service actually saved — it re-mints the ID if the chosen
      // one was already taken, so recording `empId` here could store a value that
      // belongs to a different employee.
      const savedEmployeeId = result.employeeId || empId;
      await updateOnboardingCandidate(record.id!, {
        stage: 'onboarded', employeeId: savedEmployeeId, onboardedEmployeeUuid: result.id,
        onboardedAt: new Date().toISOString(), reviewedBy: 'HR', notes: reviewNotes,
      });
      toast({ title: "🎉 Employee Onboarded!", description: `${record.name} is now in the directory as ${savedEmployeeId}.` });
      onClose(true);
    } catch (err: any) { toast({ title: "Error", description: err.message, variant: "destructive" }); }
    finally { setSaving(false); }
  };

  // ── Render: Step 1 uses EmployeeForm ──
  if (showEmployeeForm) {
    // If candidate data exists, pass it so the form opens pre-filled (not blank)
    const existingEmployee = candidate ? {
      id: candidate.id || '',
      name: candidate.name || '',
      email: candidate.email || '',
      phone: candidate.phone || '',
      phoneNumber: candidate.phone || '',
      department: candidate.department || '',
      designation: candidate.designation || '',
      status: 'Active',
      joinDate: candidate.joinDate || '',
      avatar: candidate.photoUrl || '',
      photoUrl: candidate.photoUrl || '',
      dateOfBirth: candidate.dateOfBirth || '',
      gender: candidate.gender || 'male',
      employeeId: candidate.employeeId || '',
    } : null;

    return (
      <EmployeeForm
        isOpen={true}
        onClose={() => { setShowEmployeeForm(false); onClose(false); }}
        onSave={handleEmployeeFormSave}
        employee={existingEmployee as any}
        hideDocumentsStep
      />
    );
  }

  // ── Render: Steps 2-5 as separate modals ──
  const titles: Record<string, string> = {
    documents: 'Collect Documents',
    agreement: 'Sign Agreement / Contract',
    uniform: 'Issue Uniform & Equipment',
    review: 'Review & Onboard',
  };

  return (
    <Dialog open={true} onOpenChange={() => onClose(false)}>
      <DialogContent className="sm:max-w-[1267px] max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg">{titles[stepOverride] || 'Onboarding'}</DialogTitle>
          <DialogDescription>{record?.name} — {record?.designation || record?.department}</DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-5">
          {/* ── Documents ── */}
          {stepOverride === 'documents' && (
            <div className="space-y-4">
              {/* What's actually required */}
              <div className={`flex items-start gap-2.5 p-3 rounded-lg border text-xs
                ${docsValid ? 'bg-green-50/60 border-green-200' : 'bg-amber-50/60 border-amber-200'}`}>
                {docsValid
                  ? <CheckCircle className="h-4 w-4 text-green-600 shrink-0 mt-0.5" />
                  : <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />}
                <div>
                  <p className={`font-medium ${docsValid ? 'text-green-800' : 'text-amber-800'}`}>
                    {docsValid ? 'All required documents collected' : 'Aadhaar and Address Proof are required'}
                  </p>
                  <p className={docsValid ? 'text-green-700' : 'text-amber-700'}>
                    {docsValid
                      ? 'Anything else on this page is optional and can be added later.'
                      : `Still needed: ${docProblems.join(', ')}. Everything else is optional.`}
                  </p>
                </div>
              </div>

              {/* ── Required: Aadhaar + Address Proof ── */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch">
                {/* Aadhaar — always two-sided */}
                <DocCard title="Aadhaar Card" required>
                  <Input
                    value={aadharNumber}
                    onChange={e => setAadharNumber(e.target.value.replace(/\D/g, '').slice(0, 12))}
                    placeholder="12-digit Aadhaar number"
                    maxLength={12}
                    className={showDocErrors && aadharNumber.trim().length !== 12 ? 'border-red-400' : ''}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <DocSlot
                      label="Front Side"
                      file={aadharFile}
                      existingUrl={record?.aadharFileUrl}
                      onPick={setAadharFile}
                      invalid={showDocErrors && !aadhaarFrontOk}
                    />
                    <DocSlot
                      label="Back Side (address)"
                      file={aadharBackFile}
                      existingUrl={record?.aadharBackFileUrl}
                      onPick={setAadharBackFile}
                      invalid={showDocErrors && !aadhaarBackOk}
                    />
                  </div>
                </DocCard>

                {/* Address proof — number of slots depends on the chosen type */}
                <DocCard
                  title="Address Proof"
                  required
                  hint={proof
                    ? (proof.sides === 2
                        ? 'This document carries the address on the back, so both sides are needed.'
                        : 'Single-sided document — one upload is enough.')
                    : 'Pick a document type to see what needs uploading.'}
                >
                  <Select
                    value={addressProofType}
                    onValueChange={v => {
                      setAddressProofType(v);
                      // A single-sided proof has no back side, so drop any stale file
                      if (proofConfig(v)?.sides === 1) setAddressProofBackFile(null);
                    }}
                  >
                    <SelectTrigger className={showDocErrors && !addressProofType ? 'border-red-400' : ''}>
                      <SelectValue placeholder="Select document type" />
                    </SelectTrigger>
                    <SelectContent>
                      {ADDRESS_PROOF_TYPES.map(t => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                          <span className="text-muted-foreground text-[11px] ml-1.5">
                            {t.sides === 2 ? '· 2 sides' : '· 1 side'}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {proof ? (
                    <div className={`grid gap-2 ${proof.sides === 2 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                      <DocSlot
                        label={proof.frontLabel}
                        file={addressProofFile}
                        existingUrl={record?.addressProofFileUrl}
                        onPick={setAddressProofFile}
                        invalid={showDocErrors && !proofFrontOk}
                        aspect={proof.sides === 2 ? '86/54' : '172/54'}
                      />
                      {proof.sides === 2 && (
                        <DocSlot
                          label={proof.backLabel || 'Back Side'}
                          file={addressProofBackFile}
                          existingUrl={record?.addressProofBackFileUrl}
                          onPick={setAddressProofBackFile}
                          invalid={showDocErrors && !proofBackOk}
                        />
                      )}
                    </div>
                  ) : (
                    <div
                      className="w-full rounded-lg border-2 border-dashed border-muted-foreground/20 bg-muted/10 flex items-center justify-center"
                      style={{ aspectRatio: '172/54' }}
                    >
                      <span className="text-[11px] text-muted-foreground">Select a type first</span>
                    </div>
                  )}
                </DocCard>
              </div>

              {/* ── Optional supporting documents ── */}
              <div className="pt-1">
                <p className="text-xs font-medium text-muted-foreground mb-2">
                  Supporting documents — all optional, can be added any time
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 items-stretch">
                  <DocCard title="Passport Photo">
                    <DocSlot
                      label="35mm × 45mm"
                      file={passportPhotoFile}
                      existingUrl={record?.photoUrl}
                      onPick={setPassportPhotoFile}
                      accept="image/jpeg,image/png"
                      aspect="7/9"
                    />
                  </DocCard>

                  <DocCard title="PAN Card">
                    <Input
                      value={panNumber}
                      onChange={e => setPanNumber(e.target.value.toUpperCase().slice(0, 10))}
                      placeholder="10-character PAN"
                      maxLength={10}
                      className="uppercase"
                    />
                    <DocSlot
                      label="PAN Card"
                      file={panFile}
                      existingUrl={record?.panFileUrl}
                      onPick={setPanFile}
                    />
                  </DocCard>

                  <DocCard title="Bank Passbook">
                    <DocSlot
                      label="First page"
                      file={bankPassbookFile}
                      onPick={setBankPassbookFile}
                    />
                  </DocCard>

                  <DocCard title="Cancelled Cheque">
                    <DocSlot
                      label="Cheque leaf"
                      file={cancelledChequeFile}
                      onPick={setCancelledChequeFile}
                    />
                  </DocCard>
                </div>
              </div>
            </div>
          )}

          {/* ── Agreement ── */}
          {stepOverride === 'agreement' && (() => {
            const generated = Boolean(record?.agreementGeneratedAt);
            const uploaded = Boolean(signedAgreementFile || record?.agreementSignedFileUrl);

            // Small numbered/ticked step marker with a connecting rail
            const Marker = ({ n, done, last }: { n: number; done: boolean; last?: boolean }) => (
              <div className="flex flex-col items-center shrink-0">
                <div className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-semibold transition-colors
                  ${done ? 'bg-green-600 text-white' : 'bg-muted text-muted-foreground border'}`}>
                  {done ? <CheckCircle className="h-4 w-4" /> : n}
                </div>
                {!last && <div className={`w-px flex-1 mt-1 ${done ? 'bg-green-600/30' : 'bg-border'}`} />}
              </div>
            );

            return (
              <div className="flex gap-3">
                {/* Rail */}
                <div className="flex flex-col items-center pt-1">
                  <Marker n={1} done={generated} />
                  <div className={`w-px flex-1 my-1 ${generated ? 'bg-green-600/30' : 'bg-border'}`} />
                  <Marker n={2} done={uploaded} last />
                </div>

                <div className="flex-1 min-w-0 space-y-4">
                  {/* ── Step 1: Generate ── */}
                  <div>
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="font-semibold text-sm">Generate the contract</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Downloads a print-ready appointment letter with {record?.name?.split(' ')[0] || 'the employee'}&apos;s details filled in.
                        </p>
                      </div>
                      <Button
                        variant={generated ? 'outline' : 'default'}
                        onClick={handleGenerateAgreement}
                        disabled={saving}
                        className={`shrink-0 gap-2 ${generated ? '' : 'bg-safend-red hover:bg-safend-red/90 text-white'}`}
                      >
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                        {generated ? 'Download again' : 'Generate & Download'}
                      </Button>
                    </div>
                    {generated && (
                      <p className="text-[11px] text-green-700 mt-2">
                        Generated {new Date(record!.agreementGeneratedAt!).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        {' · '}print both copies and get them signed
                      </p>
                    )}
                  </div>

                  <div className="border-t" />

                  {/* ── Step 2: Upload signed copy ── */}
                  <div>
                    <p className="font-semibold text-sm">
                      Upload the signed copy <span className="text-red-500">*</span>
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5 mb-3">
                      Scan or photograph every page. PDF, JPG or PNG.
                    </p>

                    {uploaded ? (
                      // ── Compact confirmation row once a file is in place ──
                      <div className="flex items-center gap-3 p-3 rounded-lg border bg-green-50/60 border-green-200">
                        <div className="h-9 w-9 rounded-lg bg-white border border-green-200 flex items-center justify-center shrink-0">
                          {signedAgreementFile?.type.startsWith('image/')
                            ? <img src={URL.createObjectURL(signedAgreementFile)} alt="" className="h-full w-full object-cover rounded-lg" />
                            : <FileSignature className="h-4 w-4 text-green-600" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-green-800 truncate">
                            {signedAgreementFile?.name || 'Signed agreement on file'}
                          </p>
                          <p className="text-[11px] text-green-700">
                            {signedAgreementFile
                              ? `${(signedAgreementFile.size / 1024).toFixed(0)} KB · ready to save`
                              : 'Previously uploaded'}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {/* View — opens the stored file, or a local preview of the
                              file just picked but not yet uploaded */}
                          {(record?.agreementSignedFileUrl || signedAgreementFile) && (
                            <a
                              href={signedAgreementFile
                                ? URL.createObjectURL(signedAgreementFile)
                                : record!.agreementSignedFileUrl!}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs px-2.5 py-1.5 rounded-md border bg-white hover:bg-muted transition-colors inline-flex items-center gap-1"
                            >
                              <ExternalLink className="h-3 w-3" /> View
                            </a>
                          )}
                          <label className="text-xs px-2.5 py-1.5 rounded-md border bg-white hover:bg-muted cursor-pointer transition-colors">
                            Replace
                            <input type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={e => setSignedAgreementFile(e.target.files?.[0] || null)} />
                          </label>
                          {signedAgreementFile && (
                            <button
                              type="button"
                              onClick={() => setSignedAgreementFile(null)}
                              className="h-8 w-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-red-600 hover:bg-red-50 transition-colors"
                            >✕</button>
                          )}
                        </div>
                      </div>
                    ) : (
                      // ── Wide dropzone while empty ──
                      <label className="flex items-center gap-3 p-4 rounded-lg border-2 border-dashed border-muted-foreground/25 hover:border-safend-red/50 hover:bg-muted/30 cursor-pointer transition-colors">
                        <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                          <FileSignature className="h-5 w-5 text-muted-foreground/60" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium">Click to upload signed contract</p>
                          <p className="text-[11px] text-muted-foreground">PDF, JPG or PNG · max 10 MB</p>
                        </div>
                        <input type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={e => setSignedAgreementFile(e.target.files?.[0] || null)} />
                      </label>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}

          {/* ── Uniform ── */}
          {stepOverride === 'uniform' && (
            <>
              {isLoadingItems ? (
                <div className="flex items-center gap-3 p-4 bg-muted rounded-lg">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground shrink-0" />
                  <p className="text-sm text-muted-foreground">Loading inventory...</p>
                </div>
              ) : uniformItems.length === 0 ? (
                <div className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                  <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
                  <div className="text-sm"><p className="font-medium text-amber-700">No stock available</p><p className="text-xs text-amber-600">Skip or issue later from Office Admin → Inventory.</p></div>
                </div>
              ) : (
                <div className="space-y-3">
                  {uniformLines.map((line, idx) => {
                    // All distinct garment types that have stock
                    const availableSubCats = [...new Set(uniformItems.map(i => i.subCategory))].sort();

                    // Sizes available for the chosen garment type
                    const sizesForSubCat = uniformItems
                      .filter(i => i.subCategory === line.subCategory)
                      .sort((a, b) => (a.size || '').localeCompare(b.size || '', undefined, { numeric: true }));

                    const selected = uniformItems.find(i => i.id === line.itemId);
                    const cfg = selected ? (SUBCAT_ICON[selected.subCategory] ?? DEFAULT_SUBCAT) : DEFAULT_SUBCAT;
                    const Icon = cfg.icon;

                    return (
                      <div key={idx} className="flex items-start gap-3 p-3 rounded-xl border bg-muted/30">
                        {/* Icon badge */}
                        <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 shadow-xs ${selected ? `${cfg.bg}` : 'bg-white border'}`}>
                          {selected
                            ? <Icon className={`h-4 w-4 ${cfg.color}`} />
                            : <span className="text-sm font-semibold text-muted-foreground">{idx + 1}</span>
                          }
                        </div>

                        <div className="flex-1 min-w-0 space-y-2.5">
                          {/* Item type */}
                          <Select
                            value={line.subCategory}
                            onValueChange={v => updateUniformLine(idx, { subCategory: v, size: '', itemId: '' })}
                          >
                            <SelectTrigger className="bg-white">
                              <SelectValue placeholder="Choose item type…" />
                            </SelectTrigger>
                            <SelectContent>
                              {availableSubCats.map(sc => {
                                const c = SUBCAT_ICON[sc] ?? DEFAULT_SUBCAT;
                                const I = c.icon;
                                return (
                                  <SelectItem key={sc} value={sc}>
                                    <span className="flex items-center gap-2">
                                      <I className={`h-3.5 w-3.5 ${c.color}`} />
                                      {SUB_CATEGORY_LABELS[sc] || sc}
                                    </span>
                                  </SelectItem>
                                );
                              })}
                            </SelectContent>
                          </Select>

                          {/* Size pills + qty — only once a type is chosen */}
                          {line.subCategory && (
                            <div className="flex items-center justify-between gap-4 flex-wrap">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-xs text-muted-foreground mr-0.5">Size</span>
                                {sizesForSubCat.map(item => {
                                  const label = item.size || 'Free';
                                  const active = line.itemId === item.id;
                                  const low = item.currentStock <= 2;
                                  return (
                                    <button
                                      key={item.id}
                                      type="button"
                                      onClick={() => updateUniformLine(idx, { size: item.size || 'FREE', itemId: item.id })}
                                      title={`${item.currentStock} in stock`}
                                      className={`relative h-7 min-w-9 px-2 rounded-md text-xs font-medium border transition-all
                                        ${active
                                          ? 'bg-[#D71920] text-white border-[#D71920] shadow-xs'
                                          : 'bg-white text-foreground/80 border-input hover:border-[#D71920]/50 hover:text-[#D71920]'}`}
                                    >
                                      {label}
                                      {low && !active && (
                                        <span className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-amber-400" />
                                      )}
                                    </button>
                                  );
                                })}
                              </div>

                              {/* Qty stepper */}
                              {selected && (
                                <div className="flex items-center gap-2 bg-white border rounded-lg h-8 px-2.5 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => updateUniformLine(idx, { qty: Math.max(1, line.qty - 1) })}
                                    className="text-muted-foreground hover:text-foreground text-base leading-none select-none w-4"
                                  >−</button>
                                  <span className="w-7 text-center text-sm font-semibold tabular-nums">{line.qty}</span>
                                  <button
                                    type="button"
                                    onClick={() => updateUniformLine(idx, { qty: Math.min(selected.currentStock, line.qty + 1) })}
                                    disabled={line.qty >= selected.currentStock}
                                    className="text-muted-foreground hover:text-foreground disabled:opacity-25 text-base leading-none select-none w-4"
                                  >+</button>
                                  <span className="text-[10px] text-muted-foreground border-l pl-2 ml-0.5">
                                    of {selected.currentStock}
                                  </span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Remove */}
                        <button
                          type="button"
                          onClick={() => removeUniformLine(idx)}
                          disabled={uniformLines.length === 1}
                          className="h-9 w-9 shrink-0 flex items-center justify-center rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-50 disabled:opacity-25 disabled:pointer-events-none transition-colors"
                        >
                          ✕
                        </button>
                      </div>
                    );
                  })}

                  <button
                    type="button"
                    onClick={addUniformLine}
                    className="w-full h-10 rounded-xl border border-dashed border-muted-foreground/30 text-sm text-muted-foreground hover:border-[#D71920] hover:text-[#D71920] transition-colors flex items-center justify-center gap-1.5"
                  >
                    <span className="text-base leading-none">+</span> Add another item
                  </button>

                  {record?.uniformIssuedAt && (
                    <p className="text-xs text-green-600 flex items-center gap-1 pl-1">
                      <CheckCircle className="h-3.5 w-3.5" /> Items were previously issued to this employee
                    </p>
                  )}
                </div>
              )}
            </>
          )}

          {/* ── Review ── */}
          {stepOverride === 'review' && record && (() => {
            const formatDate = (value?: string, includeTime = false) => {
              if (!value) return 'Not recorded';
              return new Intl.DateTimeFormat('en-IN', includeTime
                ? { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }
                : { day: 'numeric', month: 'short', year: 'numeric' }
              ).format(new Date(value));
            };
            const maskValue = (value?: string) => value
              ? `${'•'.repeat(Math.max(0, value.length - 4))}${value.slice(-4)}`
              : 'Not provided';
            const addressProof = proofConfig(record.addressProofType || '')?.label || record.addressProofType || 'Not provided';
            const documentChecks = [
              { label: 'Aadhaar number', complete: Boolean(record.aadharNumber) },
              { label: 'Aadhaar front', complete: Boolean(record.aadharFileUrl) },
              { label: 'Aadhaar back', complete: Boolean(record.aadharBackFileUrl) },
              { label: 'Address proof', complete: Boolean(record.addressProofFileUrl) },
              { label: 'Signed agreement', complete: Boolean(record.agreementSignedFileUrl) },
            ];
            const completedChecks = documentChecks.filter(check => check.complete).length;
            const statusCards = [
              { label: 'Profile', value: record.name && record.phone ? 'Complete' : 'Needs details', complete: Boolean(record.name && record.phone) },
              { label: 'Documents', value: `${completedChecks}/${documentChecks.length} verified`, complete: Boolean(record.documentsCompleted) },
              { label: 'Agreement', value: record.agreementSignedFileUrl ? 'Signed' : 'Pending', complete: Boolean(record.agreementSignedFileUrl) },
              { label: 'Uniform', value: record.uniformIssuedAt ? 'Issued' : 'Not recorded', complete: Boolean(record.uniformIssuedAt) },
            ];

            return (
              <div className="space-y-5">
                <section className="rounded-xl border bg-muted/20 overflow-hidden">
                  <div className="h-1 bg-linear-to-r from-safend-red via-red-400 to-emerald-500" />
                  <div className="p-4 md:p-5 flex flex-col lg:flex-row gap-5 lg:items-center">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="h-16 w-16 rounded-xl overflow-hidden bg-background border shrink-0 flex items-center justify-center">
                        {record.photoUrl ? (
                          <img src={record.photoUrl} alt={`${record.name}'s profile`} className="h-full w-full object-cover" />
                        ) : (
                          <span className="text-xl font-semibold text-muted-foreground">{record.name.slice(0, 1).toUpperCase()}</span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-lg font-semibold truncate">{record.name}</p>
                        <p className="text-sm text-muted-foreground truncate">{record.designation || 'Designation not assigned'}</p>
                        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          <span>{record.department || 'Department not assigned'}</span>
                          {record.employeeId && <span>Provisional ID: {record.employeeId}</span>}
                          {record.branchId && <span>Branch: {record.branchId}</span>}
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 lg:w-[450px] gap-2">
                      {statusCards.map(status => (
                        <div key={status.label} className={`rounded-lg border px-3 py-2.5 ${status.complete ? 'border-emerald-200 bg-emerald-50/70' : 'border-amber-200 bg-amber-50/70'}`}>
                          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                            {status.complete ? <CheckCircle className="h-3.5 w-3.5 text-emerald-600" /> : <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />}
                            {status.label}
                          </div>
                          <p className={`mt-1 text-xs font-semibold ${status.complete ? 'text-emerald-800' : 'text-amber-800'}`}>{status.value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </section>

                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                  <section className="rounded-xl border p-4 space-y-3">
                    <div>
                      <p className="font-semibold text-sm">Employee & employment details</p>
                      <p className="text-xs text-muted-foreground">Information that will create the employee directory record.</p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-3 text-sm">
                      <div><p className="text-[11px] text-muted-foreground">Mobile number</p><p className="font-medium break-all">{record.phone || 'Not provided'}</p></div>
                      <div><p className="text-[11px] text-muted-foreground">Email address</p><p className="font-medium break-all">{record.email || 'Not provided'}</p></div>
                      <div><p className="text-[11px] text-muted-foreground">Gender</p><p className="font-medium capitalize">{record.gender || 'Not provided'}</p></div>
                      <div><p className="text-[11px] text-muted-foreground">Date of birth</p><p className="font-medium">{formatDate(record.dateOfBirth)}</p></div>
                      <div><p className="text-[11px] text-muted-foreground">Department</p><p className="font-medium">{record.department || 'Not assigned'}</p></div>
                      <div><p className="text-[11px] text-muted-foreground">Designation</p><p className="font-medium">{record.designation || 'Not assigned'}</p></div>
                      <div><p className="text-[11px] text-muted-foreground">Joining date</p><p className="font-medium">{formatDate(record.joinDate)}</p></div>
                      <div><p className="text-[11px] text-muted-foreground">Onboarding branch</p><p className="font-medium">{record.branchId || 'Not recorded'}</p></div>
                    </div>
                  </section>

                  <section className="rounded-xl border p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-sm">Identity & supporting documents</p>
                        <p className="text-xs text-muted-foreground">Sensitive identifiers are masked; open a stored file only when required.</p>
                      </div>
                      <span className={`shrink-0 text-[11px] font-medium px-2 py-1 rounded-full ${record.documentsCompleted ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                        {record.documentsCompleted ? 'Documents complete' : 'Needs review'}
                      </span>
                    </div>
                    <div className="space-y-2.5 text-sm">
                      <div className="flex items-center justify-between gap-3"><div><p className="text-[11px] text-muted-foreground">Aadhaar number</p><p className="font-medium tracking-wide">{maskValue(record.aadharNumber)}</p></div><div className="flex gap-1.5">{record.aadharFileUrl && <a href={record.aadharFileUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-safend-red hover:underline inline-flex items-center gap-1"><ExternalLink className="h-3 w-3" />Front</a>}{record.aadharBackFileUrl && <a href={record.aadharBackFileUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-safend-red hover:underline inline-flex items-center gap-1"><ExternalLink className="h-3 w-3" />Back</a>}</div></div>
                      <div className="flex items-center justify-between gap-3 border-t pt-2.5"><div><p className="text-[11px] text-muted-foreground">PAN number</p><p className="font-medium tracking-wide">{maskValue(record.panNumber)}</p></div>{record.panFileUrl && <a href={record.panFileUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-safend-red hover:underline inline-flex items-center gap-1"><ExternalLink className="h-3 w-3" />View PAN</a>}</div>
                      <div className="flex items-center justify-between gap-3 border-t pt-2.5"><div className="min-w-0"><p className="text-[11px] text-muted-foreground">Address proof</p><p className="font-medium truncate">{addressProof}</p></div><div className="flex gap-1.5 shrink-0">{record.addressProofFileUrl && <a href={record.addressProofFileUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-safend-red hover:underline inline-flex items-center gap-1"><ExternalLink className="h-3 w-3" />File</a>}{record.addressProofBackFileUrl && <a href={record.addressProofBackFileUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-safend-red hover:underline inline-flex items-center gap-1"><ExternalLink className="h-3 w-3" />Back</a>}</div></div>
                      <div className="flex items-center justify-between gap-3 border-t pt-2.5"><div><p className="text-[11px] text-muted-foreground">Passport photo</p><p className="font-medium">{record.photoUrl ? 'Uploaded' : 'Not provided'}</p></div>{record.photoUrl && <a href={record.photoUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-safend-red hover:underline inline-flex items-center gap-1"><ExternalLink className="h-3 w-3" />View photo</a>}</div>
                    </div>
                  </section>

                  <section className="rounded-xl border p-4 space-y-3">
                    <div>
                      <p className="font-semibold text-sm">Agreement & issue record</p>
                      <p className="text-xs text-muted-foreground">Confirm contractual acceptance and issue status before onboarding.</p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className={`rounded-lg border p-3 ${record.agreementSignedFileUrl ? 'border-emerald-200 bg-emerald-50/50' : 'border-amber-200 bg-amber-50/50'}`}>
                        <div className="flex items-center justify-between gap-2"><p className="text-[11px] text-muted-foreground">Signed agreement</p>{record.agreementSignedFileUrl ? <CheckCircle className="h-4 w-4 text-emerald-600" /> : <AlertTriangle className="h-4 w-4 text-amber-600" />}</div>
                        <p className="mt-1 text-sm font-semibold">{record.agreementSignedFileUrl ? 'On file' : 'Not on file'}</p>
                        <p className="mt-1 text-[11px] text-muted-foreground">Signed {formatDate(record.agreementSignedAt, true)}</p>
                        {record.agreementSignedFileUrl && <a href={record.agreementSignedFileUrl} target="_blank" rel="noopener noreferrer" className="mt-2 text-xs text-safend-red hover:underline inline-flex items-center gap-1"><ExternalLink className="h-3 w-3" />Open signed copy</a>}
                      </div>
                      <div className={`rounded-lg border p-3 ${record.uniformIssuedAt ? 'border-emerald-200 bg-emerald-50/50' : 'border-amber-200 bg-amber-50/50'}`}>
                        <div className="flex items-center justify-between gap-2"><p className="text-[11px] text-muted-foreground">Uniform / equipment</p>{record.uniformIssuedAt ? <CheckCircle className="h-4 w-4 text-emerald-600" /> : <AlertTriangle className="h-4 w-4 text-amber-600" />}</div>
                        <p className="mt-1 text-sm font-semibold">{record.uniformIssuedAt ? 'Issued' : 'No issue recorded'}</p>
                        <p className="mt-1 text-[11px] text-muted-foreground">{record.uniformIssuedAt ? `Issued ${formatDate(record.uniformIssuedAt, true)}` : 'Confirm issue or intentional skip'}</p>
                        {record.uniformDistributionId && <p className="mt-2 text-[11px] text-muted-foreground">Distribution ref: {record.uniformDistributionId}</p>}
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-2 border-t pt-3 text-sm"><div><p className="text-[11px] text-muted-foreground">Agreement generated</p><p className="font-medium">{formatDate(record.agreementGeneratedAt, true)}</p></div><div><p className="text-[11px] text-muted-foreground">Current workflow stage</p><p className="font-medium capitalize">{record.stage}</p></div></div>
                  </section>

                  <section className="rounded-xl border p-4 space-y-3">
                    <div>
                      <p className="font-semibold text-sm">Onboarding audit trail</p>
                      <p className="text-xs text-muted-foreground">Reference information for the final HR review.</p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-3 text-sm">
                      <div><p className="text-[11px] text-muted-foreground">Candidate reference</p><p className="font-mono text-xs break-all">{record.id || 'Not recorded'}</p></div>
                      <div><p className="text-[11px] text-muted-foreground">Created by</p><p className="font-medium">{record.createdBy || 'Not recorded'}</p></div>
                      <div><p className="text-[11px] text-muted-foreground">Onboarding started</p><p className="font-medium">{formatDate(record.createdAt, true)}</p></div>
                      <div><p className="text-[11px] text-muted-foreground">Last updated</p><p className="font-medium">{formatDate(record.updatedAt, true)}</p></div>
                    </div>
                  </section>
                </div>

                <div className="rounded-xl border border-dashed bg-muted/20 p-4 space-y-2">
                  <Label htmlFor="onboarding-review-notes" className="font-semibold">Final HR notes</Label>
                  <p className="text-xs text-muted-foreground">Record exceptions, missing information, placement instructions, or conditions for approval. These notes are retained on the onboarding record.</p>
                  <Textarea id="onboarding-review-notes" value={reviewNotes} onChange={e => setReviewNotes(e.target.value)} rows={3} placeholder="Add final remarks for the employee record…" />
                </div>
              </div>
            );
          })()}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onClose(false)}>Cancel</Button>
          {stepOverride === 'documents' && (
            <Button className="bg-safend-red hover:bg-safend-red/90 text-white gap-2" onClick={handleSaveDocuments} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save Documents
            </Button>
          )}
          {stepOverride === 'agreement' && (
            <Button className="bg-safend-red hover:bg-safend-red/90 text-white gap-2" onClick={handleSaveAgreement} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save Agreement
            </Button>
          )}
          {stepOverride === 'uniform' && (
            <Button className="bg-safend-red hover:bg-safend-red/90 text-white gap-2" onClick={handleSaveUniform} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} {uniformLines.some(l => l.itemId) ? 'Issue & Save' : 'Skip & Save'}
            </Button>
          )}
          {stepOverride === 'review' && (
            <Button className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2" onClick={handleFinalize} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Onboard Employee
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
