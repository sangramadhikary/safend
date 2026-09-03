'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, Check, ChevronDown, ExternalLink, Mail } from 'lucide-react';
import { supabaseClient } from '@/integrations/supabase/client';

interface SecurityConsentProps {
  children: React.ReactNode;
  storageKey?: string;
}

const CONSENT_VERSION = '1.0';

const DPO_NAME = 'Sangram Adhikary';
const DPO_EMAIL = 'dpo@safends.com';
const GRIEVANCE_EMAIL = 'grievance@safends.com';
const PRIVACY_POLICY_URL = '/privacy-policy';

const DATA_SECTIONS = [
  {
    title: 'What we collect & why',
    items: [
      { data: 'Location (GPS)', purpose: 'Attendance verification, site check-ins, geofence enforcement', retention: 'Real-time only; logs kept 90 days' },
      { data: 'Camera (photos)', purpose: 'Patrol evidence, incident documentation', retention: 'Photos stored for 1 year' },
      { data: 'Device info & IP', purpose: 'Session security, device limit enforcement', retention: '6 months' },
      { data: 'Name, email, employee ID', purpose: 'Digital watermarking for data leak traceability', retention: 'Duration of employment' },
      { data: 'Activity logs', purpose: 'Security audit, page views, login/logout events', retention: '3 years (per labor law)' },
    ],
  },
  {
    title: 'Security measures applied',
    items: [
      { data: 'Copy/print/screenshot deterrence', purpose: 'Protects client confidential data from unauthorized distribution', retention: 'Active during session' },
      { data: 'Idle lockout (3 min)', purpose: 'Prevents unauthorized access on unattended devices', retention: 'Active during session' },
      { data: 'India-only access (geofence)', purpose: 'Operational restriction — field staff operate within India', retention: 'Active during session' },
      { data: 'Push notifications', purpose: 'Attendance alerts, incident updates, shift changes', retention: 'Token stored until logout' },
    ],
  },
];

/**
 * DPDP-compliant consent screen with:
 * - Detailed purpose for each data item
 * - Retention periods
 * - DPO contact
 * - Grievance mechanism
 * - Privacy policy link
 * - Stores consent in DB for audit trail
 */
export function SecurityConsent({ children, storageKey = 'security_consent_accepted' }: SecurityConsentProps) {
  const [accepted, setAccepted] = useState<boolean | null>(null);
  const [checked, setChecked] = useState(false);
  const [expandedSection, setExpandedSection] = useState<number | null>(0);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    // Check localStorage first (fast), then verify against DB version
    const stored = localStorage.getItem(storageKey);
    const storedVersion = localStorage.getItem(`${storageKey}_version`);
    if (stored === 'true' && storedVersion === CONSENT_VERSION) {
      setAccepted(true);
    } else {
      setAccepted(false);
    }
  }, [storageKey]);

  const handleAccept = async () => {
    if (!checked) return;
    setSubmitting(true);

    try {
      // Get user info
      const { data: { user } } = await supabaseClient.auth.getUser();
      const userName = localStorage.getItem('userName') || '';
      const userEmail = localStorage.getItem('userEmail') || user?.email || '';
      const employeeId = localStorage.getItem('employeeId') || '';

      // Get IP for record
      let ipAddress = '';
      try {
        const ipRes = await fetch('/api/client-ip');
        if (ipRes.ok) {
          const ipData = await ipRes.json();
          ipAddress = ipData.ip || '';
        }
      } catch {}

      // Store in DB
      await supabaseClient.from('security_consents').insert({
        user_id: user?.id || null,
        user_email: userEmail,
        user_name: userName,
        employee_id: employeeId,
        consent_type: storageKey.replace('_security_consent', ''),
        consent_version: CONSENT_VERSION,
        ip_address: ipAddress,
        user_agent: navigator.userAgent,
        device_info: `${navigator.platform} · ${window.innerWidth}x${window.innerHeight}`,
      });
    } catch {
      // Non-critical — consent still valid even if DB write fails
    }

    // Store locally
    localStorage.setItem(storageKey, 'true');
    localStorage.setItem(`${storageKey}_version`, CONSENT_VERSION);
    localStorage.setItem(`${storageKey}_at`, new Date().toISOString());
    setAccepted(true);
    setSubmitting(false);
  };

  if (accepted === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-[#0B0F19]">
        <div className="w-8 h-8 border-[3px] border-gray-200 border-t-[#D71920] rounded-full animate-spin" />
      </div>
    );
  }

  if (accepted) return <>{children}</>;

  return (
    <div className="min-h-screen flex flex-col bg-white dark:bg-[#0B0F19] px-4 py-8 overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="max-w-lg w-full mx-auto space-y-6"
      >
        {/* Header */}
        <div className="text-center">
          <div className="w-14 h-14 rounded-full bg-[#D71920]/10 flex items-center justify-center mx-auto mb-4">
            <Shield className="h-7 w-7 text-[#D71920]" />
          </div>
          <h1 className="text-xl font-bold">Data Protection & Security</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1.5">
            As per the Digital Personal Data Protection Act, 2023
          </p>
        </div>

        {/* Accordion sections */}
        <div className="space-y-2">
          {DATA_SECTIONS.map((section, sIdx) => (
            <div key={sIdx} className="rounded-xl border border-gray-200 dark:border-white/10 overflow-hidden">
              <button
                onClick={() => setExpandedSection(expandedSection === sIdx ? null : sIdx)}
                className="w-full flex items-center justify-between px-4 py-3.5 text-left active:bg-gray-50 dark:active:bg-white/2"
              >
                <span className="text-sm font-semibold">{section.title}</span>
                <motion.div animate={{ rotate: expandedSection === sIdx ? 180 : 0 }} transition={{ duration: 0.2 }}>
                  <ChevronDown className="h-4 w-4 text-gray-400" />
                </motion.div>
              </button>
              <AnimatePresence>
                {expandedSection === sIdx && (
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: 'auto' }}
                    exit={{ height: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="px-4 pb-4 space-y-3 border-t border-gray-100 dark:border-white/5 pt-3">
                      {section.items.map((item, i) => (
                        <div key={i} className="rounded-lg bg-gray-50 dark:bg-white/2 p-3 space-y-1">
                          <p className="text-[13px] font-medium text-gray-800 dark:text-gray-200">{item.data}</p>
                          <p className="text-[11px] text-gray-500 dark:text-gray-400"><span className="font-medium">Purpose:</span> {item.purpose}</p>
                          <p className="text-[11px] text-gray-400"><span className="font-medium">Retention:</span> {item.retention}</p>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </div>

        {/* Your rights */}
        <div className="rounded-xl border border-gray-200 dark:border-white/10 p-4 space-y-2.5">
          <h3 className="text-sm font-semibold">Your Rights (DPDPA Sec. 6)</h3>
          <ul className="text-[12px] text-gray-600 dark:text-gray-400 space-y-1.5 list-disc list-inside">
            <li>Right to access your personal data held by us</li>
            <li>Right to correction of inaccurate data</li>
            <li>Right to erasure — request deletion of your data</li>
            <li>Right to withdraw consent (will disable portal access)</li>
            <li>Right to grievance redressal within 30 days</li>
          </ul>
        </div>

        {/* DPO & Grievance */}
        <div className="rounded-xl border border-gray-200 dark:border-white/10 p-4 space-y-3">
          <h3 className="text-sm font-semibold">Data Protection Officer</h3>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-gray-100 dark:bg-white/5 flex items-center justify-center text-xs font-bold text-gray-600">
              {DPO_NAME.split(' ').map(w => w[0]).join('')}
            </div>
            <div>
              <p className="text-sm font-medium">{DPO_NAME}</p>
              <a href={`mailto:${DPO_EMAIL}`} className="text-[11px] text-[#D71920] flex items-center gap-1">
                <Mail className="h-3 w-3" />{DPO_EMAIL}
              </a>
            </div>
          </div>
          <div className="border-t border-gray-100 dark:border-white/5 pt-2.5">
            <p className="text-[11px] text-gray-500">
              For grievances or data requests: <a href={`mailto:${GRIEVANCE_EMAIL}`} className="text-[#D71920] font-medium">{GRIEVANCE_EMAIL}</a>
            </p>
            <p className="text-[11px] text-gray-400 mt-1">Response within 30 days as per DPDPA guidelines.</p>
          </div>
        </div>

        {/* Privacy policy link */}
        <a
          href={PRIVACY_POLICY_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-1.5 text-sm text-[#D71920] font-medium py-2"
        >
          Read Full Privacy Policy <ExternalLink className="h-3.5 w-3.5" />
        </a>

        {/* Consent checkbox + button */}
        <div className="space-y-4 pt-2 border-t border-gray-100 dark:border-white/5">
          <label
            className="flex items-start gap-3 cursor-pointer"
            onClick={() => setChecked(!checked)}
          >
            <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 mt-0.5 transition-colors ${
              checked ? 'bg-[#D71920] border-[#D71920]' : 'border-gray-300 dark:border-gray-600'
            }`}>
              {checked && <Check className="h-3 w-3 text-white" />}
            </div>
            <span className="text-[13px] text-gray-700 dark:text-gray-300 leading-snug">
              I have read and understand the above. I freely give my consent to the collection and processing of my data for the stated purposes. I understand I can withdraw consent at any time.
            </span>
          </label>

          <button
            onClick={handleAccept}
            disabled={!checked || submitting}
            className="w-full py-3.5 rounded-xl bg-[#D71920] text-white text-sm font-semibold active:scale-[0.97] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {submitting ? (
              <span className="flex items-center justify-center gap-2">
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Recording consent...
              </span>
            ) : (
              'I Consent — Continue'
            )}
          </button>

          <p className="text-[10px] text-gray-400 text-center">
            Consent v{CONSENT_VERSION} · Safend Secure Solutions Pvt. Ltd. · CIN: U74999OR2025PTC048500
          </p>
        </div>
      </motion.div>
    </div>
  );
}
