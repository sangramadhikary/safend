'use client';

/**
 * Employee Resignation Form — Requirements 4.1, 4.2, 4.3, 4.6
 *
 * Mobile-first form for submitting a resignation:
 * - Capture resignation letter via camera or upload (JPEG/PNG/PDF, max 10 MB)
 * - Display notice period (30 days default) and calculated last working day
 * - Reason textarea (optional)
 * - Three conditions checkboxes (all required)
 * - Validates letter is attached before allowing submit
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Camera,
  CheckCircle2,
  FileText,
  Loader2,
  Upload,
  X,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { HR_CONFIG } from '@/config';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface EmployeeResignationFormProps {
  employeeCode: string;
  employeeName: string;
  postId: string;
  onBack: () => void;
  onClose: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];
const MAX_FILE_SIZE_MB = 10;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
const DEFAULT_NOTICE_DAYS = HR_CONFIG.RESIGNATION.MAX_NOTICE_DAYS; // 30 days

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function calculateLastWorkingDay(noticeDays: number): Date {
  const date = new Date();
  date.setDate(date.getDate() + noticeDays);
  return date;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function isValidFileType(file: File): boolean {
  return ACCEPTED_TYPES.includes(file.type);
}

function isValidFileSize(file: File): boolean {
  return file.size <= MAX_FILE_SIZE_BYTES;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function EmployeeResignationForm({
  employeeCode,
  employeeName,
  postId,
  onBack,
  onClose,
}: EmployeeResignationFormProps) {
  // ── File state ──
  const [file, setFile] = useState<File | null>(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  // ── Form state ──
  const [reason, setReason] = useState('');
  const [acceptNoticePeriod, setAcceptNoticePeriod] = useState(false);
  const [acceptDuesSettlement, setAcceptDuesSettlement] = useState(false);
  const [acceptHandover, setAcceptHandover] = useState(false);

  // ── Submission state ──
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  // ── Validation state ──
  const [showValidationError, setShowValidationError] = useState(false);

  // ── Refs ──
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);

  // ── Computed values ──
  const lastWorkingDay = useMemo(() => calculateLastWorkingDay(DEFAULT_NOTICE_DAYS), []);
  const allConditionsAccepted = acceptNoticePeriod && acceptDuesSettlement && acceptHandover;
  const canSubmit = file !== null && allConditionsAccepted;

  // ── File handling ──

  const handleFileSelected = useCallback((selectedFile: File | undefined) => {
    setFileError(null);
    setShowValidationError(false);

    if (!selectedFile) return;

    if (!isValidFileType(selectedFile)) {
      setFileError('Invalid file type. Only JPEG, PNG, and PDF files are accepted.');
      return;
    }

    if (!isValidFileSize(selectedFile)) {
      setFileError(`File size exceeds ${MAX_FILE_SIZE_MB} MB limit. Please choose a smaller file.`);
      return;
    }

    // Revoke previous preview URL
    if (filePreviewUrl) {
      URL.revokeObjectURL(filePreviewUrl);
    }

    setFile(selectedFile);

    // Create preview for images
    if (selectedFile.type.startsWith('image/')) {
      setFilePreviewUrl(URL.createObjectURL(selectedFile));
    } else {
      setFilePreviewUrl(null);
    }
  }, [filePreviewUrl]);

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      handleFileSelected(e.target.files?.[0]);
      // Reset input so same file can be re-selected
      e.target.value = '';
    },
    [handleFileSelected],
  );

  const handleRemoveFile = useCallback(() => {
    if (filePreviewUrl) {
      URL.revokeObjectURL(filePreviewUrl);
    }
    setFile(null);
    setFilePreviewUrl(null);
    setFileError(null);
  }, [filePreviewUrl]);

  // ── Submission ──

  const handleSubmit = useCallback(async () => {
    setSubmitError(null);

    // Validate letter is attached (R4.6)
    if (!file) {
      setShowValidationError(true);
      return;
    }

    if (!allConditionsAccepted) {
      return;
    }

    setSubmitting(true);

    try {
      const formData = new FormData();
      formData.append('employee_code', employeeCode);
      formData.append('post_id', postId);
      formData.append('resignation_letter', file, file.name);
      if (reason.trim()) {
        formData.append('reason', reason.trim());
      }

      const res = await fetch('/api/employee-self-service/resignation', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json().catch(() => null);

      if (data && data.ok === true) {
        setSubmitted(true);
      } else {
        const errorMsg =
          data && typeof data.error === 'string'
            ? data.error
            : 'Submission failed. Please try again.';
        setSubmitError(errorMsg);
      }
    } catch {
      setSubmitError('Network problem. Check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  }, [file, allConditionsAccepted, employeeCode, postId, reason]);

  // ── Success state ──
  if (submitted) {
    return (
      <div className="flex flex-col items-center rounded-[16px] border border-white/10 bg-white/4 p-6 text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full border bg-green-500/10 border-green-500/20 text-green-300">
          <CheckCircle2 className="h-7 w-7" />
        </div>
        <h2 className="mb-2 font-heading text-[16px] font-semibold text-white">
          Resignation Submitted
        </h2>
        <p className="mb-5 max-w-full text-[13px] font-body leading-[1.6] text-white/70">
          Your resignation has been received. Your last working day is{' '}
          <span className="font-semibold text-white">{formatDate(lastWorkingDay)}</span>.
          HR will contact you regarding the deboarding process.
        </p>
        <Button onClick={onClose} className="w-full">
          Done
        </Button>
      </div>
    );
  }

  // ── Form ──
  return (
    <div className="flex flex-col gap-4">
      {/* Back button */}
      <button
        type="button"
        onClick={onBack}
        aria-label="Back to hub"
        className="flex items-center gap-1.5 text-[13px] font-medium text-white/60 transition-colors hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" />
        Back
      </button>

      {/* Header */}
      <div className="rounded-[16px] border border-white/10 bg-white/4 px-5 py-4">
        <h2 className="font-heading text-[16px] font-semibold text-white">
          Submit Resignation
        </h2>
        <p className="mt-1 text-[13px] font-body text-white/60">
          {employeeName} • {employeeCode}
        </p>
      </div>

      {/* Notice period info */}
      <div className="rounded-[16px] border border-white/10 bg-white/4 px-5 py-4">
        <p className="text-[12px] font-body text-white/50 uppercase tracking-wide">
          Notice Period
        </p>
        <p className="mt-1 font-heading text-[15px] font-semibold text-white">
          {DEFAULT_NOTICE_DAYS} days
        </p>
        <p className="mt-1 text-[13px] font-body text-white/60">
          Last working day:{' '}
          <span className="font-semibold text-safend-red">{formatDate(lastWorkingDay)}</span>
        </p>
      </div>

      {/* Resignation letter upload */}
      <div className="rounded-[16px] border border-white/10 bg-white/4 px-5 py-4">
        <Label className="text-[12px] font-medium text-white/70">
          Resignation Letter <span className="text-red-400">*</span>
        </Label>
        <p className="mt-1 mb-3 text-[12px] font-body text-white/40">
          Capture a photo or upload a file (JPEG, PNG, or PDF, max {MAX_FILE_SIZE_MB} MB)
        </p>

        {/* File preview */}
        {file && (
          <div className="mb-3 flex items-center gap-3 rounded-[10px] border border-white/10 bg-white/6 p-3">
            {filePreviewUrl ? (
              <img
                src={filePreviewUrl}
                alt="Resignation letter preview"
                className="h-14 w-14 rounded-[8px] object-cover"
              />
            ) : (
              <div className="flex h-14 w-14 items-center justify-center rounded-[8px] bg-white/6">
                <FileText className="h-6 w-6 text-white/50" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium text-white">{file.name}</p>
              <p className="text-[11px] text-white/40">
                {(file.size / (1024 * 1024)).toFixed(2)} MB
              </p>
            </div>
            <button
              type="button"
              onClick={handleRemoveFile}
              aria-label="Remove file"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white/50 hover:bg-white/10 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Upload buttons */}
        {!file && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              className="flex flex-1 items-center justify-center gap-2 rounded-[10px] border border-white/10 bg-white/6 px-4 py-3 text-[13px] font-medium text-white transition-colors hover:border-safend-red/40 hover:bg-safend-red/8"
            >
              <Camera className="h-4 w-4" />
              Camera
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex flex-1 items-center justify-center gap-2 rounded-[10px] border border-white/10 bg-white/6 px-4 py-3 text-[13px] font-medium text-white transition-colors hover:border-safend-red/40 hover:bg-safend-red/8"
            >
              <Upload className="h-4 w-4" />
              Upload
            </button>
          </div>
        )}

        {/* Hidden file inputs */}
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/jpeg,image/png"
          capture="environment"
          onChange={handleFileInputChange}
          className="hidden"
          aria-hidden="true"
        />
        <input
          ref={fileInputRef}
          type="file"
          accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf"
          onChange={handleFileInputChange}
          className="hidden"
          aria-hidden="true"
        />

        {/* File error */}
        {fileError && (
          <div className="mt-2 flex items-start gap-2 rounded-[10px] border border-red-500/20 bg-red-500/10 p-3 text-[12px] text-red-200">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{fileError}</span>
          </div>
        )}

        {/* Validation error — no file attached on submit attempt */}
        {showValidationError && !file && (
          <div className="mt-2 flex items-start gap-2 rounded-[10px] border border-red-500/20 bg-red-500/10 p-3 text-[12px] text-red-200">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>Please attach your resignation letter before submitting.</span>
          </div>
        )}
      </div>

      {/* Reason textarea */}
      <div className="rounded-[16px] border border-white/10 bg-white/4 px-5 py-4">
        <Label htmlFor="resignation-reason" className="text-[12px] font-medium text-white/70">
          Reason (optional)
        </Label>
        <textarea
          id="resignation-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Briefly describe your reason for resignation…"
          rows={3}
          maxLength={500}
          className="mt-2 w-full resize-none rounded-[10px] border border-white/10 bg-white/[0.07] px-3 py-2.5 text-[13px] text-white placeholder:text-white/30 focus:border-safend-red/40 focus:outline-hidden focus:ring-1 focus:ring-safend-red/30"
        />
      </div>

      {/* Conditions checkboxes (R4.3) */}
      <div className="rounded-[16px] border border-white/10 bg-white/4 px-5 py-4">
        <p className="mb-3 text-[12px] font-medium text-white/70 uppercase tracking-wide">
          Conditions <span className="text-red-400">*</span>
        </p>
        <div className="space-y-3">
          {/* Notice period acknowledgment */}
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={acceptNoticePeriod}
              onChange={(e) => setAcceptNoticePeriod(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-white/20 bg-white/[0.07] text-safend-red focus:ring-safend-red/30"
            />
            <span className="text-[13px] font-body text-white/70 leading-normal">
              I acknowledge the {DEFAULT_NOTICE_DAYS}-day notice period. My last working day
              will be <span className="font-semibold text-white">{formatDate(lastWorkingDay)}</span>.
            </span>
          </label>

          {/* Dues settlement */}
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={acceptDuesSettlement}
              onChange={(e) => setAcceptDuesSettlement(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-white/20 bg-white/[0.07] text-safend-red focus:ring-safend-red/30"
            />
            <span className="text-[13px] font-body text-white/70 leading-normal">
              I understand that any outstanding dues (advances, deposits, uniform fees) will be
              settled from my final salary before clearance.
            </span>
          </label>

          {/* Handover expectations */}
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={acceptHandover}
              onChange={(e) => setAcceptHandover(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-white/20 bg-white/[0.07] text-safend-red focus:ring-safend-red/30"
            />
            <span className="text-[13px] font-body text-white/70 leading-normal">
              I agree to complete the handover of all assigned responsibilities and equipment
              during the notice period.
            </span>
          </label>
        </div>
      </div>

      {/* Submit error */}
      {submitError && (
        <div className="flex items-start gap-2 rounded-[10px] border border-red-500/20 bg-red-500/10 p-3 text-[13px] text-red-200">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{submitError}</span>
        </div>
      )}

      {/* Submit button */}
      <Button
        onClick={() => void handleSubmit()}
        disabled={submitting || !canSubmit}
        className="w-full"
      >
        {submitting ? (
          <span className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Submitting…
          </span>
        ) : (
          'Submit Resignation'
        )}
      </Button>
    </div>
  );
}

export default EmployeeResignationForm;
