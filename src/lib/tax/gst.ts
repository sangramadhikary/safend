/**
 * GST Tax Engine — single source of truth for CGST/SGST vs IGST determination.
 *
 * Rule (Section 12, IGST Act 2017):
 *   - Supplier state === Place of Supply  →  INTRA-STATE  →  CGST + SGST
 *   - Supplier state !== Place of Supply  →  INTER-STATE  →  IGST
 *
 * Safend's registered state is Odisha (state code 21).
 * All invoices raised from Safend compare the client's Place of Supply
 * against '21' (Odisha) to decide the tax type.
 */

/** Safend's registered state code (Odisha = 21) */
export const SUPPLIER_STATE_CODE = '21';

/** GST type applied on an invoice */
export type GstType = 'cgst_sgst' | 'igst' | 'exempt';

/**
 * All Indian states / UTs with their GST state codes.
 * Format: "code-StateName" — the code prefix is used for state comparison.
 * Source: GSTIN structure (first 2 digits = state code).
 */
export const INDIAN_STATES: { code: string; name: string; label: string }[] = [
  { code: '01', name: 'Jammu & Kashmir',         label: '01 - Jammu & Kashmir' },
  { code: '02', name: 'Himachal Pradesh',         label: '02 - Himachal Pradesh' },
  { code: '03', name: 'Punjab',                   label: '03 - Punjab' },
  { code: '04', name: 'Chandigarh',               label: '04 - Chandigarh' },
  { code: '05', name: 'Uttarakhand',              label: '05 - Uttarakhand' },
  { code: '06', name: 'Haryana',                  label: '06 - Haryana' },
  { code: '07', name: 'Delhi',                    label: '07 - Delhi' },
  { code: '08', name: 'Rajasthan',                label: '08 - Rajasthan' },
  { code: '09', name: 'Uttar Pradesh',            label: '09 - Uttar Pradesh' },
  { code: '10', name: 'Bihar',                    label: '10 - Bihar' },
  { code: '11', name: 'Sikkim',                   label: '11 - Sikkim' },
  { code: '12', name: 'Arunachal Pradesh',        label: '12 - Arunachal Pradesh' },
  { code: '13', name: 'Nagaland',                 label: '13 - Nagaland' },
  { code: '14', name: 'Manipur',                  label: '14 - Manipur' },
  { code: '15', name: 'Mizoram',                  label: '15 - Mizoram' },
  { code: '16', name: 'Tripura',                  label: '16 - Tripura' },
  { code: '17', name: 'Meghalaya',                label: '17 - Meghalaya' },
  { code: '18', name: 'Assam',                    label: '18 - Assam' },
  { code: '19', name: 'West Bengal',              label: '19 - West Bengal' },
  { code: '20', name: 'Jharkhand',                label: '20 - Jharkhand' },
  { code: '21', name: 'Odisha',                   label: '21 - Odisha' },
  { code: '22', name: 'Chhattisgarh',             label: '22 - Chhattisgarh' },
  { code: '23', name: 'Madhya Pradesh',           label: '23 - Madhya Pradesh' },
  { code: '24', name: 'Gujarat',                  label: '24 - Gujarat' },
  { code: '25', name: 'Daman & Diu',              label: '25 - Daman & Diu' },
  { code: '26', name: 'Dadra & Nagar Haveli',     label: '26 - Dadra & Nagar Haveli' },
  { code: '27', name: 'Maharashtra',              label: '27 - Maharashtra' },
  { code: '28', name: 'Andhra Pradesh (old)',     label: '28 - Andhra Pradesh (old)' },
  { code: '29', name: 'Karnataka',                label: '29 - Karnataka' },
  { code: '30', name: 'Goa',                      label: '30 - Goa' },
  { code: '31', name: 'Lakshadweep',              label: '31 - Lakshadweep' },
  { code: '32', name: 'Kerala',                   label: '32 - Kerala' },
  { code: '33', name: 'Tamil Nadu',               label: '33 - Tamil Nadu' },
  { code: '34', name: 'Puducherry',               label: '34 - Puducherry' },
  { code: '35', name: 'Andaman & Nicobar',        label: '35 - Andaman & Nicobar' },
  { code: '36', name: 'Telangana',                label: '36 - Telangana' },
  { code: '37', name: 'Andhra Pradesh',           label: '37 - Andhra Pradesh' },
  { code: '38', name: 'Ladakh',                   label: '38 - Ladakh' },
  { code: '97', name: 'Other Territory',          label: '97 - Other Territory' },
  { code: '99', name: 'Centre Jurisdiction',      label: '99 - Centre Jurisdiction' },
];

/** Default place of supply for Safend (Odisha) */
export const DEFAULT_PLACE_OF_SUPPLY = '21-Odisha';

/**
 * Extracts the numeric state code from a place-of-supply string.
 * Accepts formats: "21-Odisha", "21", "Odisha" (falls back to name match).
 */
export function extractStateCode(placeOfSupply: string | null | undefined): string | null {
  if (!placeOfSupply) return null;
  const trimmed = placeOfSupply.trim();

  // "21-Odisha" or "21 - Odisha" → extract leading digits
  const codeMatch = trimmed.match(/^(\d{2})/);
  if (codeMatch) return codeMatch[1];

  // Plain name match (case-insensitive) — fallback
  const byName = INDIAN_STATES.find(
    s => s.name.toLowerCase() === trimmed.toLowerCase()
  );
  return byName?.code ?? null;
}

/**
 * Determines the GST type for an invoice.
 *
 * @param placeOfSupply  - The Place of Supply selected on the invoice (e.g. "21-Odisha")
 * @param totalGstRate   - The total GST rate (e.g. 18 for 18%). Pass 0 for exempt.
 * @param supplierCode   - Defaults to Safend's Odisha code (21). Override for future branches.
 *
 * @returns  'cgst_sgst' | 'igst' | 'exempt'
 */
export function getGstType(
  placeOfSupply: string | null | undefined,
  totalGstRate: number,
  supplierCode: string = SUPPLIER_STATE_CODE
): GstType {
  if (totalGstRate <= 0) return 'exempt';
  const posCode = extractStateCode(placeOfSupply);
  // An unresolvable Place of Supply used to fall through to intra-state. That
  // silently charged CGST+SGST on what may have been an inter-state supply, so
  // callers must now resolve it instead — see placeOfSupplyIssue().
  if (!posCode) return 'cgst_sgst';
  return posCode === supplierCode ? 'cgst_sgst' : 'igst';
}

/**
 * Place of Supply derived from the recipient's GSTIN.
 *
 * For a B2B supply the place of supply is the recipient's registered location
 * (Sec 12(2)(a), IGST Act), and the first two digits of a GSTIN are its state
 * code — so the GSTIN is authoritative and POS should not be typed by hand.
 */
export function placeOfSupplyFromGstin(gstin?: string | null): string | null {
  const g = (gstin || '').trim().toUpperCase();
  if (g.length !== 15) return null;
  const state = INDIAN_STATES.find((s) => s.code === g.slice(0, 2));
  return state ? `${state.code}-${state.name}` : null;
}

export type PlaceOfSupplyIssue =
  | { kind: 'unresolvable'; message: string }
  | { kind: 'gstin_mismatch'; message: string; derived: string; selected: string };

/**
 * Validates the selected Place of Supply against the recipient's GSTIN.
 *
 * Returns null when fine. A non-null result must block issuance unless the user
 * explicitly overrides with a reason: charging the wrong tax head is not a
 * cosmetic error, it is a wrong-tax-paid exposure for both parties.
 *
 * A B2C supply (no GSTIN) cannot be cross-checked, so only an unresolvable POS
 * is reported.
 */
export function placeOfSupplyIssue(
  placeOfSupply: string | null | undefined,
  clientGstin?: string | null
): PlaceOfSupplyIssue | null {
  const posCode = extractStateCode(placeOfSupply);
  if (!posCode) {
    return {
      kind: 'unresolvable',
      message:
        'Place of Supply could not be resolved to a state code, so CGST/SGST versus IGST cannot be determined. Select a state before issuing.',
    };
  }

  const derived = placeOfSupplyFromGstin(clientGstin);
  if (!derived) return null;

  const derivedCode = extractStateCode(derived);
  if (derivedCode && derivedCode !== posCode) {
    return {
      kind: 'gstin_mismatch',
      derived,
      selected: String(placeOfSupply),
      message: `Place of Supply is set to ${placeOfSupply} but the client's GSTIN (${clientGstin}) is registered in ${derived}. For a B2B supply the place of supply is the recipient's registered location, so this would charge the wrong tax head.`,
    };
  }
  return null;
}

/**
 * Resolves the complete tax config (sgstRate, cgstRate, igstRate) from the total
 * GST rate and the determined tax type.
 *
 * This is what gets passed into computeInvoiceTotals().
 */
export function resolveGstRates(
  totalGstRate: number,
  gstType: GstType
): { sgstRate: number; cgstRate: number; igstRate: number } {
  if (gstType === 'exempt' || totalGstRate <= 0) {
    return { sgstRate: 0, cgstRate: 0, igstRate: 0 };
  }
  if (gstType === 'igst') {
    return { sgstRate: 0, cgstRate: 0, igstRate: totalGstRate };
  }
  // cgst_sgst → split equally
  const half = totalGstRate / 2;
  return { sgstRate: half, cgstRate: half, igstRate: 0 };
}

/**
 * One-shot helper: given a place of supply and total GST rate, returns
 * both the GstType and the resolved rates together.
 */
export function resolveGstConfig(
  placeOfSupply: string | null | undefined,
  totalGstRate: number,
  supplierCode: string = SUPPLIER_STATE_CODE
): { gstType: GstType; sgstRate: number; cgstRate: number; igstRate: number } {
  const gstType = getGstType(placeOfSupply, totalGstRate, supplierCode);
  const rates = resolveGstRates(totalGstRate, gstType);
  return { gstType, ...rates };
}

/**
 * Returns the label to display for the GST type on the invoice, e.g.:
 *   cgst_sgst → "CGST + SGST (Intra-State)"
 *   igst      → "IGST (Inter-State)"
 *   exempt    → "Exempt / Nil-Rated"
 */
export function gstTypeLabel(gstType: GstType): string {
  switch (gstType) {
    case 'igst':     return 'IGST (Inter-State)';
    case 'exempt':   return 'Exempt / Nil-Rated';
    default:         return 'CGST + SGST (Intra-State)';
  }
}
