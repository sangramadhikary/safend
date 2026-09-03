'use client';

/**
 * Onboarding Candidate Service
 * Manages the 5-step employee onboarding pipeline:
 * 1. details -> 2. documents -> 3. agreement -> 4. uniform -> 5. review -> onboarded
 */

import { supabaseClient } from '@/integrations/supabase/client';

export type OnboardingStage = 'details' | 'documents' | 'agreement' | 'uniform' | 'review' | 'onboarded' | 'cancelled';

export interface OnboardingCandidate {
  id?: string;
  branchId?: string;
  stage: OnboardingStage;

  name: string;
  phone?: string;
  email?: string;
  gender?: string;
  dateOfBirth?: string;
  department?: string;
  designation?: string;
  joinDate?: string;
  photoUrl?: string;

  aadharNumber?: string;
  aadharFileUrl?: string;
  /** Back side of the Aadhaar card — the side that carries the address */
  aadharBackFileUrl?: string;
  panNumber?: string;
  panFileUrl?: string;
  addressProofType?: string;
  addressProofFileUrl?: string;
  /** Back side, only collected for two-sided proofs (Voter ID, DL, Passport) */
  addressProofBackFileUrl?: string;
  documentsCompleted?: boolean;

  agreementGeneratedAt?: string;
  agreementSignedFileUrl?: string;
  agreementSignedAt?: string;

  uniformDistributionId?: string;
  uniformIssuedAt?: string;

  reviewedBy?: string;
  employeeId?: string;
  onboardedEmployeeUuid?: string;
  onboardedAt?: string;

  notes?: string;
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
}

const mapRowToCandidate = (row: any): OnboardingCandidate => ({
  id: row.id,
  branchId: row.branch_id || undefined,
  stage: row.stage || 'details',
  name: row.name || '',
  phone: row.phone || undefined,
  email: row.email || undefined,
  gender: row.gender || undefined,
  dateOfBirth: row.date_of_birth || undefined,
  department: row.department || undefined,
  designation: row.designation || undefined,
  joinDate: row.join_date || undefined,
  photoUrl: row.photo_url || undefined,
  aadharNumber: row.aadhar_number || undefined,
  aadharFileUrl: row.aadhar_file_url || undefined,
  aadharBackFileUrl: row.aadhar_back_file_url || undefined,
  panNumber: row.pan_number || undefined,
  panFileUrl: row.pan_file_url || undefined,
  addressProofType: row.address_proof_type || undefined,
  addressProofFileUrl: row.address_proof_file_url || undefined,
  addressProofBackFileUrl: row.address_proof_back_file_url || undefined,
  documentsCompleted: row.documents_completed || false,
  agreementGeneratedAt: row.agreement_generated_at || undefined,
  agreementSignedFileUrl: row.agreement_signed_file_url || undefined,
  agreementSignedAt: row.agreement_signed_at || undefined,
  uniformDistributionId: row.uniform_distribution_id || undefined,
  uniformIssuedAt: row.uniform_issued_at || undefined,
  reviewedBy: row.reviewed_by || undefined,
  employeeId: row.employee_id || undefined,
  onboardedEmployeeUuid: row.onboarded_employee_uuid || undefined,
  onboardedAt: row.onboarded_at || undefined,
  notes: row.notes || undefined,
  createdBy: row.created_by || undefined,
  createdAt: row.created_at || undefined,
  updatedAt: row.updated_at || undefined,
});

const mapCandidateToRow = (candidate: Partial<OnboardingCandidate>): any => {
  const row: any = {};
  if (candidate.branchId !== undefined) row.branch_id = candidate.branchId;
  if (candidate.stage !== undefined) row.stage = candidate.stage;
  if (candidate.name !== undefined) row.name = candidate.name;
  if (candidate.phone !== undefined) row.phone = candidate.phone;
  if (candidate.email !== undefined) row.email = candidate.email;
  if (candidate.gender !== undefined) row.gender = candidate.gender;
  if (candidate.dateOfBirth !== undefined) row.date_of_birth = candidate.dateOfBirth || null;
  if (candidate.department !== undefined) row.department = candidate.department;
  if (candidate.designation !== undefined) row.designation = candidate.designation;
  if (candidate.joinDate !== undefined) row.join_date = candidate.joinDate || null;
  if (candidate.photoUrl !== undefined) row.photo_url = candidate.photoUrl;
  if (candidate.aadharNumber !== undefined) row.aadhar_number = candidate.aadharNumber;
  if (candidate.aadharFileUrl !== undefined) row.aadhar_file_url = candidate.aadharFileUrl;
  if (candidate.aadharBackFileUrl !== undefined) row.aadhar_back_file_url = candidate.aadharBackFileUrl;
  if (candidate.panNumber !== undefined) row.pan_number = candidate.panNumber;
  if (candidate.panFileUrl !== undefined) row.pan_file_url = candidate.panFileUrl;
  if (candidate.addressProofType !== undefined) row.address_proof_type = candidate.addressProofType;
  if (candidate.addressProofFileUrl !== undefined) row.address_proof_file_url = candidate.addressProofFileUrl;
  if (candidate.addressProofBackFileUrl !== undefined) row.address_proof_back_file_url = candidate.addressProofBackFileUrl;
  if (candidate.documentsCompleted !== undefined) row.documents_completed = candidate.documentsCompleted;
  if (candidate.agreementGeneratedAt !== undefined) row.agreement_generated_at = candidate.agreementGeneratedAt;
  if (candidate.agreementSignedFileUrl !== undefined) row.agreement_signed_file_url = candidate.agreementSignedFileUrl;
  if (candidate.agreementSignedAt !== undefined) row.agreement_signed_at = candidate.agreementSignedAt;
  if (candidate.uniformDistributionId !== undefined) row.uniform_distribution_id = candidate.uniformDistributionId;
  if (candidate.uniformIssuedAt !== undefined) row.uniform_issued_at = candidate.uniformIssuedAt;
  if (candidate.reviewedBy !== undefined) row.reviewed_by = candidate.reviewedBy;
  if (candidate.employeeId !== undefined) row.employee_id = candidate.employeeId;
  if (candidate.onboardedEmployeeUuid !== undefined) row.onboarded_employee_uuid = candidate.onboardedEmployeeUuid;
  if (candidate.onboardedAt !== undefined) row.onboarded_at = candidate.onboardedAt;
  if (candidate.notes !== undefined) row.notes = candidate.notes;
  if (candidate.createdBy !== undefined) row.created_by = candidate.createdBy;
  return row;
};

export const listOnboardingCandidates = async (branchId?: string, includeFinished = false) => {
  try {
    let query = supabaseClient.from('onboarding_candidates').select('*').order('created_at', { ascending: false });
    if (branchId) query = query.eq('branch_id', branchId);
    if (!includeFinished) query = query.not('stage', 'in', '(onboarded,cancelled)');
    const { data, error } = await query;
    if (error) throw error;
    return { success: true, data: (data || []).map(mapRowToCandidate) };
  } catch (e: any) {
    return { success: false, error: e.message, data: [] as OnboardingCandidate[] };
  }
};

export const getOnboardingCandidate = async (id: string) => {
  try {
    const { data, error } = await supabaseClient.from('onboarding_candidates').select('*').eq('id', id).single();
    if (error) throw error;
    return { success: true, data: mapRowToCandidate(data) };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
};

export const createOnboardingCandidate = async (candidate: Omit<OnboardingCandidate, 'id'>) => {
  try {
    const row = mapCandidateToRow(candidate);
    const { data, error } = await supabaseClient.from('onboarding_candidates').insert(row).select().single();
    if (error) throw error;
    return { success: true, data: mapRowToCandidate(data) };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
};

export const updateOnboardingCandidate = async (id: string, updates: Partial<OnboardingCandidate>) => {
  try {
    const row = mapCandidateToRow(updates);
    const { data, error } = await supabaseClient.from('onboarding_candidates').update(row).eq('id', id).select().single();
    if (error) throw error;
    return { success: true, data: mapRowToCandidate(data) };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
};

export const cancelOnboardingCandidate = async (id: string) => {
  return updateOnboardingCandidate(id, { stage: 'cancelled' });
};

export const deleteOnboardingCandidate = async (id: string) => {
  try {
    const { error } = await supabaseClient.from('onboarding_candidates').delete().eq('id', id);
    if (error) throw error;
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
};
