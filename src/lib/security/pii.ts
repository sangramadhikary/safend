/**
 * PII allow-listing for the public employee-verification flow.
 *
 * The employee verification endpoint queries the `employees` table, which
 * carries sensitive attributes (internal ids, branch scoping, and any future
 * columns). Returning the raw row to an unauthenticated caller would leak PII
 * and internal structure. `projectVerificationFields` projects an arbitrary
 * employee record onto the fixed verification-field allowlist so only the
 * intended public fields are ever exposed (Req 12.2).
 *
 * The projection is allow-list driven: only keys in {@link VERIFICATION_FIELDS}
 * are copied, and any attribute outside the allowlist (sensitive or unknown) is
 * dropped regardless of what the input record contains.
 */
import type { VerificationResultRecord } from './types';

/**
 * The ordered verification-field allowlist (Req 12.2). The output of
 * {@link projectVerificationFields} only ever contains keys drawn from this set.
 */
export const VERIFICATION_FIELDS = [
  'employee_id',
  'name',
  'department',
  'designation',
  'join_date',
  'status',
  'photo_url',
  'gender',
] as const satisfies ReadonlyArray<keyof VerificationResultRecord>;

/**
 * Project an employee record onto the verification-field allowlist.
 *
 * Only allowlisted keys that are present on the input are copied to the output;
 * every other attribute — including sensitive fields such as `id`, `branch_id`,
 * salary, contact details, or any unknown column — is excluded. The result's
 * key set is therefore always a subset of {@link VERIFICATION_FIELDS}.
 *
 * @param employee an arbitrary employee record (possibly carrying extra or
 *   sensitive attributes).
 * @returns a partial verification record containing only allowlisted fields
 *   that were present on the input.
 */
export function projectVerificationFields(
  employee: Record<string, unknown>
): Partial<VerificationResultRecord> {
  const projected: Partial<VerificationResultRecord> = {};

  for (const field of VERIFICATION_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(employee, field)) {
      // The allowlist is the single source of truth for exposable keys; values
      // are passed through unchanged. The cast narrows the unknown value to the
      // field's declared type without altering runtime behavior.
      projected[field] = employee[field] as VerificationResultRecord[typeof field];
    }
  }

  return projected;
}
