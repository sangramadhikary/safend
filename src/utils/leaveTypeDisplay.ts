/**
 * Leave type display helper.
 *
 * Maps legacy "Urgent Leave" values stored in the database to "Sick Leave"
 * for display purposes. No data migration is needed — the helper translates
 * at the presentation layer.
 *
 * Requirement 6.6: WHEN a leave record with type "Urgent Leave" exists in the
 * database, THE system SHALL display the record as "Sick Leave" in all user
 * interfaces.
 */

/**
 * Returns the user-facing display name for a leave type.
 *
 * Legacy records with `"Urgent Leave"` are rendered as `"Sick Leave"`.
 * All other values pass through unchanged.
 */
export function displayLeaveType(type: string): string {
  if (type === 'Urgent Leave') {
    return 'Sick Leave';
  }
  return type;
}
