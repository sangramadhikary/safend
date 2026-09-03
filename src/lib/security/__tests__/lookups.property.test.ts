import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { isValidGSTIN, isValidPincode } from '../lookups';

// Feature: security-hardening, Property 13: Lookup-input validators accept only well-formed GSTIN and pincode values

/**
 * GSTIN structure (15 chars): 2-digit state code + 5 PAN letters + 4 PAN digits
 * + 1 PAN entity letter + 1 entity code [1-9A-Z] + fixed 'Z' + 1 check char [0-9A-Z].
 *
 * The validators are pure predicates, so we model "well-formedness" independently
 * via a reference oracle (a regex equivalent to the spec) and assert the validators
 * agree with the oracle across both structured and adversarial inputs.
 */
const GSTIN_ORACLE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
const PINCODE_ORACLE = /^\d{6}$/;

// Generator that builds a syntactically valid GSTIN (uppercase canonical form).
const validGstinArb: fc.Arbitrary<string> = fc
  .tuple(
    fc.string({ unit: fc.constantFrom(...'0123456789'.split('')), minLength: 2, maxLength: 2 }),
    fc.string({ unit: fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')), minLength: 5, maxLength: 5 }),
    fc.string({ unit: fc.constantFrom(...'0123456789'.split('')), minLength: 4, maxLength: 4 }),
    fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')),
    fc.constantFrom(...'123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')),
    fc.constantFrom(...'0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')),
  )
  .map(([state, pan, panDigits, panEntity, entityCode, checkChar]) =>
    `${state}${pan}${panDigits}${panEntity}${entityCode}Z${checkChar}`,
  );

// Generator that builds a valid 6-digit pincode.
const validPincodeArb: fc.Arbitrary<string> = fc.string({
  unit: fc.constantFrom(...'0123456789'.split('')),
  minLength: 6,
  maxLength: 6,
});

describe('Property 13: Lookup-input validators accept only well-formed GSTIN and pincode values', () => {
  it('isValidGSTIN agrees with the 15-char GSTIN pattern over arbitrary strings', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 40 }), (input) => {
        const expected = GSTIN_ORACLE.test(input.toUpperCase());
        expect(isValidGSTIN(input)).toBe(expected);
      }),
      { numRuns: 100 },
    );
  });

  it('isValidGSTIN accepts every syntactically valid GSTIN (case-insensitive)', () => {
    fc.assert(
      fc.property(validGstinArb, fc.boolean(), (gstin, lower) => {
        const candidate = lower ? gstin.toLowerCase() : gstin;
        expect(isValidGSTIN(candidate)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('isValidPincode agrees with the six-digit pattern over arbitrary strings', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 20 }), (input) => {
        const expected = PINCODE_ORACLE.test(input);
        expect(isValidPincode(input)).toBe(expected);
      }),
      { numRuns: 100 },
    );
  });

  it('isValidPincode accepts every six-digit value and rejects other digit lengths', () => {
    fc.assert(
      fc.property(
        fc.string({ unit: fc.constantFrom(...'0123456789'.split('')), minLength: 0, maxLength: 12 }),
        (digits) => {
          expect(isValidPincode(digits)).toBe(digits.length === 6);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('rejects valid pincodes for the GSTIN validator and vice versa (cross-validation)', () => {
    fc.assert(
      fc.property(validPincodeArb, validGstinArb, (pincode, gstin) => {
        // A 6-digit pincode is never a 15-char GSTIN.
        expect(isValidGSTIN(pincode)).toBe(false);
        // A 15-char GSTIN is never a 6-digit pincode.
        expect(isValidPincode(gstin)).toBe(false);
      }),
      { numRuns: 100 },
    );
  });
});
