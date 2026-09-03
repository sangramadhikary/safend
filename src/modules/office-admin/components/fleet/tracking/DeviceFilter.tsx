'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ChevronDown, Search, Users } from 'lucide-react';
import {
  deviceLabel,
  deviceSubLabel,
  formatRelative,
  isRecentlyActive,
} from '@/services/traccar/traccarFormat';
import type { TraccarDevice } from '@/services/traccar/traccarTypes';

interface DeviceFilterProps {
  devices: TraccarDevice[];
  selectedIds: number[];
  onChange: (ids: number[]) => void;
  colors: Record<number, string>;
}

/** Multi-select over the tracker list, driving every report query in the console. */
export function DeviceFilter({ devices, selectedIds, onChange, colors }: DeviceFilterProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return devices;
    return devices.filter((device) =>
      [deviceLabel(device), deviceSubLabel(device), device.uniqueId, device.name]
        .join(' ')
        .toLowerCase()
        .includes(needle)
    );
  }, [devices, search]);

  const toggle = (id: number) => {
    onChange(
      selectedIds.includes(id) ? selectedIds.filter((value) => value !== id) : [...selectedIds, id]
    );
  };

  const label =
    selectedIds.length === 0
      ? 'No devices'
      : selectedIds.length === devices.length
        ? `All devices (${devices.length})`
        : `${selectedIds.length} of ${devices.length} devices`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="justify-between gap-2 min-w-[190px]">
          <span className="flex items-center gap-2 truncate">
            <Users className="h-4 w-4 text-muted-foreground" />
            <span className="truncate">{label}</span>
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>

      <PopoverContent align="start" className="w-[320px] p-0">
        <div className="border-b p-2">
          {/* Flush search field. Radix focuses it when the popover opens, and the
              theme's focus ring is pure black, so a bordered input would render a
              heavy double outline the moment the dropdown appears. */}
          <div className="flex items-center gap-2 rounded-md bg-muted/50 px-2.5">
            <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search person, vehicle, device id"
              className="h-9 border-0 bg-transparent px-0 text-sm shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
            />
          </div>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-[11px] text-muted-foreground">
              {selectedIds.length} selected
            </span>
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => onChange(devices.map((device) => device.id))}
              >
                Select all
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => onChange([])}
              >
                Clear
              </Button>
            </div>
          </div>
        </div>

        {/* A plain scroll container rather than Radix ScrollArea: that component's
            viewport is `h-full`, which resolves to `auto` inside a max-height
            parent, so the list overflowed and was clipped with no way to scroll
            to the devices below the fold. */}
        <div className="max-h-[300px] overflow-y-auto overscroll-contain">
          <div className="p-1">
            {filtered.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                No matching devices
              </p>
            ) : (
              filtered.map((device) => {
                const active = isRecentlyActive(device.lastUpdate);
                const checked = selectedIds.includes(device.id);
                return (
                  <label
                    key={device.id}
                    className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-2 hover:bg-muted/60"
                  >
                    <Checkbox checked={checked} onCheckedChange={() => toggle(device.id)} />
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: colors[device.id] ?? '#94A3B8' }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-medium leading-tight">
                          {deviceLabel(device)}
                        </span>
                        {device.disabled && (
                          <span className="rounded bg-slate-100 px-1 text-[9px] text-slate-500">
                            disabled
                          </span>
                        )}
                      </span>
                      <span className="block truncate text-[11px] leading-tight text-muted-foreground">
                        {deviceSubLabel(device) || device.uniqueId}
                      </span>
                    </span>
                    <span
                      className={`shrink-0 text-[10px] ${active ? 'text-green-600' : 'text-muted-foreground'}`}
                    >
                      {active ? '● live' : formatRelative(device.lastUpdate)}
                    </span>
                  </label>
                );
              })
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
