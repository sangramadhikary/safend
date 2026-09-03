'use client';

import { useRef, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { cn } from '@/lib/utils';

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * VirtualList — High-performance windowed list for large datasets
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Renders only the visible items + a small overscan buffer. Ideal for:
 * - Employee directories (500+ cards)
 * - Attendance records (1000+ rows)
 * - Invoice lists, payslip histories
 * - Any unbounded list that grows over time
 *
 * Uses @tanstack/react-virtual (same ecosystem as React Query).
 * Only ~3KB gzipped — no heavy dependencies.
 *
 * Usage:
 *   <VirtualList
 *     items={employees}
 *     height={600}
 *     estimateSize={80}
 *     renderItem={(employee, index) => <EmployeeCard data={employee} />}
 *   />
 * ═══════════════════════════════════════════════════════════════════════════════
 */

interface VirtualListProps<T> {
  /** The full dataset to virtualize */
  items: T[];
  /** Container height in pixels. Ignored when useWindowScroll=true. */
  height?: number | string;
  /** Estimated height of each item in pixels (doesn't need to be exact) */
  estimateSize: number;
  /** Render function for each item */
  renderItem: (item: T, index: number) => React.ReactNode;
  /** Number of items to render beyond the visible area (default: 5) */
  overscan?: number;
  /** Additional className for the scroll container */
  className?: string;
  /** Key extractor (defaults to index) */
  getKey?: (item: T, index: number) => string | number;
  /** Empty state when items is empty */
  emptyState?: React.ReactNode;
  /** Gap between items in pixels (default: 0) */
  gap?: number;
  /**
   * Use the window/page as the scroll element instead of a nested container.
   * This avoids the "scroll inside scroll" problem and makes the list feel
   * like a natural part of the page. Default: false.
   */
  useWindowScroll?: boolean;
}

export function VirtualList<T>({
  items,
  height,
  estimateSize,
  renderItem,
  overscan = 5,
  className,
  getKey,
  emptyState,
  gap = 0,
  useWindowScroll = false,
}: VirtualListProps<T>) {
  const parentRef = useRef<HTMLDivElement>(null);

  // Always call both hooks (Rules of Hooks), but configure one as active
  const containerVirtualizer = useVirtualizer({
    count: useWindowScroll ? 0 : items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimateSize + gap,
    overscan,
    enabled: !useWindowScroll,
  });

  const windowVirtualizer = useVirtualizer({
    count: useWindowScroll ? items.length : 0,
    estimateSize: () => estimateSize + gap,
    overscan,
    scrollMargin: parentRef.current?.offsetTop ?? 0,
    getScrollElement: () => (typeof window !== 'undefined' ? document.documentElement : null) as any,
    enabled: useWindowScroll,
  });

  const activeVirtualizer = useWindowScroll ? windowVirtualizer : containerVirtualizer;

  if (items.length === 0 && emptyState) {
    return <>{emptyState}</>;
  }

  const virtualItems = activeVirtualizer.getVirtualItems();

  // Window scroll mode: no overflow container, just a relative-positioned spacer
  if (useWindowScroll) {
    return (
      <div ref={parentRef} className={className}>
        <div
          style={{
            height: `${activeVirtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {virtualItems.map((virtualItem) => {
            const item = items[virtualItem.index];
            const key = getKey ? getKey(item, virtualItem.index) : virtualItem.index;

            return (
              <div
                key={key}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualItem.start - (activeVirtualizer.options.scrollMargin || 0)}px)`,
                }}
                data-index={virtualItem.index}
                ref={activeVirtualizer.measureElement}
              >
                {renderItem(item, virtualItem.index)}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // Container scroll mode (original behavior)
  return (
    <div
      ref={parentRef}
      className={cn('overflow-auto', className)}
      style={{ height: typeof height === 'number' ? `${height}px` : height }}
    >
      <div
        style={{
          height: `${activeVirtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualItems.map((virtualItem) => {
          const item = items[virtualItem.index];
          const key = getKey ? getKey(item, virtualItem.index) : virtualItem.index;

          return (
            <div
              key={key}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualItem.start}px)`,
              }}
              data-index={virtualItem.index}
              ref={activeVirtualizer.measureElement}
            >
              {renderItem(item, virtualItem.index)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * VirtualGrid — Windowed grid layout (for card views)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Renders items in a grid layout with virtualization. Each "row" is a group
 * of items (based on columns), and only visible rows are rendered.
 *
 * Usage:
 *   <VirtualGrid
 *     items={employees}
 *     columns={3}
 *     height={600}
 *     rowHeight={220}
 *     renderItem={(employee) => <EmployeeCard data={employee} />}
 *   />
 */

interface VirtualGridProps<T> {
  /** The full dataset */
  items: T[];
  /** Number of columns in the grid */
  columns: number;
  /** Container height. Ignored when useWindowScroll=true. */
  height?: number | string;
  /** Estimated row height in pixels */
  rowHeight: number;
  /** Render function for each item */
  renderItem: (item: T, index: number) => React.ReactNode;
  /** Overscan rows */
  overscan?: number;
  /** Additional className */
  className?: string;
  /** Key extractor */
  getKey?: (item: T, index: number) => string | number;
  /** Empty state */
  emptyState?: React.ReactNode;
  /** Gap between items */
  gap?: number;
  /**
   * Use the window/page as the scroll element instead of a nested container.
   * Makes the grid feel like a natural part of the page flow.
   */
  useWindowScroll?: boolean;
}

export function VirtualGrid<T>({
  items,
  columns,
  height,
  rowHeight,
  renderItem,
  overscan = 3,
  className,
  getKey,
  emptyState,
  gap = 16,
  useWindowScroll = false,
}: VirtualGridProps<T>) {
  const parentRef = useRef<HTMLDivElement>(null);
  const rowCount = Math.ceil(items.length / columns);

  // Always call both hooks (Rules of Hooks), but configure one as active
  const containerVirtualizer = useVirtualizer({
    count: useWindowScroll ? 0 : rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight + gap,
    overscan,
    enabled: !useWindowScroll,
  });

  const windowVirtualizer = useVirtualizer({
    count: useWindowScroll ? rowCount : 0,
    estimateSize: () => rowHeight + gap,
    overscan,
    scrollMargin: parentRef.current?.offsetTop ?? 0,
    getScrollElement: () => (typeof window !== 'undefined' ? document.documentElement : null) as any,
    enabled: useWindowScroll,
  });

  const virtualizer = useWindowScroll ? windowVirtualizer : containerVirtualizer;

  if (items.length === 0 && emptyState) {
    return <>{emptyState}</>;
  }

  const virtualRows = virtualizer.getVirtualItems();

  const content = (
    <div
      style={{
        height: `${virtualizer.getTotalSize()}px`,
        width: '100%',
        position: 'relative',
      }}
    >
      {virtualRows.map((virtualRow) => {
        const startIdx = virtualRow.index * columns;
        const rowItems = items.slice(startIdx, startIdx + columns);
        const offset = useWindowScroll
          ? virtualRow.start - (virtualizer.options.scrollMargin || 0)
          : virtualRow.start;

        return (
          <div
            key={virtualRow.index}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              transform: `translateY(${offset}px)`,
              display: 'grid',
              gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
              gap: `${gap}px`,
            }}
            data-index={virtualRow.index}
            ref={virtualizer.measureElement}
          >
            {rowItems.map((item, colIdx) => {
              const globalIdx = startIdx + colIdx;
              const key = getKey ? getKey(item, globalIdx) : globalIdx;
              return (
                <div key={key}>
                  {renderItem(item, globalIdx)}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );

  if (useWindowScroll) {
    return (
      <div ref={parentRef} className={className}>
        {content}
      </div>
    );
  }

  return (
    <div
      ref={parentRef}
      className={cn('overflow-auto', className)}
      style={{ height: typeof height === 'number' ? `${height}px` : height }}
    >
      {content}
    </div>
  );
}

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * VirtualTable — Windowed table rows with fixed header
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Renders a table where the header stays fixed and only visible rows are
 * rendered in the scrollable body.
 *
 * Usage:
 *   <VirtualTable
 *     items={attendanceRecords}
 *     height={500}
 *     rowHeight={48}
 *     header={<TableRow>...</TableRow>}
 *     renderRow={(record, index) => <TableRow>...</TableRow>}
 *   />
 */

interface VirtualTableProps<T> {
  /** Data rows */
  items: T[];
  /** Scrollable body height */
  height: number | string;
  /** Estimated row height */
  rowHeight: number;
  /** Table header content (rendered statically) */
  header: React.ReactNode;
  /** Render function for each row */
  renderRow: (item: T, index: number) => React.ReactNode;
  /** Overscan rows */
  overscan?: number;
  /** Additional className for the container */
  className?: string;
  /** Key extractor */
  getKey?: (item: T, index: number) => string | number;
  /** Empty state */
  emptyState?: React.ReactNode;
  /** Table caption */
  caption?: string;
}

export function VirtualTable<T>({
  items,
  height,
  rowHeight,
  header,
  renderRow,
  overscan = 10,
  className,
  getKey,
  emptyState,
  caption,
}: VirtualTableProps<T>) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight,
    overscan,
  });

  if (items.length === 0 && emptyState) {
    return <>{emptyState}</>;
  }

  const virtualRows = virtualizer.getVirtualItems();

  return (
    <div className={cn('rounded-md border', className)}>
      <table className="w-full caption-bottom text-sm">
        {caption && <caption className="mt-4 text-sm text-muted-foreground">{caption}</caption>}
        <thead className="[&_tr]:border-b sticky top-0 bg-background z-10">
          {header}
        </thead>
      </table>
      <div
        ref={parentRef}
        style={{ height: typeof height === 'number' ? `${height}px` : height }}
        className="overflow-auto"
      >
        <table className="w-full caption-bottom text-sm">
          <tbody className="[&_tr:last-child]:border-0">
            {/* Spacer for items above the visible window */}
            {virtualRows.length > 0 && virtualRows[0].start > 0 && (
              <tr style={{ height: `${virtualRows[0].start}px` }}>
                <td colSpan={100} />
              </tr>
            )}
            {virtualRows.map((virtualRow) => {
              const item = items[virtualRow.index];
              const key = getKey ? getKey(item, virtualRow.index) : virtualRow.index;
              return (
                <tr key={key} data-index={virtualRow.index} ref={virtualizer.measureElement}>
                  {renderRow(item, virtualRow.index) as any}
                </tr>
              );
            })}
            {/* Spacer for items below the visible window */}
            {virtualRows.length > 0 && (
              <tr style={{ height: `${virtualizer.getTotalSize() - (virtualRows[virtualRows.length - 1]?.end || 0)}px` }}>
                <td colSpan={100} />
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
