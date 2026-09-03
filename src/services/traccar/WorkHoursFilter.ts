/**
 * Stub: WorkHoursFilter (module referenced by traccar/monthly-report route)
 * TODO: Implement actual work hours filtering logic
 */

export function filterByWorkHours(positions: any[], workStart?: string, workEnd?: string): any[] {
  return positions;
}

export function calculateDistanceFromPositions(positions: any[]): number {
  return 0;
}

export function isWorkDay(date: Date | string): boolean {
  const d = typeof date === 'string' ? new Date(date) : date;
  const day = d.getDay();
  return day !== 0 && day !== 6; // Not Sunday or Saturday
}
