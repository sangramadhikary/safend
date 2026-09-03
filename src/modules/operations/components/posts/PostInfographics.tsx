'use client';

import { SERVICE_META_MAP } from "./postMetrics";

/**
 * Minimal service type chips — no rings, no stacked bars.
 * Matches the flat badge style used across the app.
 */

interface ServiceChipsProps {
  byService: Record<string, number>;
}

export function ServiceChips({ byService }: ServiceChipsProps) {
  const entries = Object.entries(byService).filter(([, v]) => v > 0);
  if (entries.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5">
      {entries.map(([key, value]) => {
        const meta = SERVICE_META_MAP[key];
        return (
          <span
            key={key}
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${meta?.badgeClass ?? "bg-muted text-foreground"}`}
          >
            {meta?.label ?? key}
            <span className="font-bold">{value}</span>
          </span>
        );
      })}
    </div>
  );
}
