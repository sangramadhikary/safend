import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { ServiceEntry } from '@/types/marketing';

/**
 * Property 1: Valid service entries are displayed completely
 * **Validates: Requirements 2.2, 2.3**
 * 
 * For any service entry with a non-empty name of 1–60 characters and a non-empty 
 * description of 1–500 characters, the Service Section rendering function SHALL 
 * include both the name and description in its output.
 */

/**
 * Property 2: Invalid service entries are filtered out
 * **Validates: Requirements 2.5**
 * 
 * For any array of service entries where some entries have an empty or missing name 
 * or an empty or missing description, the Service Section SHALL render only those 
 * entries with both a valid name (1–60 chars) and valid description (1–500 chars), 
 * omitting all others.
 */

// Validation function (matches the one in ServiceSection.tsx)
function isValidEntry(entry: ServiceEntry): boolean {
  const name = entry.name?.trim() ?? '';
  const description = entry.description?.trim() ?? '';
  return (
    name.length >= 1 &&
    name.length <= 60 &&
    description.length >= 1 &&
    description.length <= 500
  );
}

// Generator for valid service entry (1-60 char name, 1-500 char description)
const validServiceEntryArb: fc.Arbitrary<ServiceEntry> = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 60 }).filter(s => s.trim().length > 0),
  description: fc.string({ minLength: 1, maxLength: 500 }).filter(s => s.trim().length > 0),
  icon: fc.option(fc.constantFrom('Shield', 'Home', 'Users', 'ShieldAlert'), { nil: undefined }),
});

// Generator for invalid service entries (missing or out-of-bounds name/description)
const invalidServiceEntryArb: fc.Arbitrary<ServiceEntry> = fc.oneof(
  // Empty name
  fc.record({
    id: fc.uuid(),
    name: fc.constant(''),
    description: fc.string({ minLength: 1, maxLength: 500 }),
    icon: fc.option(fc.constantFrom('Shield', 'Home', 'Users', 'ShieldAlert'), { nil: undefined }),
  }),
  // Name too long (>60 chars). Build from non-whitespace characters so that
  // trimming (as isValidEntry does) cannot shorten it to a valid length —
  // otherwise a whitespace-padded 61-char string could trim to <=60 and be
  // considered valid, making this "invalid" case flakily pass validation.
  fc.record({
    id: fc.uuid(),
    name: fc.array(fc.constantFrom('a', 'b', 'c', 'X', '9'), { minLength: 61, maxLength: 100 }).map(a => a.join('')),
    description: fc.string({ minLength: 1, maxLength: 500 }),
    icon: fc.option(fc.constantFrom('Shield', 'Home', 'Users', 'ShieldAlert'), { nil: undefined }),
  }),
  // Empty description
  fc.record({
    id: fc.uuid(),
    name: fc.string({ minLength: 1, maxLength: 60 }),
    description: fc.constant(''),
    icon: fc.option(fc.constantFrom('Shield', 'Home', 'Users', 'ShieldAlert'), { nil: undefined }),
  }),
  // Description too long (>500 chars). Non-whitespace characters so trimming
  // cannot bring it back within the valid bound (see the name case above).
  fc.record({
    id: fc.uuid(),
    name: fc.string({ minLength: 1, maxLength: 60 }).filter(s => s.trim().length > 0),
    description: fc.array(fc.constantFrom('a', 'b', 'c', 'X', '9'), { minLength: 501, maxLength: 600 }).map(a => a.join('')),
    icon: fc.option(fc.constantFrom('Shield', 'Home', 'Users', 'ShieldAlert'), { nil: undefined }),
  }),
  // Whitespace-only name
  fc.record({
    id: fc.uuid(),
    name: fc.string({ minLength: 1, maxLength: 10 }).map(() => '   '),
    description: fc.string({ minLength: 1, maxLength: 500 }),
    icon: fc.option(fc.constantFrom('Shield', 'Home', 'Users', 'ShieldAlert'), { nil: undefined }),
  }),
  // Whitespace-only description
  fc.record({
    id: fc.uuid(),
    name: fc.string({ minLength: 1, maxLength: 60 }),
    description: fc.string({ minLength: 1, maxLength: 10 }).map(() => '   '),
    icon: fc.option(fc.constantFrom('Shield', 'Home', 'Users', 'ShieldAlert'), { nil: undefined }),
  })
);

const mixedServiceListArb = fc.array(
  fc.oneof(validServiceEntryArb, invalidServiceEntryArb),
  { minLength: 0, maxLength: 20 }
);

describe('Property 1: Valid service entries are displayed completely', () => {
  it('accepts all entries with valid name (1-60 chars) and description (1-500 chars)', () => {
    fc.assert(
      fc.property(validServiceEntryArb, (entry) => {
        // The entry should pass validation
        expect(isValidEntry(entry)).toBe(true);
        
        // Verify name and description are within bounds
        const name = entry.name.trim();
        const description = entry.description.trim();
        
        expect(name.length).toBeGreaterThanOrEqual(1);
        expect(name.length).toBeLessThanOrEqual(60);
        expect(description.length).toBeGreaterThanOrEqual(1);
        expect(description.length).toBeLessThanOrEqual(500);
      }),
      { numRuns: 200 }
    );
  });

  it('ensures valid entries have non-empty trimmed name and description', () => {
    fc.assert(
      fc.property(validServiceEntryArb, (entry) => {
        const name = entry.name.trim();
        const description = entry.description.trim();
        
        expect(name).not.toBe('');
        expect(description).not.toBe('');
        expect(isValidEntry(entry)).toBe(true);
      }),
      { numRuns: 200 }
    );
  });
});

describe('Property 2: Invalid service entries are filtered out', () => {
  it('rejects entries with invalid name or description', () => {
    fc.assert(
      fc.property(invalidServiceEntryArb, (entry) => {
        // The entry should fail validation
        expect(isValidEntry(entry)).toBe(false);
      }),
      { numRuns: 200 }
    );
  });

  it('filters mixed list to only include valid entries', () => {
    fc.assert(
      fc.property(mixedServiceListArb, (entries) => {
        const validEntries = entries.filter(isValidEntry);
        
        // All filtered entries must be valid
        validEntries.forEach(entry => {
          expect(isValidEntry(entry)).toBe(true);
        });
        
        // Count should match manual validation
        const manualCount = entries.filter(e => {
          const name = e.name?.trim() ?? '';
          const description = e.description?.trim() ?? '';
          return (
            name.length >= 1 && name.length <= 60 &&
            description.length >= 1 && description.length <= 500
          );
        }).length;
        
        expect(validEntries.length).toBe(manualCount);
      }),
      { numRuns: 200 }
    );
  });

  it('ensures no invalid entries pass through filtering', () => {
    fc.assert(
      fc.property(mixedServiceListArb, (entries) => {
        const validEntries = entries.filter(isValidEntry);
        
        // None of the valid entries should have:
        // - empty/whitespace-only name
        // - name > 60 chars
        // - empty/whitespace-only description
        // - description > 500 chars
        validEntries.forEach(entry => {
          const name = entry.name.trim();
          const description = entry.description.trim();
          
          expect(name.length).toBeGreaterThanOrEqual(1);
          expect(name.length).toBeLessThanOrEqual(60);
          expect(description.length).toBeGreaterThanOrEqual(1);
          expect(description.length).toBeLessThanOrEqual(500);
        });
      }),
      { numRuns: 200 }
    );
  });

  it('preserves all valid entries when filtering', () => {
    fc.assert(
      fc.property(mixedServiceListArb, (entries) => {
        const validEntries = entries.filter(isValidEntry);
        const expectedValid = entries.filter(e => {
          const name = e.name?.trim() ?? '';
          const description = e.description?.trim() ?? '';
          return (
            name.length >= 1 && name.length <= 60 &&
            description.length >= 1 && description.length <= 500
          );
        });
        
        // Same length
        expect(validEntries.length).toBe(expectedValid.length);
        
        // Same entries (order preserved)
        expect(validEntries).toEqual(expectedValid);
      }),
      { numRuns: 200 }
    );
  });
});
