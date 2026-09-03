'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';

const COOKIE_KEY = 'safend_cookie_consent';

/**
 * Cookie consent banner — shows on first visit, stores preference.
 * Only essential cookies are used by default. Analytics requires opt-in.
 */
export function CookieConsent() {
  const [visible, setVisible] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(COOKIE_KEY);
    if (!stored) {
      // Show after a brief delay so it doesn't compete with page load
      const timer = setTimeout(() => setVisible(true), 1500);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleAcceptAll = () => {
    localStorage.setItem(COOKIE_KEY, JSON.stringify({ essential: true, analytics: true, accepted_at: new Date().toISOString() }));
    setVisible(false);
  };

  const handleEssentialOnly = () => {
    localStorage.setItem(COOKIE_KEY, JSON.stringify({ essential: true, analytics: false, accepted_at: new Date().toISOString() }));
    setVisible(false);
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className="fixed bottom-0 left-0 right-0 z-200 p-4 md:p-6"
        >
          <div className="max-w-2xl mx-auto bg-white dark:bg-[#1a1d2e] rounded-2xl border border-gray-200 dark:border-white/10 shadow-2xl overflow-hidden">
            <div className="p-5 md:p-6">
              {/* Main text */}
              <div className="flex items-start gap-3 mb-4">
                <span className="text-xl shrink-0">🍪</span>
                <div>
                  <h3 className="text-sm font-semibold">We value your privacy</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">
                    We use essential cookies to make our site work. With your consent, we may also use analytics cookies to understand how you interact with our site and improve our services.
                  </p>
                </div>
              </div>

              {/* Expandable details */}
              <AnimatePresence>
                {showDetails && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden mb-4"
                  >
                    <div className="rounded-lg border border-gray-100 dark:border-white/5 divide-y divide-gray-100 dark:divide-white/5">
                      {/* Essential */}
                      <div className="p-3.5">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-semibold">Essential Cookies</span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400 font-medium">Always active</span>
                        </div>
                        <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed">
                          Required for the website to function. Includes session management, security tokens (CSRF), authentication cookies, and user preferences. Cannot be disabled.
                        </p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <CookieTag name="safend_session" purpose="Login session" />
                          <CookieTag name="cf_clearance" purpose="Bot protection" />
                        </div>
                      </div>

                      {/* Analytics */}
                      <div className="p-3.5">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-semibold">Analytics Cookies</span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 dark:bg-white/5 dark:text-gray-400 font-medium">Optional</span>
                        </div>
                        <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed">
                          Help us understand how visitors use our site (pages visited, time spent). Data is aggregated and anonymised. We use Vercel Analytics — no personal data is collected or shared with advertisers.
                        </p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <CookieTag name="va_*" purpose="Vercel Analytics" />
                          <CookieTag name="si_*" purpose="Speed Insights" />
                        </div>
                      </div>

                      {/* What we DON'T do */}
                      <div className="p-3.5 bg-gray-50 dark:bg-white/2">
                        <p className="text-[11px] text-gray-500 dark:text-gray-400">
                          <strong className="text-gray-700 dark:text-gray-300">We do NOT use:</strong> advertising cookies, third-party tracking pixels, social media cookies, or cross-site tracking of any kind.
                        </p>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Actions */}
              <div className="flex items-center gap-3 flex-wrap">
                <button
                  onClick={handleAcceptAll}
                  className="flex-1 min-w-[120px] py-2.5 rounded-lg bg-[#D71920] text-white text-xs font-semibold active:scale-[0.97] transition-transform"
                >
                  Accept All
                </button>
                <button
                  onClick={handleEssentialOnly}
                  className="flex-1 min-w-[120px] py-2.5 rounded-lg border border-gray-200 dark:border-white/10 text-xs font-semibold active:scale-[0.97] transition-transform"
                >
                  Essential Only
                </button>
                <button
                  onClick={() => setShowDetails(!showDetails)}
                  className="text-xs text-gray-500 hover:text-gray-800 dark:hover:text-gray-300 underline underline-offset-2"
                >
                  {showDetails ? 'Hide details' : 'Cookie details'}
                </button>
              </div>

              {/* Policy link */}
              <p className="text-[10px] text-gray-400 mt-3 text-center">
                Read our <Link href="/privacy-policy" className="underline hover:text-gray-600">Privacy Policy</Link> for more information.
              </p>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function CookieTag({ name, purpose }: { name: string; purpose: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-gray-400">
      <code className="font-mono">{name}</code>
      <span className="text-gray-400">·</span>
      {purpose}
    </span>
  );
}
