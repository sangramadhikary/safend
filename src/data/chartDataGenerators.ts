// Chart data generators - returns sample data for visualization
// Replace with real database queries when backend is connected

// StreamChart expects: array of objects, each key maps to a numeric value
// e.g. [{ IT: 120, HR: 80, Sales: 200 }, { IT: 150, HR: 90, Sales: 180 }, ...]
export const generateStreamData = (): Record<string, number>[] => [
  { IT: 120, HR: 80, Sales: 200, Marketing: 60, Finance: 140, Operations: 180 },
  { IT: 150, HR: 90, Sales: 180, Marketing: 75, Finance: 130, Operations: 200 },
  { IT: 130, HR: 100, Sales: 220, Marketing: 85, Finance: 160, Operations: 170 },
  { IT: 170, HR: 85, Sales: 190, Marketing: 70, Finance: 150, Operations: 210 },
  { IT: 160, HR: 95, Sales: 240, Marketing: 90, Finance: 145, Operations: 195 },
  { IT: 140, HR: 110, Sales: 210, Marketing: 80, Finance: 155, Operations: 185 },
];

export const generateSunburstData = () => ({
  id: 'root',
  children: [
    { id: 'Operations', value: 450 },
    { id: 'Sales', value: 320 },
    { id: 'HR', value: 180 },
    { id: 'Finance', value: 210 },
    { id: 'IT', value: 140 },
  ],
});

export const generateNetworkData = () => ({
  nodes: [
    { id: 'Mumbai' }, { id: 'Delhi' }, { id: 'Bangalore' },
    { id: 'Chennai' }, { id: 'Hyderabad' },
  ],
  links: [
    { source: 'Mumbai', target: 'Delhi', distance: 30 },
    { source: 'Mumbai', target: 'Bangalore', distance: 50 },
    { source: 'Delhi', target: 'Chennai', distance: 40 },
    { source: 'Bangalore', target: 'Hyderabad', distance: 20 },
    { source: 'Chennai', target: 'Hyderabad', distance: 35 },
  ],
});

export const generateSankeyData = () => ({
  nodes: [
    { id: 'Leads' }, { id: 'Qualified' }, { id: 'Proposal' },
    { id: 'Negotiation' }, { id: 'Won' }, { id: 'Lost' },
  ],
  links: [
    { source: 'Leads', target: 'Qualified', value: 80 },
    { source: 'Leads', target: 'Lost', value: 20 },
    { source: 'Qualified', target: 'Proposal', value: 60 },
    { source: 'Qualified', target: 'Lost', value: 20 },
    { source: 'Proposal', target: 'Negotiation', value: 40 },
    { source: 'Proposal', target: 'Lost', value: 20 },
    { source: 'Negotiation', target: 'Won', value: 30 },
    { source: 'Negotiation', target: 'Lost', value: 10 },
  ],
});

export const generateCalendarData = () => {
  const data = [];
  const start = new Date('2025-01-01');
  // Use deterministic values based on index to avoid hydration mismatch
  const values = [45, 72, 38, 91, 56, 23, 84, 67, 12, 95, 43, 78, 31, 60, 88, 15, 52, 76, 29, 64,
                  47, 83, 19, 71, 55, 92, 36, 68, 24, 80, 41, 73, 58, 16, 87, 44, 69, 33, 96, 51,
                  77, 22, 85, 48, 63, 28, 90, 37, 74, 18, 82, 53, 66, 39, 94, 46, 70, 25, 86, 42,
                  75, 30, 97, 54, 61, 20, 89, 35, 72, 49, 65, 27, 93, 40, 76, 17, 84, 50, 62, 21,
                  88, 34, 98, 57, 60, 26, 91, 38, 73, 45, 67, 14, 85, 52, 64, 23, 92, 36, 78, 43,
                  69, 28, 95, 41, 71, 19, 87, 55, 63, 32, 90, 44, 76, 22, 83, 48, 66, 30, 94, 37,
                  74, 16, 88, 53, 61, 25, 92, 39, 77, 46, 68, 13, 86, 51, 65, 29, 96, 42, 75, 20,
                  89, 35, 99, 58, 62, 24, 93, 40, 72, 47, 70, 15, 84, 56, 64, 27, 91, 38, 79, 44,
                  67, 18, 85, 50, 63, 31, 95, 43, 76, 21, 88, 34, 97, 55, 60, 26, 92, 37, 73, 48];
  for (let i = 0; i < 180; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    data.push({
      day: d.toISOString().split('T')[0],
      value: values[i % values.length],
    });
  }
  return data;
};

// ChordChart expects { matrix: number[][], keys: string[] }
export const generateChordData = () => ({
  matrix: [
    [0, 120, 80, 60, 40],
    [120, 0, 90, 70, 50],
    [80, 90, 0, 100, 60],
    [60, 70, 100, 0, 80],
    [40, 50, 60, 80, 0],
  ],
  keys: ['Mumbai', 'Delhi', 'Bangalore', 'Chennai', 'Hyderabad'],
});

export const generateRadarData = () => [
  { branch: 'Mumbai', Mumbai: 90, Delhi: 70, Bangalore: 80, Chennai: 60, Hyderabad: 75 },
  { branch: 'Delhi', Mumbai: 65, Delhi: 85, Bangalore: 70, Chennai: 55, Hyderabad: 60 },
  { branch: 'Bangalore', Mumbai: 75, Delhi: 60, Bangalore: 95, Chennai: 70, Hyderabad: 80 },
];

export const generateTreemapData = () => ({
  id: 'root',
  children: [
    { id: 'Operations', value: 450 },
    { id: 'Sales', value: 320 },
    { id: 'HR', value: 180 },
    { id: 'Finance', value: 210 },
    { id: 'IT', value: 140 },
    { id: 'Admin', value: 90 },
  ],
});
