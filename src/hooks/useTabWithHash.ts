'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';

/**
 * Syncs the active tab state with a URL search param (defaults to `?tab=xxx`).
 * On mount, reads the tab from the URL. On change, updates the URL so the
 * active tab/subtab survives a page refresh.
 *
 * @param defaultTab  The tab selected when the param is absent.
 * @param validTabs   Allowed tab ids (anything else falls back to default).
 * @param paramKey    The URL search param key to use. Use a distinct key
 *                    (e.g. "sub") for nested subtabs so they don't collide
 *                    with the top-level `tab` param.
 */
export function useTabWithHash(
  defaultTab: string,
  validTabs: string[],
  paramKey: string = 'tab'
) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const getInitialTab = () => {
    const tabFromUrl = searchParams.get(paramKey);
    if (tabFromUrl && validTabs.includes(tabFromUrl)) {
      return tabFromUrl;
    }
    return defaultTab;
  };

  const [activeTab, setActiveTab] = useState(getInitialTab);

  // Sync from URL on param change (e.g. back/forward navigation, or ModuleHeaderBar click)
  useEffect(() => {
    const tabFromUrl = searchParams.get(paramKey);
    if (tabFromUrl && validTabs.includes(tabFromUrl)) {
      // Param present and valid — switch to it
      if (tabFromUrl !== activeTab) setActiveTab(tabFromUrl);
    } else if (!tabFromUrl && activeTab !== defaultTab) {
      // Param removed (default tab selected) — reset to default
      setActiveTab(defaultTab);
    }
  }, [searchParams]);

  // Update URL when tab changes
  const setTab = useCallback((tab: string) => {
    setActiveTab(tab);
    const params = new URLSearchParams(searchParams.toString());
    if (tab === defaultTab) {
      params.delete(paramKey);
    } else {
      params.set(paramKey, tab);
    }
    const query = params.toString();
    router.replace(`${pathname}${query ? `?${query}` : ''}`, { scroll: false });
  }, [searchParams, pathname, router, defaultTab, paramKey]);

  return [activeTab, setTab] as const;
}
