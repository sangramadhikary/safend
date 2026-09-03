'use client';

export const nivoTheme: any = {
  background: 'transparent',
  text: {
    fontSize: 12,
    fill: 'hsl(var(--foreground))',
    outlineWidth: 0,
    outlineColor: 'transparent',
  },
  axis: {
    domain: {
      line: {
        stroke: 'hsl(var(--border))',
        strokeWidth: 1,
      },
    },
    legend: {
      text: {
        fontSize: 13,
        fill: 'hsl(var(--foreground))',
        fontWeight: 600,
      },
    },
    ticks: {
      line: {
        stroke: 'hsl(var(--border))',
        strokeWidth: 1,
      },
      text: {
        fontSize: 11,
        fill: 'hsl(var(--muted-foreground))',
      },
    },
  },
  grid: {
    line: {
      stroke: 'hsl(var(--border))',
      strokeWidth: 1,
      strokeOpacity: 0.3,
    },
  },
  legends: {
    title: {
      text: {
        fontSize: 12,
        fill: 'hsl(var(--foreground))',
        fontWeight: 600,
      },
    },
    text: {
      fontSize: 11,
      fill: 'hsl(var(--muted-foreground))',
    },
    ticks: {
      line: {},
      text: {
        fontSize: 10,
        fill: 'hsl(var(--muted-foreground))',
      },
    },
  },
  annotations: {
    text: {
      fontSize: 13,
      fill: 'hsl(var(--foreground))',
      outlineWidth: 2,
      outlineColor: 'hsl(var(--background))',
      outlineOpacity: 1,
    },
    link: {
      stroke: 'hsl(var(--border))',
      strokeWidth: 1,
      outlineWidth: 2,
      outlineColor: 'hsl(var(--background))',
      outlineOpacity: 1,
    },
    outline: {
      stroke: 'hsl(var(--border))',
      strokeWidth: 2,
      outlineWidth: 2,
      outlineColor: 'hsl(var(--background))',
      outlineOpacity: 1,
    },
    symbol: {
      fill: 'hsl(var(--foreground))',
      outlineWidth: 2,
      outlineColor: 'hsl(var(--background))',
      outlineOpacity: 1,
    },
  },
  tooltip: {
    container: {
      background: 'hsl(var(--popover))',
      color: 'hsl(var(--popover-foreground))',
      fontSize: 12,
      borderRadius: '6px',
      boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
      padding: '8px 12px',
      border: '1px solid hsl(var(--border))',
    },
    basic: {},
    chip: {},
    table: {},
    tableCell: {},
    tableCellValue: {},
  },
};

// Safend brand color scheme
export const safendColors = [
  '#dc2626', // Safend Red
  '#ef4444', // Light Red
  '#f87171', // Lighter Red
  '#fca5a5', // Pale Red
  '#fee2e2', // Very Pale Red
  '#7f1d1d', // Dark Red
  '#991b1b', // Darker Red
  '#b91c1c', // Medium Dark Red
];

// Extended color palette for complex charts
export const extendedColors = [
  '#dc2626', // Red
  '#ea580c', // Orange
  '#ca8a04', // Yellow
  '#16a34a', // Green
  '#0891b2', // Cyan
  '#2563eb', // Blue
  '#7c3aed', // Purple
  '#c026d3', // Magenta
  '#db2777', // Pink
  '#64748b', // Slate
];

// Department-specific colors
export const departmentColors: Record<string, string> = {
  IT: '#2563eb',
  HR: '#16a34a',
  Sales: '#dc2626',
  Marketing: '#c026d3',
  Finance: '#ca8a04',
  Operations: '#0891b2',
};
