/**
 * Stub: AnomalyDetector (module referenced by traccar/monthly-report route)
 * TODO: Implement actual anomaly detection logic
 */

export interface Anomaly {
  type: string;
  severity: string;
  description: string;
  timestamp: string;
}

export class AnomalyDetector {
  detectAnomaliesFromPositions(positions: any[], date: string): Anomaly[] {
    return [];
  }
}
