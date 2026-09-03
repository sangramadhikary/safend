/**
 * Lookup-input validators (Requirements 10.1, 10.2, 10.3).
 *
 * The external-lookup routes (`gst-lookup`, `pincode-lookup`) proxy outbound
 * requests to fixed upstream hosts. To blunt SSRF and amplification abuse, the
 * caller-supplied identifier must be validated against a strict format before
 * any outbound request is issued. These are pure predicates with no I/O so they
 * can be reused by the routes and verified by property tests.
 */

/**
 * GSTIN format: 2-digit state code + 10-char PAN + 1 entity code + 1 fixed `Z`
 * + 1 check digit, for a total of 15 characters. Mirrors the pattern previously
 * inlined in `app/api/gst-lookup/route.ts`.
 */
const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

/**
 * Indian PIN codes are exactly six digits.
 */
const PINCODE_REGEX = /^\d{6}$/;

/**
 * Validate a GSTIN against the 15-character GSTIN format pattern.
 *
 * The value is upper-cased before matching so that lowercase letters in an
 * otherwise well-formed GSTIN are accepted (matching the existing route
 * behavior).
 *
 * @param gstin - the candidate GSTIN string
 * @returns true iff the value matches the 15-character GSTIN pattern
 */
export function isValidGSTIN(gstin: string): boolean {
  return GSTIN_REGEX.test(gstin.toUpperCase());
}

/**
 * Validate that a pincode is exactly six digits.
 *
 * @param pincode - the candidate pincode string
 * @returns true iff the value is exactly six digits
 */
export function isValidPincode(pincode: string): boolean {
  return PINCODE_REGEX.test(pincode);
}
