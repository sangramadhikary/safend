'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

const IST_TIMEZONE = 'Asia/Kolkata';

/**
 * Fetches accurate UTC time from internet time APIs.
 * Computes offset = server_time - local_time.
 * Tries Supabase server_now() first (same infra), then timeapi.io fallback.
 */
async function fetchTimeOffset(): Promise<number> {
  // Try Supabase server_now() RPC first (same server as all data — true single source of truth)
  try {
    const beforeFetch = Date.now();
    const { getSupabaseClient } = await import('@/integrations/supabase/client');
    const { data, error } = await getSupabaseClient().rpc('server_now');
    const afterFetch = Date.now();
    if (!error && data) {
      const networkLatency = (afterFetch - beforeFetch) / 2;
      const serverTimeMs = new Date(data).getTime();
      const localTimeAtResponse = beforeFetch + networkLatency;
      return serverTimeMs - localTimeAtResponse;
    }
  } catch {
    // Supabase RPC failed, try fallback
  }

  // Fallback: timeapi.io
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const beforeFetch = Date.now();
    const res = await fetch('https://timeapi.io/api/time/current/zone?timeZone=Asia/Kolkata', {
      cache: 'no-store',
      signal: controller.signal,
    });
    const afterFetch = Date.now();
    clearTimeout(timeout);
    if (res.ok) {
      const data = await res.json();
      const networkLatency = (afterFetch - beforeFetch) / 2;
      const serverTimeMs = new Date(data.dateTime + '+05:30').getTime();
      const localTimeAtResponse = beforeFetch + networkLatency;
      return serverTimeMs - localTimeAtResponse;
    }
  } catch {
    // timeapi.io failed, try last fallback
  }

  // Last fallback: WorldTimeAPI
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const beforeFetch = Date.now();
    const res = await fetch('https://worldtimeapi.org/api/timezone/Asia/Kolkata', {
      cache: 'no-store',
      signal: controller.signal,
    });
    const afterFetch = Date.now();
    clearTimeout(timeout);
    if (res.ok) {
      const data = await res.json();
      const networkLatency = (afterFetch - beforeFetch) / 2;
      const serverTimeMs = data.unixtime * 1000;
      const localTimeAtResponse = beforeFetch + networkLatency;
      return serverTimeMs - localTimeAtResponse;
    }
  } catch {
    // All failed
  }

  return 0;
}

export function DigitalClock() {
  const [time, setTime] = useState<Date | null>(null);
  const offsetRef = useRef<number>(0);
  const [synced, setSynced] = useState(false);

  // Initialize time client-side only to avoid prerender issues with new Date()
  useEffect(() => {
    if (!time) setTime(new Date());
  }, []);

  const sync = useCallback(async () => {
    const offset = await fetchTimeOffset();
    offsetRef.current = offset;
    setTime(new Date(Date.now() + offset));
    if (offset !== 0) setSynced(true);
  }, []);

  // Sync with internet time on mount and every 10 minutes
  useEffect(() => {
    sync();
    const syncInterval = setInterval(sync, 10 * 60 * 1000);
    return () => clearInterval(syncInterval);
  }, [sync]);

  // Tick every second using the offset
  useEffect(() => {
    const timer = setInterval(() => {
      setTime(new Date(Date.now() + offsetRef.current));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Force IST timezone in all formatting so it's always correct
  // regardless of the user's system timezone setting
  if (!time) return <div className="flex items-center gap-1.5 sm:gap-3"><span className="text-sm sm:text-lg font-bold font-mono tracking-tight">--:--:--</span></div>;

  const clock = time.toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: true, timeZone: IST_TIMEZONE,
  });
  const clockShort = time.toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit',
    hour12: true, timeZone: IST_TIMEZONE,
  });
  const day = time.toLocaleDateString('en-US', { weekday: 'long', timeZone: IST_TIMEZONE });
  const dayShort = time.toLocaleDateString('en-US', { weekday: 'short', timeZone: IST_TIMEZONE });
  const date = time.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric', timeZone: IST_TIMEZONE });
  const dateShort = time.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: IST_TIMEZONE });

  return (
    <div className="flex items-center gap-1.5 sm:gap-3" title={synced ? 'Synced with internet time (IST)' : 'Local time (IST)'}>
      {/* Full clock on larger screens, compact on mobile */}
      <span className="text-sm sm:text-lg font-bold font-mono tracking-tight">
        <span className="hidden sm:inline">{clock}</span>
        <span className="sm:hidden">{clockShort}</span>
      </span>
      {/* Day/date — compact on mobile, full on desktop */}
      <div className="leading-tight text-right hidden xs:block">
        <div className="text-[10px] sm:text-xs font-semibold">
          <span className="hidden sm:inline">{day}</span>
          <span className="sm:hidden">{dayShort}</span>
        </div>
        <div className="text-[10px] sm:text-xs text-muted-foreground">
          <span className="hidden sm:inline">{date}</span>
          <span className="sm:hidden">{dateShort}</span>
        </div>
      </div>
    </div>
  );
}
