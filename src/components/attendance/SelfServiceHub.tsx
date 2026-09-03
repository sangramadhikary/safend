'use client';

/**
 * Self-Service Hub — Requirements 1.1, 1.6, 1.7
 *
 * Displays four action cards after successful QR scan verification:
 * Mark Attendance, Apply for Leave, Salary Advance, and Submit Resignation.
 * Shown as a step within the QuickAttendanceScanner overlay flow.
 */

import {
  ArrowLeft,
  CalendarDays,
  Camera,
  IndianRupee,
  LogOut,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface SelfServiceHubProps {
  employeeCode: string;
  employeeName: string;
  postId: string;
  shiftKey: string;
  serviceTypeKey: string;
  /** Proceed to existing consent → capture flow. */
  onSelectAttendance: () => void;
  /** Navigate to the leave application form. */
  onSelectLeave?: () => void;
  /** Navigate to the salary advance form. */
  onSelectAdvance?: () => void;
  /** Navigate to the resignation form. */
  onSelectResignation?: () => void;
  /** Return to QR scanning step. */
  onBack: () => void;
  /** Dismiss the entire scanner overlay. */
  onClose: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Action card definitions
// ─────────────────────────────────────────────────────────────────────────────

interface ActionCard {
  id: 'attendance' | 'leave' | 'advance' | 'resignation';
  label: string;
  description: string;
  icon: React.ReactNode;
}

const ACTION_CARDS: ActionCard[] = [
  {
    id: 'attendance',
    label: 'Mark Attendance Now',
    description: 'Capture photo and submit your check-in',
    icon: <Camera className="h-6 w-6" />,
  },
  {
    id: 'leave',
    label: 'Apply for Leave',
    description: 'Submit a planned or sick leave request',
    icon: <CalendarDays className="h-6 w-6" />,
  },
  {
    id: 'advance',
    label: 'Salary Advance',
    description: 'Request an advance against your salary',
    icon: <IndianRupee className="h-6 w-6" />,
  },
  {
    id: 'resignation',
    label: 'Submit Resignation',
    description: 'Formally submit your resignation letter',
    icon: <LogOut className="h-6 w-6" />,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function SelfServiceHub({
  employeeCode,
  employeeName,
  onSelectAttendance,
  onSelectLeave,
  onSelectAdvance,
  onSelectResignation,
  onBack,
}: SelfServiceHubProps) {
  const handleCardClick = (id: ActionCard['id']) => {
    switch (id) {
      case 'attendance':
        onSelectAttendance();
        break;
      case 'leave':
        onSelectLeave?.();
        break;
      case 'advance':
        onSelectAdvance?.();
        break;
      case 'resignation':
        onSelectResignation?.();
        break;
    }
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Back button */}
      <button
        type="button"
        onClick={onBack}
        aria-label="Back to scanning"
        className="flex items-center gap-1.5 text-[13px] font-medium text-white/60 transition-colors hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" />
        Back
      </button>

      {/* Employee header (R1.6) */}
      <div className="rounded-[16px] border border-white/10 bg-white/4 px-5 py-4">
        <p className="text-[12px] font-body text-white/50 uppercase tracking-wide">Employee</p>
        <h2 className="mt-1 font-heading text-[16px] font-semibold text-white">
          {employeeName}
        </h2>
        <p className="mt-0.5 text-[13px] font-body text-white/60">
          Code: {employeeCode}
        </p>
      </div>

      {/* Action cards (R1.1) */}
      <div className="grid grid-cols-1 gap-3">
        {ACTION_CARDS.map((card) => (
          <button
            key={card.id}
            type="button"
            onClick={() => handleCardClick(card.id)}
            className="flex items-center gap-4 rounded-[16px] border border-white/10 bg-white/4 p-4 text-left transition-colors hover:border-safend-red/40 hover:bg-safend-red/8 active:scale-[0.98]"
          >
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/6 text-safend-red">
              {card.icon}
            </div>
            <div className="min-w-0 flex-1">
              <span className="block font-heading text-[14px] font-semibold text-white">
                {card.label}
              </span>
              <span className="block mt-0.5 text-[12px] font-body text-white/50">
                {card.description}
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

export default SelfServiceHub;
