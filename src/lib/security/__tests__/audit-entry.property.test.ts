import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { buildAuditEntry, type AuditOutcome } from '../audit-entry';

// Feature: security-hardening, Property 18: Audit entries contain all required fields with no placeholder substitution
//
// For any valid audit-event input, every output field equals the supplied
// input value (no hardcoded placeholder is substituted) and the timestamp is a
// valid UTC ISO-8601 string.
//
// Validates: Requirements 15.1
describe('buildAuditEntry', () => {
  // A non-empty string that does not collapse to empty after trimming, so it
  // is accepted as a required field value.
  const requiredString = fc
    .string({ minLength: 1 })
    .filter((s) => s.trim() !== '');

  const outcome: fc.Arbitrary<AuditOutcome> = fc.constantFrom(
    'success',
    'failure',
    'denied',
  );

  it('Property 18: every output field equals the supplied input and timestamp is valid UTC ISO', () => {
    fc.assert(
      fc.property(
        requiredString,
        requiredString,
        requiredString,
        outcome,
        requiredString,
        // Supply a concrete Date so we can assert the timestamp round-trips
        // to the same UTC instant the caller provided.
        fc.date({
          min: new Date('1970-01-01T00:00:00.000Z'),
          max: new Date('9999-12-31T23:59:59.999Z'),
        }),
        (
          actorUserId,
          actionType,
          affectedResourceId,
          outcomeValue,
          sourceClientIp,
          timestamp,
        ) => {
          const entry = buildAuditEntry({
            actorUserId,
            actionType,
            affectedResourceId,
            outcome: outcomeValue,
            sourceClientIp,
            timestamp,
          });

          // No placeholder substitution: each field equals the supplied value.
          expect(entry.actorUserId).toBe(actorUserId);
          expect(entry.actionType).toBe(actionType);
          expect(entry.affectedResourceId).toBe(affectedResourceId);
          expect(entry.outcome).toBe(outcomeValue);
          expect(entry.sourceClientIp).toBe(sourceClientIp);

          // Timestamp is a valid UTC ISO-8601 string representing the supplied
          // instant.
          expect(entry.timestamp).toBe(timestamp.toISOString());
          expect(entry.timestamp.endsWith('Z')).toBe(true);
          expect(Number.isNaN(new Date(entry.timestamp).getTime())).toBe(false);
          expect(new Date(entry.timestamp).getTime()).toBe(timestamp.getTime());
        },
      ),
      { numRuns: 100 },
    );
  });
});
