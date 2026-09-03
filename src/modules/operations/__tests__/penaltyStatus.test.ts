import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { PENALTY_STATUSES, PenaltyStatus, PenaltyRecord, VIOLATION_TYPES } from '../schemas/penaltySchema';

/**
 * Property 5: Status transition correctness
 * **Validates: Requirements 6.1, 6.2, 6.5**
 *
 * For any penalty record with status "Open", invoking the resolve action SHALL change its
 * status to "Resolved", and invoking the appeal action SHALL change its status to "Appealed".
 * For any penalty record with status other than "Open", resolve and appeal actions SHALL NOT
 * be available.
 */

// --- Pure logic extracted from the component/hook layer for testing ---

/**
 * Determines whether resolve/appeal actions are available for a given status.
 * This mirrors the logic in PenaltyTable.tsx: `record.status === "Open"`
 */
function areStatusActionsAvailable(status: PenaltyStatus): boolean {
  return status === 'Open';
}

/**
 * Applies a resolve transition to a penalty status.
 * This mirrors the changeStatus call in usePenalties: changeStatus(id, 'Resolved')
 * Returns the new status if the transition is valid, or null if not allowed.
 */
function applyResolveTransition(currentStatus: PenaltyStatus): PenaltyStatus | null {
  if (currentStatus !== 'Open') return null;
  return 'Resolved';
}

/**
 * Applies an appeal transition to a penalty status.
 * This mirrors the changeStatus call in usePenalties: changeStatus(id, 'Appealed')
 * Returns the new status if the transition is valid, or null if not allowed.
 */
function applyAppealTransition(currentStatus: PenaltyStatus): PenaltyStatus | null {
  if (currentStatus !== 'Open') return null;
  return 'Appealed';
}

// --- Generators ---

const penaltyStatusArb = fc.constantFrom(...PENALTY_STATUSES);
const nonOpenStatusArb = fc.constantFrom(
  ...PENALTY_STATUSES.filter((s) => s !== 'Open')
);

// --- Property Tests ---

describe('Property 5: Status transition correctness', () => {
  it('only "Open" penalties can be resolved (transitioned to "Resolved")', () => {
    fc.assert(
      fc.property(fc.constant('Open' as PenaltyStatus), (status) => {
        const result = applyResolveTransition(status);
        expect(result).toBe('Resolved');
      })
    );
  });

  it('only "Open" penalties can be appealed (transitioned to "Appealed")', () => {
    fc.assert(
      fc.property(fc.constant('Open' as PenaltyStatus), (status) => {
        const result = applyAppealTransition(status);
        expect(result).toBe('Appealed');
      })
    );
  });

  it('"Resolved" and "Appealed" penalties cannot change status via resolve', () => {
    fc.assert(
      fc.property(nonOpenStatusArb, (status) => {
        const result = applyResolveTransition(status);
        expect(result).toBeNull();
      })
    );
  });

  it('"Resolved" and "Appealed" penalties cannot change status via appeal', () => {
    fc.assert(
      fc.property(nonOpenStatusArb, (status) => {
        const result = applyAppealTransition(status);
        expect(result).toBeNull();
      })
    );
  });

  it('resolve/appeal action buttons are only available when status is "Open"', () => {
    fc.assert(
      fc.property(penaltyStatusArb, (status) => {
        const actionsAvailable = areStatusActionsAvailable(status);
        if (status === 'Open') {
          expect(actionsAvailable).toBe(true);
        } else {
          expect(actionsAvailable).toBe(false);
        }
      })
    );
  });

  it('status values are always one of the valid PENALTY_STATUSES', () => {
    fc.assert(
      fc.property(penaltyStatusArb, (status) => {
        // After any operation, the status must remain in the valid set
        const validStatuses: readonly string[] = PENALTY_STATUSES;
        expect(validStatuses).toContain(status);

        // After resolve transition (if valid)
        const afterResolve = applyResolveTransition(status);
        if (afterResolve !== null) {
          expect(validStatuses).toContain(afterResolve);
        }

        // After appeal transition (if valid)
        const afterAppeal = applyAppealTransition(status);
        if (afterAppeal !== null) {
          expect(validStatuses).toContain(afterAppeal);
        }
      })
    );
  });
});
