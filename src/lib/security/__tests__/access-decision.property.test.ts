import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { hasStaffRole, ERP_STAFF_ROLES } from '../access-decision';

// Feature: security-hardening, Property 4: Destructive-operation gate admits only ERP staff roles
//
// For any resolved role set, hasStaffRole returns true if and only if the set
// intersects the concrete ERP staff role set (admin, hr, accounts, operations,
// sales, office-admin). No role outside that set can open the destructive gate,
// and any staff role present opens it.
//
// Validates: Requirements 7.6, 7.7
describe('hasStaffRole', () => {
  const staffSet = new Set<string>(ERP_STAFF_ROLES);

  // A generator producing a mix of staff roles and arbitrary (likely non-staff)
  // strings, so the property exercises both intersecting and disjoint sets.
  const roleArb = fc.array(
    fc.oneof(
      fc.constantFrom<string>(...ERP_STAFF_ROLES),
      fc.string(),
    ),
  );

  it('Property 4: returns true iff the role set intersects ERP_STAFF_ROLES', () => {
    fc.assert(
      fc.property(roleArb, (roles) => {
        const expected = roles.some((role) => staffSet.has(role));
        expect(hasStaffRole(roles)).toBe(expected);
      }),
      { numRuns: 100 },
    );
  });
});
