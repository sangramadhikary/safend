/**
 * Generate a standardized Post Code based on location data.
 * 
 * Format: {serial}-{2-letter state abbreviation}-{2-letter city abbreviation}-{last 3 digits of pincode}
 * Example: 01-OD-CU-011
 * 
 * @param serial - Sequential number (1-based), will be zero-padded to 2 digits
 * @param state - Full state name or abbreviation (first 2 uppercase letters used)
 * @param city - City name (first 2 uppercase letters used)
 * @param pincode - PIN code (last 3 digits used)
 * @returns Formatted post code string
 */
export function generatePostCode(
  serial: number,
  state?: string,
  city?: string,
  pincode?: string
): string {
  // Serial: zero-padded to 2 digits
  const serialStr = String(serial).padStart(2, '0');

  // State: first 2 characters, uppercase. Fallback to 'XX' if missing.
  const stateCode = state && state.trim().length >= 2
    ? state.trim().substring(0, 2).toUpperCase()
    : 'XX';

  // City: first 2 characters, uppercase. Fallback to 'XX' if missing.
  const cityCode = city && city.trim().length >= 2
    ? city.trim().substring(0, 2).toUpperCase()
    : 'XX';

  // Pincode: last 3 digits. Fallback to '000' if missing or too short.
  const pincodeStr = pincode ? pincode.trim().replace(/\D/g, '') : '';
  const pincodeCode = pincodeStr.length >= 3
    ? pincodeStr.slice(-3)
    : pincodeStr.padStart(3, '0');

  return `${serialStr}-${stateCode}-${cityCode}-${pincodeCode}`;
}

/**
 * Indian state abbreviations mapping (common states).
 * Used to derive better 2-letter codes from full state names.
 */
export const STATE_ABBREVIATIONS: Record<string, string> = {
  'andhra pradesh': 'AP',
  'arunachal pradesh': 'AR',
  'assam': 'AS',
  'bihar': 'BR',
  'chhattisgarh': 'CG',
  'goa': 'GA',
  'gujarat': 'GJ',
  'haryana': 'HR',
  'himachal pradesh': 'HP',
  'jharkhand': 'JH',
  'karnataka': 'KA',
  'kerala': 'KL',
  'madhya pradesh': 'MP',
  'maharashtra': 'MH',
  'manipur': 'MN',
  'meghalaya': 'ML',
  'mizoram': 'MZ',
  'nagaland': 'NL',
  'odisha': 'OD',
  'punjab': 'PB',
  'rajasthan': 'RJ',
  'sikkim': 'SK',
  'tamil nadu': 'TN',
  'telangana': 'TS',
  'tripura': 'TR',
  'uttar pradesh': 'UP',
  'uttarakhand': 'UK',
  'west bengal': 'WB',
  'delhi': 'DL',
  'new delhi': 'DL',
  'jammu and kashmir': 'JK',
  'ladakh': 'LA',
  'chandigarh': 'CH',
  'puducherry': 'PY',
  'andaman and nicobar islands': 'AN',
  'dadra and nagar haveli and daman and diu': 'DD',
  'lakshadweep': 'LD',
};

/**
 * Get the 2-letter state abbreviation from a state name.
 * Checks the known abbreviations map first, falls back to first 2 characters.
 */
export function getStateAbbreviation(state?: string): string {
  if (!state || state.trim().length < 2) return 'XX';
  const normalized = state.trim().toLowerCase();
  
  // Check known abbreviations
  if (STATE_ABBREVIATIONS[normalized]) {
    return STATE_ABBREVIATIONS[normalized];
  }
  
  // If it's already 2 chars (user passed abbreviation), use as-is
  if (state.trim().length === 2) {
    return state.trim().toUpperCase();
  }
  
  // Fallback: first 2 uppercase letters
  return state.trim().substring(0, 2).toUpperCase();
}

/**
 * Get the 2-letter city abbreviation (first 2 uppercase characters).
 */
export function getCityAbbreviation(city?: string): string {
  if (!city || city.trim().length < 2) return 'XX';
  return city.trim().substring(0, 2).toUpperCase();
}

/**
 * Generate a post code using full location context with proper state abbreviation lookup.
 * 
 * @param serial - Sequential number (1-based)
 * @param location - Object with city, state, pincode fields
 * @returns Formatted post code string (e.g., "01-OD-CU-011")
 */
export function generatePostCodeFromLocation(
  serial: number,
  location?: { city?: string; state?: string; pincode?: string }
): string {
  const serialStr = String(serial).padStart(2, '0');
  const stateCode = getStateAbbreviation(location?.state);
  const cityCode = getCityAbbreviation(location?.city);
  
  const pincodeStr = location?.pincode ? location.pincode.trim().replace(/\D/g, '') : '';
  const pincodeCode = pincodeStr.length >= 3
    ? pincodeStr.slice(-3)
    : pincodeStr.padStart(3, '0');

  return `${serialStr}-${stateCode}-${cityCode}-${pincodeCode}`;
}
