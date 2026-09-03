'use client';

/**
 * EmployeeLeaveForm — Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6
 *
 * Mobile-first form for employees to submit leave requests from the
 * Self-Service Hub. Fetches leave balance on mount, enforces minimum
 * date advance, calculates salary deduction for unpaid days, and
 * requires conditions acceptance before submission.
 */

import { useEffect, useState, useMemo, useCallback } from 'react';
import {
  ArrowLeft,
  CalendarDays,
  Loader2,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react';

import { HR_CONFIG } from '@/config';
import { calculateSalaryDeduction } from '@/utils/salaryDeduction';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface EmployeeLeaveFormProps {
  employeeCode: string;
  employeeName: string;
  postId: string;
  onBack: () => void;
  onClose: () => void;
}

type LeaveType = 'Planned Leave' | 'Sick Leave';

interface LeaveBalanceData {
  leaveBalance: number;
  dailySalaryRate: number;
}

type FetchState = 'loading' | 'error' | 'ready';
type SubmitState = 'idle' | 'submitting' | 'success' | 'error';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Get today's date in YYYY-MM-DD format (IST). */
function getToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/** Add days to an ISO date string and return YYYY-MM-DD. */
function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

/** Calculate number of days between two ISO date strings (inclusive). */
function calculateLeaveDays(from: string, to: string): number {
  if (!from || !to) return 0;
  const fromDate = new Date(from + 'T00:00:00');
  const toDate = new Date(to + 'T00:00:00');
  const diff = Math.round((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(0, diff + 1);
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function EmployeeLeaveForm({
  employeeCode,
  employeeName,
  postId,
  onBack,
  onClose,
}: EmployeeLeaveFormProps) {
  // ── Fetch state ──
  const [fetchState, setFetchState] = useState<FetchState>('loading');
  const [balanceData, setBalanceData] = useState<LeaveBalanceData | null>(null);
  const [fetchError, setFetchError] = useState<string>('');

  // ── Form state ──
  const [leaveType, setLeaveType] = useState<LeaveType>('Planned Leave');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [reason, setReason] = useState('');
  const [conditionsAccepted, setConditionsAccepted] = useState(false);

  // ── Submit state ──
  const [submitState, setSubmitState] = useState<SubmitState>('idle');
  const [submitError, setSubmitError] = useState('');

  // ── Derived values ──
  const today = useMemo(() => getToday(), []);

  const minAdvanceDays = leaveType === 'Planned Leave'
    ? HR_CONFIG.LEAVE.PLANNED_LEAVE_MIN_ADVANCE_DAYS
    : HR_CONFIG.LEAVE.SICK_LEAVE_MIN_ADVANCE_DAYS;

  const minFromDate = useMemo(
    () => addDays(today, minAdvanceDays),
    [today, minAdvanceDays],
  );

  const leaveDays = useMemo(
    () => calculateLeaveDays(fromDate, toDate),
    [fromDate, toDate],
  );

  /** Sick Leave is always unpaid. Planned Leave is unpaid if balance is 0. */
  const isUnpaid = useMemo(() => {
    if (leaveType === 'Sick Leave') return true;
    if (!balanceData) return false;
    return balanceData.leaveBalance <= 0;
  }, [leaveType, balanceData]);

  const salaryDeduction = useMemo(() => {
    if (!isUnpaid || !balanceData || leaveDays <= 0) return 0;
    return calculateSalaryDeduction(balanceData.dailySalaryRate, leaveDays);
  }, [isUnpaid, balanceData, leaveDays]);

  const isFormValid = useMemo(() => {
    if (!fromDate || !toDate) return false;
    if (fromDate > toDate) return false;
    if (fromDate < minFromDate) return false;
    if (!conditionsAccepted) return false;
    return true;
  }, [fromDate, toDate, minFromDate, conditionsAccepted]);

  // ── Fetch leave balance on mount ──
  const fetchLeaveBalance = useCallback(async () => {
    setFetchState('loading');
    setFetchError('');
    try {
      const params = new URLSearchParams({
        employee_code: employeeCode,
        post_id: postId,
      });
      const res = await fetch(`/api/employee-self-service/leave-balance?${params}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to fetch leave balance');
      }
      const data: LeaveBalanceData = await res.json();
      setBalanceData(data);
      setFetchState('ready');
    } catch (err: any) {
      setFetchError(err.message || 'Failed to fetch leave balance');
      setFetchState('error');
    }
  }, [employeeCode, postId]);

  useEffect(() => {
    fetchLeaveBalance();
  }, [fetchLeaveBalance]);

  // ── Reset dates when leave type changes (min date changes) ──
  useEffect(() => {
    if (fromDate && fromDate < minFromDate) {
      setFromDate('');
      setToDate('');
    }
  }, [leaveType]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Submit handler ──
  const handleSubmit = async () => {
    if (!isFormValid || submitState === 'submitting') return;

    setSubmitState('submitting');
    setSubmitError('');

    try {
      const res = await fetch('/api/employee-self-service/leave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employee_code: employeeCode,
          post_id: postId,
          leaveType,
          fromDate,
          toDate,
          reason: reason.trim() || undefined,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Submission failed. Please try again.');
      }

      setSubmitState('success');
    } catch (err: any) {
      setSubmitError(err.message || 'Submission failed. Please try again.');
      setSubmitState('error');
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Render: Loading state
  // ─────────────────────────────────────────────────────────────────────────

  if (fetchState === 'loading') {
    return (
      <div className="flex flex-col gap-5">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to hub"
          className="flex items-center gap-1.5 text-[13px] font-medium text-white/60 transition-colors hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <Loader2 className="h-8 w-8 text-safend-red animate-spin" />
          <p className="text-[13px] text-white/50 font-body">
            Loading leave balance...
          </p>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Render: Error state with retry
  // ─────────────────────────────────────────────────────────────────────────

  if (fetchState === 'error') {
    return (
      <div className="flex flex-col gap-5">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to hub"
          className="flex items-center gap-1.5 text-[13px] font-medium text-white/60 transition-colors hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
        <div className="flex flex-col items-center justify-center py-16 gap-4">
          <AlertCircle className="h-8 w-8 text-red-400" />
          <p className="text-[13px] text-white/60 font-body text-center">
            {fetchError}
          </p>
          <button
            type="button"
            onClick={fetchLeaveBalance}
            className="flex items-center gap-2 rounded-[10px] border border-white/10 bg-white/6 px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-white/10"
          >
            <RefreshCw className="h-4 w-4" />
            Retry
          </button>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Render: Success state
  // ─────────────────────────────────────────────────────────────────────────

  if (submitState === 'success') {
    return (
      <div className="flex flex-col gap-5">
        <div className="flex flex-col items-center justify-center py-16 gap-4">
          <CheckCircle2 className="h-12 w-12 text-green-400" />
          <h3 className="font-heading text-[16px] font-semibold text-white text-center">
            Leave Request Submitted
          </h3>
          <p className="text-[13px] text-white/60 font-body text-center max-w-[260px]">
            Your {leaveType.toLowerCase()} request has been submitted for approval.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="mt-2 rounded-[10px] bg-safend-red px-6 py-2.5 text-[13px] font-medium text-white transition-colors hover:bg-safend-red/90"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Render: Form
  // ─────────────────────────────────────────────────────────────────────────

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
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/6 text-safend-red">
          <CalendarDays className="h-5 w-5" />
        </div>
        <div>
          <h2 className="font-heading text-[16px] font-semibold text-white">
            Apply for Leave
          </h2>
          <p className="text-[12px] font-body text-white/50">
            {employeeName} · {employeeCode}
          </p>
        </div>
      </div>

      {/* Leave Balance Display (R2.1) */}
      <div className="rounded-[12px] border border-white/10 bg-white/4 px-4 py-3">
        <p className="text-[11px] font-body text-white/50 uppercase tracking-wide">
          Leave Balance
        </p>
        <p className="mt-1 font-heading text-[20px] font-semibold text-white">
          {balanceData!.leaveBalance}{' '}
          <span className="text-[12px] font-body text-white/40 font-normal">
            paid {balanceData!.leaveBalance === 1 ? 'day' : 'days'} remaining
          </span>
        </p>
      </div>

      {/* Leave Type Selector (R2.2) */}
      <div>
        <label className="block text-[12px] font-body text-white/60 mb-2">
          Leave Type
        </label>
        <div className="grid grid-cols-2 gap-2">
          {(['Planned Leave', 'Sick Leave'] as const).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setLeaveType(type)}
              className={`rounded-[10px] border px-3 py-2.5 text-[13px] font-medium transition-colors ${
                leaveType === type
                  ? 'border-safend-red/60 bg-safend-red/12 text-white'
                  : 'border-white/10 bg-white/4 text-white/60 hover:border-white/20'
              }`}
            >
              {type}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-[11px] font-body text-white/40">
          {leaveType === 'Planned Leave'
            ? `Min ${HR_CONFIG.LEAVE.PLANNED_LEAVE_MIN_ADVANCE_DAYS} days advance · Paid if balance available`
            : `Min ${HR_CONFIG.LEAVE.SICK_LEAVE_MIN_ADVANCE_DAYS} day advance · Always unpaid`}
        </p>
      </div>

      {/* Date Pickers (R2.3, R2.4) */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label
            htmlFor="leave-from-date"
            className="block text-[12px] font-body text-white/60 mb-1.5"
          >
            From
          </label>
          <input
            id="leave-from-date"
            type="date"
            value={fromDate}
            min={minFromDate}
            onChange={(e) => {
              const val = e.target.value;
              setFromDate(val);
              // Reset toDate if it's before the new fromDate
              if (toDate && toDate < val) {
                setToDate('');
              }
            }}
            className="w-full rounded-[10px] border border-white/10 bg-white/6 px-3 py-2.5 text-[13px] text-white font-body outline-hidden focus:border-safend-red/40 transition-colors scheme-dark"
          />
        </div>
        <div>
          <label
            htmlFor="leave-to-date"
            className="block text-[12px] font-body text-white/60 mb-1.5"
          >
            To
          </label>
          <input
            id="leave-to-date"
            type="date"
            value={toDate}
            min={fromDate || minFromDate}
            onChange={(e) => setToDate(e.target.value)}
            className="w-full rounded-[10px] border border-white/10 bg-white/6 px-3 py-2.5 text-[13px] text-white font-body outline-hidden focus:border-safend-red/40 transition-colors scheme-dark"
          />
        </div>
      </div>

      {/* Duration and deduction display */}
      {leaveDays > 0 && (
        <div className="rounded-[12px] border border-white/10 bg-white/4 px-4 py-3 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-body text-white/50">Duration</span>
            <span className="text-[13px] font-medium text-white">
              {leaveDays} {leaveDays === 1 ? 'day' : 'days'}
            </span>
          </div>
          {/* Salary deduction for unpaid days (R2.5) */}
          {isUnpaid && salaryDeduction > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-body text-white/50">
                Salary Deduction
              </span>
              <span className="text-[13px] font-medium text-red-400">
                ₹{salaryDeduction.toLocaleString('en-IN')}
              </span>
            </div>
          )}
          {isUnpaid && salaryDeduction > 0 && (
            <p className="text-[11px] font-body text-white/40">
              ₹{balanceData!.dailySalaryRate.toLocaleString('en-IN')}/day × {leaveDays} days
            </p>
          )}
        </div>
      )}

      {/* Reason textarea */}
      <div>
        <label
          htmlFor="leave-reason"
          className="block text-[12px] font-body text-white/60 mb-1.5"
        >
          Reason <span className="text-white/30">(optional)</span>
        </label>
        <textarea
          id="leave-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          maxLength={500}
          placeholder="Brief reason for leave..."
          className="w-full rounded-[10px] border border-white/10 bg-white/6 px-3 py-2.5 text-[13px] text-white font-body placeholder:text-white/30 outline-hidden focus:border-safend-red/40 transition-colors resize-none"
        />
      </div>

      {/* Conditions checkbox (R2.6) */}
      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={conditionsAccepted}
          onChange={(e) => setConditionsAccepted(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-white/20 bg-white/6 accent-safend-red"
        />
        <span className="text-[12px] font-body text-white/50 leading-normal">
          I understand that{' '}
          {isUnpaid
            ? `this leave is unpaid and ₹${salaryDeduction.toLocaleString('en-IN')} will be deducted from my salary`
            : 'this leave will be deducted from my paid leave balance'}
          . I accept the leave conditions.
        </span>
      </label>

      {/* Submit error */}
      {submitState === 'error' && submitError && (
        <div className="rounded-[10px] border border-red-400/20 bg-red-400/8 px-3 py-2.5">
          <p className="text-[12px] font-body text-red-300">{submitError}</p>
        </div>
      )}

      {/* Submit button */}
      <button
        type="button"
        onClick={handleSubmit}
        disabled={!isFormValid || submitState === 'submitting'}
        className="w-full rounded-[12px] bg-safend-red py-3 text-[14px] font-semibold text-white transition-colors hover:bg-safend-red/90 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {submitState === 'submitting' ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Submitting...
          </>
        ) : (
          'Submit Leave Request'
        )}
      </button>
    </div>
  );
}

export default EmployeeLeaveForm;
