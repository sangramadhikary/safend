'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, Trash2, XCircle, AlertTriangle, Mail, Check } from 'lucide-react';
import { supabaseClient } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

const DPO_EMAIL = 'dpo@safends.com';
const GRIEVANCE_EMAIL = 'grievance@safends.com';

/**
 * Panel for DPDPA data rights — can be placed in profile or settings.
 * - View consent status
 * - Revoke consent (logs out, disables access)
 * - Request data deletion
 * - Contact DPO
 */
export function DataRightsPanel() {
  const { toast } = useToast();
  const [showRevokeConfirm, setShowRevokeConfirm] = useState(false);
  const [showDeleteRequest, setShowDeleteRequest] = useState(false);
  const [deleteReason, setDeleteReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const consentDate = typeof window !== 'undefined'
    ? localStorage.getItem('supervisor_security_consent_at') || localStorage.getItem('erp_security_consent_at') || null
    : null;

  const handleRevokeConsent = async () => {
    setSubmitting(true);
    try {
      // Record the revocation in DB
      const { data: { user } } = await supabaseClient.auth.getUser();
      await supabaseClient.from('security_consents').insert({
        user_id: user?.id || null,
        user_email: localStorage.getItem('userEmail') || '',
        user_name: localStorage.getItem('userName') || '',
        employee_id: localStorage.getItem('employeeId') || '',
        consent_type: 'consent_revoked',
        consent_version: 'revocation',
        ip_address: '',
        user_agent: navigator.userAgent,
        device_info: 'Voluntary revocation by user',
      });

      // Clear consent flags
      localStorage.removeItem('supervisor_security_consent');
      localStorage.removeItem('supervisor_security_consent_version');
      localStorage.removeItem('erp_security_consent');
      localStorage.removeItem('erp_security_consent_version');

      // Release the device slot before signing out (needs the current JWT)
      try {
        const { releaseSession } = await import('@/utils/sessionManager');
        await releaseSession();
      } catch { /* non-critical */ }

      // Sign out
      await supabaseClient.auth.signOut();
      localStorage.clear();
      window.location.href = '/login';
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteRequest = async () => {
    if (!deleteReason.trim()) {
      toast({ title: 'Reason required', description: 'Please provide a reason for the data deletion request.', variant: 'destructive' });
      return;
    }
    setSubmitting(true);
    try {
      const { data: { user } } = await supabaseClient.auth.getUser();
      await supabaseClient.from('security_consents').insert({
        user_id: user?.id || null,
        user_email: localStorage.getItem('userEmail') || '',
        user_name: localStorage.getItem('userName') || '',
        employee_id: localStorage.getItem('employeeId') || '',
        consent_type: 'data_deletion_request',
        consent_version: deleteReason.trim(),
        ip_address: '',
        user_agent: navigator.userAgent,
        device_info: 'Data deletion request submitted',
      });

      toast({ title: 'Request submitted', description: 'Your data deletion request has been recorded. The DPO will respond within 30 days.' });
      setShowDeleteRequest(false);
      setDeleteReason('');
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-1">
        <Shield className="h-5 w-5 text-[#D71920]" />
        <h3 className="text-base font-semibold">Data Protection & Privacy</h3>
      </div>

      {/* Consent status */}
      <div className="rounded-xl border border-gray-200 dark:border-white/10 p-4 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Consent Status</span>
          {consentDate ? (
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400 font-medium flex items-center gap-1">
              <Check className="h-3 w-3" /> Active
            </span>
          ) : (
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-medium">Pending</span>
          )}
        </div>
        {consentDate && (
          <p className="text-[11px] text-gray-500">
            Consented on {new Date(consentDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="space-y-2">
        <button
          onClick={() => setShowDeleteRequest(true)}
          className="w-full flex items-center gap-3 p-3.5 rounded-xl border border-gray-200 dark:border-white/10 text-left hover:bg-gray-50 dark:hover:bg-white/2 active:scale-[0.99] transition-all"
        >
          <Trash2 className="h-4 w-4 text-gray-500" />
          <div>
            <p className="text-sm font-medium">Request Data Deletion</p>
            <p className="text-[11px] text-gray-500">Ask us to erase your personal data</p>
          </div>
        </button>

        <button
          onClick={() => setShowRevokeConfirm(true)}
          className="w-full flex items-center gap-3 p-3.5 rounded-xl border border-red-200 dark:border-red-900/30 text-left hover:bg-red-50 dark:hover:bg-red-900/5 active:scale-[0.99] transition-all"
        >
          <XCircle className="h-4 w-4 text-red-500" />
          <div>
            <p className="text-sm font-medium text-red-700 dark:text-red-400">Withdraw Consent</p>
            <p className="text-[11px] text-gray-500">Revoke all permissions. This will log you out and disable access.</p>
          </div>
        </button>

        <a
          href={`mailto:${GRIEVANCE_EMAIL}?subject=Data%20Grievance%20-%20${localStorage.getItem('userName') || 'User'}`}
          className="w-full flex items-center gap-3 p-3.5 rounded-xl border border-gray-200 dark:border-white/10 text-left hover:bg-gray-50 dark:hover:bg-white/2 active:scale-[0.99] transition-all"
        >
          <Mail className="h-4 w-4 text-gray-500" />
          <div>
            <p className="text-sm font-medium">Raise a Grievance</p>
            <p className="text-[11px] text-gray-500">Contact DPO: {DPO_EMAIL}</p>
          </div>
        </a>
      </div>

      {/* Revoke confirmation modal */}
      <AnimatePresence>
        {showRevokeConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-100 flex items-center justify-center bg-black/50 p-6"
            onClick={() => setShowRevokeConfirm(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="max-w-sm w-full bg-white dark:bg-[#0B0F19] rounded-2xl p-6 space-y-4 shadow-xl"
            >
              <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/20 flex items-center justify-center mx-auto">
                <AlertTriangle className="h-6 w-6 text-red-600" />
              </div>
              <div className="text-center">
                <h3 className="text-lg font-bold">Withdraw Consent?</h3>
                <p className="text-sm text-gray-500 mt-2">
                  This will immediately:
                </p>
                <ul className="text-[13px] text-gray-600 dark:text-gray-400 mt-2 text-left space-y-1 list-disc list-inside">
                  <li>Log you out of all devices</li>
                  <li>Disable your portal access</li>
                  <li>Record the revocation for audit</li>
                </ul>
                <p className="text-xs text-gray-400 mt-3">
                  You will need to re-consent if you want access again. Contact your administrator.
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowRevokeConfirm(false)}
                  className="flex-1 py-2.5 rounded-xl border border-gray-200 dark:border-white/10 text-sm font-medium active:scale-[0.97] transition-transform"
                >
                  Cancel
                </button>
                <button
                  onClick={handleRevokeConsent}
                  disabled={submitting}
                  className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold active:scale-[0.97] transition-transform disabled:opacity-50"
                >
                  {submitting ? 'Processing...' : 'Revoke & Logout'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete request modal */}
      <AnimatePresence>
        {showDeleteRequest && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-100 flex items-center justify-center bg-black/50 p-6"
            onClick={() => setShowDeleteRequest(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="max-w-sm w-full bg-white dark:bg-[#0B0F19] rounded-2xl p-6 space-y-4 shadow-xl"
            >
              <div className="text-center">
                <Trash2 className="h-6 w-6 text-gray-600 mx-auto mb-2" />
                <h3 className="text-lg font-bold">Request Data Deletion</h3>
                <p className="text-sm text-gray-500 mt-1">
                  The Data Protection Officer will process your request within 30 days.
                </p>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Reason (required)</label>
                <textarea
                  value={deleteReason}
                  onChange={(e) => setDeleteReason(e.target.value)}
                  placeholder="Please describe what data you want deleted and why..."
                  rows={3}
                  className="w-full mt-1 rounded-lg border border-gray-200 dark:border-white/10 bg-transparent px-3 py-2 text-sm resize-none focus:outline-hidden focus:ring-2 focus:ring-[#D71920]/30"
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowDeleteRequest(false)}
                  className="flex-1 py-2.5 rounded-xl border border-gray-200 dark:border-white/10 text-sm font-medium active:scale-[0.97] transition-transform"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteRequest}
                  disabled={submitting || !deleteReason.trim()}
                  className="flex-1 py-2.5 rounded-xl bg-[#D71920] text-white text-sm font-semibold active:scale-[0.97] transition-transform disabled:opacity-40"
                >
                  {submitting ? 'Submitting...' : 'Submit Request'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
