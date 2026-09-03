import { z } from 'zod';

// Source of information options
export const SOURCES_OF_INFORMATION = ['Patrol', 'Supervisor Call', 'Client Information'] as const;
export type SourceOfInformation = (typeof SOURCES_OF_INFORMATION)[number];

// Offense type categories
export const OFFENSE_TYPES = ['Disciplinary', 'Integrity', 'Criminal'] as const;
export type OffenseType = (typeof OFFENSE_TYPES)[number];

// Offenses grouped by type
export const OFFENSES_BY_TYPE: Record<OffenseType, readonly string[]> = {
  Disciplinary: ['Late Arrival', 'Early Left Duty Without Handover', 'Misbehave with Staff or Client'],
  Integrity: ['Sleeping on Duty', 'Mobile Use', 'Alcohol or Ganja on Duty', 'Leaking Sensitive Information', 'Bribery'],
  Criminal: ['Assault', 'Harassment', 'Drug Use', 'Vandalism', 'Theft'],
} as const;

// All possible offenses (flat list)
export const ALL_OFFENSES = Object.values(OFFENSES_BY_TYPE).flat();

export const PENALTY_STATUSES = [
  'Pending HR Review',
  'Financial Penalty Applied',
  'Suspended',
  'Show Cause Issued',
  'Terminated',
  'Dismissed',
] as const;
export type PenaltyStatus = (typeof PENALTY_STATUSES)[number];

// HR action types
export const HR_ACTIONS = [
  'Financial Penalty',
  'Temporary Suspension',
  'Show Cause Notice',
  'Terminate Without Salary',
  'Dismiss',
] as const;
export type HRAction = (typeof HR_ACTIONS)[number];

// Maps HR action to resulting status
export const HR_ACTION_TO_STATUS: Record<HRAction, PenaltyStatus> = {
  'Financial Penalty': 'Financial Penalty Applied',
  'Temporary Suspension': 'Suspended',
  'Show Cause Notice': 'Show Cause Issued',
  'Terminate Without Salary': 'Terminated',
  'Dismiss': 'Dismissed',
};

// Valid status transitions (only HR can act on Pending HR Review)
export const STATUS_TRANSITIONS: Record<PenaltyStatus, PenaltyStatus[]> = {
  'Pending HR Review': ['Financial Penalty Applied', 'Suspended', 'Show Cause Issued', 'Terminated', 'Dismissed'],
  'Financial Penalty Applied': [],
  'Suspended': [],
  'Show Cause Issued': [],
  'Terminated': [],
  'Dismissed': [],
};

export const penaltyFormSchema = z.object({
  staff_id: z.string().uuid('Staff member is required'),
  staff_name: z.string().min(1, 'Staff member is required'),
  post_id: z.string().uuid('Post location is required'),
  post_name: z.string().min(1, 'Post location is required'),
  violation_date: z.string().refine(
    (val) => {
      const date = new Date(val);
      const today = new Date();
      today.setHours(23, 59, 59, 999);
      return !isNaN(date.getTime()) && date <= today;
    },
    { message: 'Violation date cannot be in the future' }
  ),
  source_of_information: z.enum(SOURCES_OF_INFORMATION, {
    error: 'Source of information is required',
  }),
  offense_type: z.enum(OFFENSE_TYPES, {
    error: 'Type of offense is required',
  }),
  offense: z.string().min(1, 'Offense selection is required'),
  weight: z.number().int().min(1, 'Weight must be at least 1').max(5, 'Weight must be at most 5'),
  description: z.string().min(1, 'Description is required'),
  evidence_url: z.string().url().nullable().optional(),
  related_entity_id: z.string().uuid().nullable().optional(),
  related_entity_type: z.string().nullable().optional(),
});

export type PenaltyFormData = z.infer<typeof penaltyFormSchema>;

export interface PenaltyRecord {
  id: string;
  staff_id: string;
  staff_name: string;
  post_id: string;
  post_name: string;
  violation_date: string;
  source_of_information: SourceOfInformation;
  offense_type: OffenseType;
  offense: string;
  weight: number;
  description: string;
  evidence_url: string | null;
  status: PenaltyStatus;
  hr_action: HRAction | null;
  financial_penalty_amount: number | null;
  hr_notes: string | null;
  related_entity_id: string | null;
  related_entity_type: string | null;
  created_at: string;
  updated_at: string;
}
