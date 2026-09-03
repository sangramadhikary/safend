'use client';

import { useState } from 'react';
import { Monitor, Smartphone, Trash2, XCircle } from 'lucide-react';
import { MAX_SESSIONS } from '@/utils/sessionManager';
import { revokeSessionById } from '@/utils/sessionManager';

interface SessionInfo {
  id?: string;
  device_info: string | null;
  location: string | null;
  last_active: string;
  ip_address?: string | null;
}

interface DeviceLimitInfoProps {
  /** The existing sessions that will be affected */
  sessions: SessionInfo[];
  /**
   * The account's device cap. Supervisor and client roles allow 1, ERP roles 2,
   * so this can't be read from the MAX_SESSIONS constant.
   */
  maxSessions?: number;
  /** The user ID for revoking sessions */
  userId?: string;
  /** Called when user confirms they want to proceed (evict oldest) */
  onProceed: () => void;
  /** Called when user decides to cancel login */
  onCancel: () => void;
  /** Called after a session is removed (refreshes session list) */
  onSessionRemoved?: () => void;
  isLoading?: boolean;
}

/**
 * Informational component shown during login when the user already has
 * the maximum allowed sessions. Explains that the oldest session will be
 * replaced and gives them a choice to proceed, remove specific sessions, or remove all.
 */
export function DeviceLimitInfo({ sessions, maxSessions = MAX_SESSIONS, userId, onProceed, onCancel, onSessionRemoved, isLoading }: DeviceLimitInfoProps) {
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [removingAll, setRemovingAll] = useState(false);

  const oldestSession = sessions.length > 0 ? sessions[sessions.length - 1] : null;

  // `sessions` arrives ordered by last_active DESC, and claim_session evicts
  // least-recently-active first — so the trailing rows are the ones that go.
  // Signing in needs one free slot, hence the +1.
  const evictCount = Math.max(0, sessions.length - maxSessions + 1);
  const firstEvictedIndex = sessions.length - evictCount;

  const getDeviceIcon = (deviceInfo: string | null) => {
    if (!deviceInfo) return <Monitor className="h-4 w-4" />;
    if (/Mobile|Android|iPhone|iPad/i.test(deviceInfo)) {
      return <Smartphone className="h-4 w-4" />;
    }
    return <Monitor className="h-4 w-4" />;
  };

  const formatLastActive = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMin = Math.floor(diffMs / 60000);

      if (diffMin < 1) return 'Active now';
      if (diffMin < 60) return `Active ${diffMin}m ago`;
      const diffHrs = Math.floor(diffMin / 60);
      if (diffHrs < 24) return `Active ${diffHrs}h ago`;
      return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    } catch {
      return 'Recently active';
    }
  };

  const handleRemoveSession = async (sessionId: string) => {
    if (!userId || !sessionId) return;
    setRemovingId(sessionId);
    try {
      const success = await revokeSessionById(userId, sessionId);
      if (success && onSessionRemoved) {
        onSessionRemoved();
      }
    } catch {
      // silently fail
    } finally {
      setRemovingId(null);
    }
  };

  const handleRemoveAll = async () => {
    if (!userId) return;
    setRemovingAll(true);
    try {
      // Remove all sessions one by one
      for (const s of sessions) {
        if (s.id) {
          await revokeSessionById(userId, s.id);
        }
      }
      if (onSessionRemoved) {
        onSessionRemoved();
      }
    } catch {
      // silently fail
    } finally {
      setRemovingAll(false);
    }
  };

  return (
    <div className="w-full space-y-4">
      <div className="p-4 rounded-xl bg-amber-50 border border-amber-200">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center shrink-0 mt-0.5">
            <Monitor className="h-4 w-4 text-amber-600" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-amber-800">
              Device limit reached
            </h3>
            <p className="text-xs text-amber-700 mt-1">
              You&apos;re already signed in on {sessions.length}{' '}
              {sessions.length === 1 ? 'device' : 'devices'} (limit {maxSessions}). Continuing will sign
              out {evictCount === 1 ? 'the oldest session' : `the ${evictCount} oldest sessions`}.
            </p>
          </div>
        </div>
      </div>

      {/* Show which session will be evicted */}
      {oldestSession && (
        <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
          <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">Will be signed out:</p>
          <div className="flex items-center gap-2.5">
            <div className="text-slate-400">
              {getDeviceIcon(oldestSession.device_info)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-slate-700 truncate">
                {oldestSession.device_info || 'Unknown device'}
              </p>
              <p className="text-[10px] text-slate-500">
                {oldestSession.ip_address && (
                  <span className="font-mono text-slate-500">{oldestSession.ip_address} · </span>
                )}
                {oldestSession.location && `${oldestSession.location} · `}
                {formatLastActive(oldestSession.last_active)}
              </p>
            </div>
            {oldestSession.id && userId && (
              <button
                onClick={() => handleRemoveSession(oldestSession.id!)}
                disabled={removingId === oldestSession.id || removingAll}
                className="p-1.5 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50 transition-all disabled:opacity-30"
                title="Remove this session"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Show all active sessions */}
      {sessions.length > 0 && (
        <div className="p-3 rounded-lg bg-slate-50/50 border border-slate-100">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] uppercase tracking-wider text-slate-500">Active sessions ({sessions.length}):</p>
            {sessions.length > 1 && userId && (
              <button
                onClick={handleRemoveAll}
                disabled={removingAll || isLoading}
                className="flex items-center gap-1 text-[10px] text-red-500 hover:text-red-600 transition-colors disabled:opacity-30"
                title="Remove all sessions"
              >
                <XCircle className="h-3 w-3" />
                {removingAll ? 'Removing…' : 'Remove all'}
              </button>
            )}
          </div>
          <div className="space-y-2">
            {sessions.map((s, i) => (
              <div key={s.id || i} className="flex items-center gap-2.5 group">
                <div className="text-slate-400">
                  {getDeviceIcon(s.device_info)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] text-slate-600 truncate">
                    {s.device_info || 'Unknown device'}
                  </p>
                  <p className="text-[10px] text-slate-400">
                    {s.ip_address && (
                      <span className="font-mono text-slate-500">{s.ip_address} · </span>
                    )}
                    {s.location && `${s.location} · `}
                    {formatLastActive(s.last_active)}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {i >= firstEvictedIndex && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-50 text-red-600 border border-red-100">
                      Will be removed
                    </span>
                  )}
                  {s.id && userId && (
                    <button
                      onClick={() => handleRemoveSession(s.id!)}
                      disabled={removingId === s.id || removingAll}
                      className="p-1 rounded-md text-slate-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all disabled:opacity-30"
                      title="Remove this session"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-3">
        <button
          onClick={onCancel}
          disabled={isLoading || removingAll}
          className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-slate-600 bg-slate-100 border border-slate-200 hover:bg-slate-200 transition-all disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          onClick={onProceed}
          disabled={isLoading || removingAll}
          className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-white bg-[#D71920] hover:bg-[#b8151b] shadow-lg shadow-[#D71920]/30 transition-all disabled:opacity-50"
        >
          {isLoading ? 'Signing in…' : 'Continue & Sign In'}
        </button>
      </div>
    </div>
  );
}
