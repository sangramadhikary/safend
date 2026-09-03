/**
 * Offense-to-weight mapping utility.
 * Each offense has a default severity weight from 1 (lowest) to 5 (highest).
 */

export const OFFENSE_WEIGHTS: Record<string, number> = {
  // Disciplinary (lower severity)
  'Late Arrival': 1,
  'Early Left Duty Without Handover': 2,
  'Misbehave with Staff or Client': 2,
  // Integrity (medium severity)
  'Sleeping on Duty': 3,
  'Mobile Use': 2,
  'Alcohol or Ganja on Duty': 4,
  'Leaking Sensitive Information': 4,
  'Bribery': 5,
  // Criminal (high severity)
  'Assault': 5,
  'Harassment': 4,
  'Drug Use': 4,
  'Vandalism': 3,
  'Theft': 5,
};

/**
 * Returns the default weight for a given offense.
 * Falls back to 1 if offense is not found in the mapping.
 */
export function getDefaultWeight(offense: string): number {
  return OFFENSE_WEIGHTS[offense] ?? 1;
}
