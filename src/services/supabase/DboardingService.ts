'use client';

/**
 * Deboarding Pipeline Service
 * Manages the 7-stage employee deboarding pipeline:
 * 1. resignation_received -> 2. notice_period -> 3. handover -> 4. dues_settlement
 * -> 5. exit_interview -> 6. relieving_letter -> 7. completed
 */

import { supabaseClient } from '@/integrations/supabase/client';

// ── Stages ───────────────────────────────────────────────────────────────────

export const DEBOARD_STAGES = [
  'resignation_received',
  'notice_period',
  'handover',
  'dues_settlement',
  'exit_interview',
  'relieving_letter',
  'completed',
] as const;

export type DboardingStage = (typeof DEBOARD_STAGES)[number];

// ── Types ────────────────────────────────────────────────────────────────────

export interface DboardingPipelineRecord {
  id: string;
  resignation_id: string;
  employee_id: string;
  employee_name: string;
  designation: string;
  current_stage: DboardingStage;
  stage_history: { stage: string; timestamp: string }[];
  last_working_day: string;
  progress_pct: number;
  notes?: string;
  created_at: string;
  updated_at: string;
}

// ── Row Mapping ──────────────────────────────────────────────────────────────

const mapRowToRecord = (row: any): DboardingPipelineRecord => ({
  id: row.id,
  resignation_id: row.resignation_id || '',
  employee_id: row.employee_id || '',
  employee_name: row.employee_name || '',
  designation: row.designation || '',
  current_stage: row.current_stage || 'resignation_received',
  stage_history: row.stage_history || [],
  last_working_day: row.last_working_day || '',
  progress_pct: row.progress_pct || 0,
  notes: row.notes || undefined,
  created_at: row.created_at || '',
  updated_at: row.updated_at || '',
});

// ── Service Functions ────────────────────────────────────────────────────────

/**
 * List deboarding pipeline entries, optionally filtered by current stage.
 */
export const listDboardingEntries = async (
  stage?: string
): Promise<{ success: boolean; data: DboardingPipelineRecord[]; error?: string }> => {
  try {
    let query = supabaseClient
      .from('deboarding_pipeline')
      .select('*')
      .order('created_at', { ascending: false });

    if (stage) {
      query = query.eq('current_stage', stage);
    }

    const { data, error } = await query;
    if (error) throw error;

    return { success: true, data: (data || []).map(mapRowToRecord) };
  } catch (e: any) {
    return { success: false, error: e.message, data: [] };
  }
};

/**
 * Calculate progress percentage for a given stage index (0-based).
 * Returns a 1-indexed percentage: Math.round(((stageIndex + 1) / 7) * 100)
 */
export const calculateProgress = (stageIndex: number): number => {
  return Math.round(((stageIndex + 1) / 7) * 100);
};

/**
 * Advance a deboarding entry to the next stage.
 * Records the transition timestamp in stage_history and updates progress_pct.
 */
export const advanceToNextStage = async (
  entryId: string
): Promise<{ success: boolean; data?: DboardingPipelineRecord; error?: string }> => {
  try {
    // Fetch current entry
    const { data: current, error: fetchError } = await supabaseClient
      .from('deboarding_pipeline')
      .select('*')
      .eq('id', entryId)
      .single();

    if (fetchError) throw fetchError;
    if (!current) throw new Error('Entry not found');

    const currentStageIndex = DEBOARD_STAGES.indexOf(current.current_stage);
    if (currentStageIndex === -1) {
      throw new Error(`Invalid current stage: ${current.current_stage}`);
    }

    if (currentStageIndex >= DEBOARD_STAGES.length - 1) {
      throw new Error('Entry is already at the final stage');
    }

    const nextStageIndex = currentStageIndex + 1;
    const nextStage = DEBOARD_STAGES[nextStageIndex];
    const progressPct = calculateProgress(nextStageIndex);

    // Append to stage history
    const stageHistory = Array.isArray(current.stage_history) ? [...current.stage_history] : [];
    stageHistory.push({
      stage: nextStage,
      timestamp: new Date().toISOString(),
    });

    // Update the entry
    const { data: updated, error: updateError } = await supabaseClient
      .from('deboarding_pipeline')
      .update({
        current_stage: nextStage,
        stage_history: stageHistory,
        progress_pct: progressPct,
        updated_at: new Date().toISOString(),
      })
      .eq('id', entryId)
      .select()
      .single();

    if (updateError) throw updateError;

    return { success: true, data: mapRowToRecord(updated) };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
};
