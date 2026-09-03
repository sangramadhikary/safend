'use client';

/**
 * Shared formatting + presentation helpers for the Clients (360) views.
 * Kept free of React so it can be imported by hooks and components alike.
 */

/** "₹12,50,000" — full Indian-grouped rupee amount. */
export const formatINR = (value: number): string =>
  `₹${Math.round(value || 0).toLocaleString('en-IN')}`;

/** "₹12.5L" / "₹1.2Cr" / "₹85,000" — compact for stat tiles. */
export const formatINRCompact = (value: number): string => {
  const n = Math.round(value || 0);
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 10000000) return `${sign}₹${(abs / 10000000).toFixed(abs >= 100000000 ? 0 : 2)}Cr`;
  if (abs >= 100000) return `${sign}₹${(abs / 100000).toFixed(abs >= 10000000 ? 0 : 1)}L`;
  if (abs >= 1000) return `${sign}₹${(abs / 1000).toFixed(abs >= 100000 ? 0 : 1)}K`;
  return `${sign}₹${abs.toLocaleString('en-IN')}`;
};

/** "05 Jan 2026" — null-safe. */
export const formatDate = (value?: Date | string | null): string => {
  if (!value) return '—';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

/** "Jan 2026" — used for "client since". */
export const formatMonthYear = (value?: Date | string | null): string => {
  if (!value) return '—';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
};

/** "3 days ago" / "in 12 days" / "today" */
export const formatRelative = (value?: Date | string | null): string => {
  if (!value) return '—';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  const diff = Math.round((d.getTime() - Date.now()) / 86400000);
  if (diff === 0) return 'today';
  if (diff === 1) return 'tomorrow';
  if (diff === -1) return 'yesterday';
  if (diff < 0) return `${Math.abs(diff)}d ago`;
  return `in ${diff}d`;
};

/** Up to two initials from a client / company name. */
export const initialsOf = (name?: string | null): string => {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

/** Deterministic avatar gradient so each client keeps the same colour. */
const AVATAR_GRADIENTS = [
  'from-red-500 to-rose-600',
  'from-indigo-500 to-blue-600',
  'from-emerald-500 to-teal-600',
  'from-amber-500 to-orange-600',
  'from-violet-500 to-purple-600',
  'from-cyan-500 to-sky-600',
  'from-fuchsia-500 to-pink-600',
  'from-lime-500 to-green-600',
];

export const avatarGradient = (seed?: string | null): string => {
  const s = seed || '';
  let hash = 0;
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) % 100000;
  return AVATAR_GRADIENTS[hash % AVATAR_GRADIENTS.length];
};

/** Tailwind classes per client lifecycle status. */
export const CLIENT_STATUS_STYLES: Record<string, { badge: string; accent: string; dot: string }> = {
  Active: {
    badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/40',
    accent: 'border-l-emerald-500',
    dot: 'bg-emerald-500',
  },
  Onboarding: {
    badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border-blue-200 dark:border-blue-800/40',
    accent: 'border-l-blue-500',
    dot: 'bg-blue-500',
  },
  Repeat: {
    badge: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800/40',
    accent: 'border-l-indigo-500',
    dot: 'bg-indigo-500',
  },
  'One-time': {
    badge: 'bg-slate-100 text-slate-700 dark:bg-slate-800/60 dark:text-slate-300 border-slate-200 dark:border-slate-700',
    accent: 'border-l-slate-400',
    dot: 'bg-slate-400',
  },
  Inactive: {
    badge: 'bg-gray-100 text-gray-600 dark:bg-gray-800/60 dark:text-gray-400 border-gray-200 dark:border-gray-700',
    accent: 'border-l-gray-400',
    dot: 'bg-gray-400',
  },
  Terminated: {
    badge: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800/40',
    accent: 'border-l-red-500',
    dot: 'bg-red-500',
  },
};

export const clientStatusStyle = (status: string) =>
  CLIENT_STATUS_STYLES[status] || CLIENT_STATUS_STYLES.Inactive;

/** Tailwind classes for document statuses (WO / agreement / quotation / invoice). */
export const docStatusClass = (status?: string): string => {
  const s = (status || '').toLowerCase();
  if (['active', 'completed', 'signed', 'accepted', 'received', 'paid'].includes(s))
    return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400';
  if (['in progress', 'scheduled', 'sent', 'partially_paid', 'partially paid'].includes(s))
    return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
  if (['pending', 'draft', 'revised', 'on hold', 'pending_signature'].includes(s))
    return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
  if (['overdue', 'rejected', 'cancelled', 'terminated', 'termination initiated', 'expired', 'lost'].includes(s))
    return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
  return 'bg-gray-100 text-gray-600 dark:bg-gray-800/60 dark:text-gray-400';
};

/** Prettify a snake/lower status for display. */
export const prettyStatus = (status?: string): string => {
  if (!status) return '—';
  return status
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
};
