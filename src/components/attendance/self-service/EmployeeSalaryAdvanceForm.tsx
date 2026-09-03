'use client';

/**
 * EmployeeSalaryAdvanceForm — Requirements 3.1, 3.2, 3.3, 3.6, 3.7, 3.8
 *
 * Mobile-first form displayed within the QuickAttendanceScanner overlay
 * after the employee selects "Salary Advance" from the Self-Service Hub.
 *
 * Fetches accumulated salary on mount, shows max allowed advance (50%),
 * validates amount, displays request count and eligibility, requires
 * conditions acceptance, and submits to the advance API.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  IndianRupee,
  Loader2,
  RefreshCw,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { HR_CONFIG } from '@/config';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface EmployeeSalaryAdvanceFormProps {
  employeeCode: string;
  employeeName: string;
  postId: string;
  onBack: () => void;
  onClose: () => void;
}

interface AccumulatedSalaryData {
  accumulatedSalary: number;
  maxAdvance: number;
  requestsThisMonth: number;
  nextEligibleDate: string | null;
}

type FormState = 'loading' | 'error' | 'ready' | 'submitting' | 'success';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const MAX_REQUESTS_PER_MONTH = HR_CONFIG.SALARY_ADVANCE.MAX_REQUESTS_PER_MONTH;

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function EmployeeSalaryAdvanceForm({
  employeeCode,
  employeeName,
  postId,
  onBack,
  onClose,
}: EmployeeSalaryAdvanceFormProps) {
  // ── State ──
  const [formState, setFormState] = useState<FormState>('loading');
  const [salaryData, setSalaryData] = useState<AccumulatedSalaryData | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const [amount, setAmount] = useState<string>('');
  const [reason, setReason] = useState<string>('');
  const [conditionsAccepted, setConditionsAccepted] = useState(false);

  const [submitError, setSubmitError] = useState<string | null>(null);

  // ── Fetch accumulated salary data on mount ──
  const fetchSalaryData = useCallback(async () => {
    setFormState('loading');
    setFetchError(null);

    try {
      const res = await fetch(
        `/api/employee-self-service/accumulated-salary?employee_code=${encodeURIComponent(employeeCode)}`
      );
      const data = await res.json();

      if (!res.ok || data.ok === false) {
        setFetchError(data.error || 'Failed to fetch salary information.');
        setFormState('error');
        return;
      }

      setSalaryData({
        accumulatedSalary: data.accumulatedSalary,
        maxAdvance: data.maxAdvance,
        requestsThisMonth: data.requestsThisMonth,
        nextEligibleDate: data.nextEligibleDate,
      });
      setFormState('ready');
    } catch {
      setFetchError('Network error. Check your connection and try again.');
      setFormState('error');
    }
  }, [employeeCode]);

  useEffect(() => {
    void fetchSalaryData();
  }, [fetchSalaryData]);

  // ── Derived eligibility checks ──
  const isMonthlyLimitReached = (salaryData?.requestsThisMonth ?? 0) >= MAX_REQUESTS_PER_MONTH;
  const isGapNotMet = salaryData?.nextEligibleDate != null;
  const hasNoAccumulated = (salaryData?.accumulatedSalary ?? 0) === 0;
  const isFormDisabled = isMonthlyLimitReached || isGapNotMet || hasNoAccumulated;

  // ── Amount validation ──
  const parsedAmount = parseFloat(amount);
  const isAmountValid =
    !isNaN(parsedAmount) &&
    parsedAmount > 0 &&
    parsedAmount <= (salaryData?.maxAdvance ?? 0);

  const canSubmit =
    formState === 'ready' &&
    !isFormDisabled &&
    isAmountValid &&
    conditionsAccepted;

  // ── Submit handler ──
  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;

    setFormState('submitting');
    setSubmitError(null);

    try {
      const res = await fetch('/api/employee-self-service/advance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employee_code: employeeCode,
          post_id: postId,
          amount: Math.round(parsedAmount),
          reason: reason.trim() || undefined,
        }),
      });

      const data = await res.json();

      if (res.ok && data.ok === true) {
        setFormState('success');
      } else {
        setSubmitError(data.error || 'Submission failed. Please try again.');
        setFormState('ready');
      }
    } catch {
      setSubmitError('Network error. Check your connection and try again.');
      setFormState('ready');
    }
  }, [canSubmit, employeeCode, postId, parsedAmount, reason]);

  // ── Format currency ──
  const formatCurrency = (value: number) =>
    `₹${value.toLocaleString('en-IN')}`;

  // ── Format date for display ──
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  // ── Render ──

  // Success state
  if (formState === 'success') {
    return (
      <div className="flex flex-col items-center rounded-[16px] border border-white/10 bg-white/4 p-6 text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-green-500/20 bg-green-500/10 text-green-300">
          <CheckCircle2 className="h-7 w-7" />
        </div>
        <h2 className="mb-2 font-heading text-[16px] font-semibold text-white">
          Advance Request Submitted
        </h2>
        <p className="mb-5 max-w-full text-[13px] font-body leading-[1.6] text-white/70">
          Your salary advance request of {formatCurrency(Math.round(parsedAmount))} has been
          submitted for approval. HR will review and process your request.
        </p>
        <Button onClick={onClose} className="w-full">
          Done
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Back button */}
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1.5 text-[13px] font-medium text-white/60 transition-colors hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to hub
      </button>

      {/* Header */}
      <div className="rounded-[16px] border border-white/10 bg-white/4 px-5 py-4">
        <div className="flex items-center gap-2">
          <IndianRupee className="h-5 w-5 text-safend-red" />
          <h2 className="font-heading text-[16px] font-semibold text-white">
            Salary Advance
          </h2>
        </div>
        <p className="mt-1 text-[12px] font-body text-white/50">
          {employeeName} &middot; {employeeCode}
        </p>
      </div>

      {/* Loading state */}
      {formState === 'loading' && (
        <div className="flex flex-col items-center rounded-[16px] border border-white/10 bg-white/4 p-6">
          <Loader2 className="h-6 w-6 animate-spin text-safend-red" />
          <p className="mt-3 text-[13px] font-body text-white/60">
            Fetching salary information…
          </p>
        </div>
      )}

      {/* Error state */}
      {formState === 'error' && (
        <div className="flex flex-col items-center rounded-[16px] border border-white/10 bg-white/4 p-6 text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-red-500/20 bg-red-500/10 text-red-300">
            <AlertCircle className="h-6 w-6" />
          </div>
          <p className="mb-4 text-[13px] font-body text-white/70">
            {fetchError}
          </p>
          <Button onClick={fetchSalaryData} className="w-full">
            <RefreshCw className="mr-2 h-4 w-4" /> Retry
          </Button>
        </div>
      )}

      {/* Form content (ready / submitting state) */}
      {(formState === 'ready' || formState === 'submitting') && salaryData && (
        <div className="flex flex-col gap-4">
          {/* Salary info card */}
          <div className="rounded-[16px] border border-white/10 bg-white/4 p-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[11px] font-body uppercase tracking-wide text-white/40">
                  Accumulated Salary
                </p>
                <p className="mt-0.5 font-heading text-[15px] font-semibold text-white">
                  {formatCurrency(salaryData.accumulatedSalary)}
                </p>
              </div>
              <div>
                <p className="text-[11px] font-body uppercase tracking-wide text-white/40">
                  Max Advance (50%)
                </p>
                <p className="mt-0.5 font-heading text-[15px] font-semibold text-safend-red">
                  {formatCurrency(salaryData.maxAdvance)}
                </p>
              </div>
            </div>

            {/* Request count */}
            <div className="mt-3 border-t border-white/6 pt-3">
              <p className="text-[12px] font-body text-white/60">
                {salaryData.requestsThisMonth} of {MAX_REQUESTS_PER_MONTH} requests used this month
              </p>
            </div>

            {/* Next eligible date (if gap not met) */}
            {salaryData.nextEligibleDate && (
              <div className="mt-2">
                <p className="text-[12px] font-body text-amber-300/80">
                  Next eligible date: {formatDate(salaryData.nextEligibleDate)}
                </p>
              </div>
            )}
          </div>

          {/* Disabled form warnings */}
          {isFormDisabled && (
            <div className="flex items-start gap-2 rounded-[10px] border border-amber-500/20 bg-amber-500/10 p-3">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
              <p className="text-[12px] font-body text-amber-200/80">
                {isMonthlyLimitReached
                  ? 'Monthly limit reached. You can request again next month.'
                  : isGapNotMet
                    ? `Minimum 7-day gap required. You can request again on ${formatDate(salaryData.nextEligibleDate!)}.`
                    : 'No salary has been accumulated yet. Work more days to accumulate eligible salary.'}
              </p>
            </div>
          )}

          {/* Amount input */}
          <div className="rounded-[16px] border border-white/10 bg-white/4 p-4">
            <div className="space-y-1.5">
              <Label
                htmlFor="advance-amount"
                className="text-[12px] font-medium text-white/70"
              >
                Advance Amount (₹)
              </Label>
              <Input
                id="advance-amount"
                type="number"
                inputMode="numeric"
                min={1}
                max={salaryData.maxAdvance}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={`Max ${formatCurrency(salaryData.maxAdvance)}`}
                disabled={isFormDisabled || formState === 'submitting'}
                className="h-[46px] rounded-[10px] border-white/10 bg-white/[0.07] text-white placeholder:text-white/30"
              />
              {amount && !isAmountValid && (
                <p className="text-[11px] text-red-300">
                  {parsedAmount <= 0
                    ? 'Amount must be greater than zero.'
                    : `Amount cannot exceed ${formatCurrency(salaryData.maxAdvance)}.`}
                </p>
              )}
            </div>

            {/* Reason (optional) */}
            <div className="mt-4 space-y-1.5">
              <Label
                htmlFor="advance-reason"
                className="text-[12px] font-medium text-white/70"
              >
                Reason (optional)
              </Label>
              <Input
                id="advance-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Medical emergency"
                disabled={isFormDisabled || formState === 'submitting'}
                className="h-[46px] rounded-[10px] border-white/10 bg-white/[0.07] text-white placeholder:text-white/30"
              />
            </div>
          </div>

          {/* Conditions acceptance */}
          <div className="rounded-[16px] border border-white/10 bg-white/4 p-4">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={conditionsAccepted}
                onChange={(e) => setConditionsAccepted(e.target.checked)}
                disabled={isFormDisabled || formState === 'submitting'}
                className="mt-0.5 h-4 w-4 rounded border-white/20 bg-white/[0.07] text-safend-red accent-safend-red"
              />
              <span className="text-[12px] font-body leading-[1.6] text-white/60">
                I understand that this salary advance carries{' '}
                <span className="text-white/80 font-medium">zero interest</span> and will be
                recovered as a{' '}
                <span className="text-white/80 font-medium">one-time deduction</span> from my
                next salary payment.
              </span>
            </label>
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
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="w-full"
          >
            {formState === 'submitting' ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Submitting…
              </span>
            ) : (
              'Request Advance'
            )}
          </Button>
        </div>
      )}
    </div>
  );
}

export default EmployeeSalaryAdvanceForm;
