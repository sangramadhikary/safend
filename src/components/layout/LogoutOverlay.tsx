'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * Logout overlay — handles the full sign-out flow with nuclear cache cleanup.
 *
 * When 'app:logout' fires (from SessionGuard, Sidebar, or any other trigger):
 * 1. Shows a branded transition overlay (user sees "Signing out")
 * 2. Releases the user_sessions row so the device slot is freed
 * 3. Signs out from Supabase (invalidates refresh token server-side)
 * 4. Runs nuclear cleanup (wipes ALL business data from localStorage)
 * 5. Redirects to /login
 *
 * Step 2 must precede step 3: the row delete is authorized by the current JWT.
 *
 * This ensures zero sensitive data remains on the device after logout —
 * same approach used by banking apps and Stripe.
 */
export function LogoutOverlay() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const handler = async () => {
      setVisible(true);

      // 0. Give the device slot back BEFORE signing out — the delete is
      //    authorized by the current JWT, so this must not run after signOut()
      //    or the row survives and permanently consumes a device slot.
      try {
        const { releaseSession } = await import('@/utils/sessionManager');
        await releaseSession();
      } catch {}

      // 1. Sign out from Supabase (revokes refresh token server-side)
      try {
        const { supabase } = await import('@/integrations/supabase/client');
        await supabase.auth.signOut();
      } catch {}

      // 2. Clear HttpOnly session cookie (server-side, XSS-proof)
      try {
        const { clearSessionCookie } = await import('@/lib/auth/session-cookie');
        await clearSessionCookie();
      } catch {}

      // 3. Nuclear cleanup — wipes ALL business data from localStorage
      try {
        const { cleanupAuthState } = await import('@/utils/authCleanup');
        cleanupAuthState();
      } catch {}

      // 4. Wipe IndexedDB (offline cache, form drafts, queue)
      try {
        const { idbNuclearWipe } = await import('@/lib/indexedDB');
        await idbNuclearWipe();
      } catch {}

      // 5. Clear in-memory React Query cache (Zustand stores die with the page)
      try {
        const { queryClient } = await import('@/lib/queryCache');
        queryClient.clear();
      } catch {}

      // 4. Redirect after the animation completes
      setTimeout(() => { window.location.href = '/login'; }, 2200);
    };

    window.addEventListener('app:logout', handler);
    return () => window.removeEventListener('app:logout', handler);
  }, []);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="fixed inset-0 z-9999 bg-white flex flex-col items-center justify-center gap-8"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
        >
          {/* Logo */}
          <motion.img
            src="https://static.wixstatic.com/media/5b3fdf_0d52b265a0004375a797c038ad88f65e~mv2.png/v1/fill/w_278,h_172,al_c,q_85,usm_0.66_1.00_0.01,enc_avif,quality_auto/Logo_edited_edited.png"
            alt="Safend"
            className="w-24 h-auto object-contain"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.15, ease: 'easeOut' }}
          />

          {/* Progress bar */}
          <motion.div
            className="w-48 h-[3px] rounded-full bg-gray-100 overflow-hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
          >
            <motion.div
              className="h-full bg-[#D71920] rounded-full origin-left"
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: 1.8, delay: 0.35, ease: 'linear' }}
            />
          </motion.div>

          {/* Label */}
          <motion.p
            className="text-xs text-gray-400 tracking-widest uppercase"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
          >
            Signing out
          </motion.p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
