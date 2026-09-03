'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseClient } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { LogOut, Menu, X, Shield } from 'lucide-react';
import { useClientProfile } from '../hooks/useClientData';
import { clearPersistedQueryCache } from '@/lib/queryCache';

const LOGO_URL = "https://static.wixstatic.com/media/5b3fdf_0d52b265a0004375a797c038ad88f65e~mv2.png/v1/fill/w_278,h_172,al_c,q_85,usm_0.66_1.00_0.01,enc_avif,quality_auto/Logo_edited_edited.png";

interface ClientPortalLayoutProps {
  children: React.ReactNode;
}

export function ClientPortalLayout({ children }: ClientPortalLayoutProps) {
  const router = useRouter();
  const { data: profile } = useClientProfile();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogout = async () => {
    // Release the device slot first — the delete is authorized by the current
    // JWT, so it must happen before signOut() or the row lingers and keeps
    // consuming one of the account's allowed devices.
    try {
      const { releaseSession } = await import('@/utils/sessionManager');
      await releaseSession();
    } catch { /* non-critical — the stale-session TTL reclaims the slot */ }
    const client = getSupabaseClient();
    await client.auth.signOut();
    clearPersistedQueryCache();
    localStorage.removeItem('clientAuthenticated');
    router.push('/login');
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Top Navbar */}
      <header className="sticky top-0 z-50 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo + Title */}
            <div className="flex items-center gap-3">
              <img src={LOGO_URL} alt="Safend" className="h-8 w-auto" />
              <div className="hidden sm:block">
                <h1 className="text-sm font-semibold text-foreground dark:text-white">
                  Client Portal
                </h1>
                {profile && (
                  <p className="text-xs text-muted-foreground dark:text-gray-400">
                    {profile.company_name || profile.client_name}
                  </p>
                )}
              </div>
            </div>

            {/* Desktop: User info + Logout */}
            <div className="hidden sm:flex items-center gap-4">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400">
                <Shield className="h-3.5 w-3.5" />
                <span className="text-xs font-medium">
                  {profile?.contact_person || 'Client'}
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleLogout}
                className="text-muted-foreground hover:text-red-600"
              >
                <LogOut className="h-4 w-4 mr-1.5" />
                Sign Out
              </Button>
            </div>

            {/* Mobile menu button */}
            <button
              className="sm:hidden p-2"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {/* Mobile dropdown */}
        {mobileMenuOpen && (
          <div className="sm:hidden border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-4 py-3 space-y-3">
            {profile && (
              <p className="text-sm text-gray-700 dark:text-gray-300">
                {profile.contact_person} · {profile.company_name || profile.client_name}
              </p>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              className="w-full justify-start text-red-600"
            >
              <LogOut className="h-4 w-4 mr-2" />
              Sign Out
            </Button>
          </div>
        )}
      </header>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {children}
      </main>
    </div>
  );
}
