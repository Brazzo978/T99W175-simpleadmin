// =============================================================================
// imei-utils.ts — IMEI Luhn Algorithm Utilities
// =============================================================================
// Pure utilities for IMEI generation and validation.
// IMEI structure (15 digits):
//   Positions 1-8:  TAC  (Type Allocation Code)
//   Positions 9-14: SNR  (Serial Number)
//   Position 15:    Check digit (Luhn)
// =============================================================================

/**
 * Calculates the Luhn check digit for a 14-digit string.
 *
 * Algorithm (per ISO/IEC 7812 / GSMA IMEI Allocation Guidelines):
 *   1. From the leftmost digit, double every 2nd digit (positions 2,4,6,...,14)
 *   2. If doubled value > 9, subtract 9
 *   3. Sum all 14 resulting digits
 *   4. Check digit = (10 - sum % 10) % 10
 */
export function calculateCheckDigit(digits14: string): number {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    let d = parseInt(digits14[i], 10);
    // Double every 2nd position (0-indexed: 1, 3, 5, 7, 9, 11, 13)
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return (10 - (sum % 10)) % 10;
}

/**
 * Validates a complete 15-digit IMEI using the Luhn algorithm.
 * Returns true if the number is exactly 15 digits and the Luhn sum is
 * divisible by 10.
 */
export function validateImei(imei: string): boolean {
  if (!/^\d{15}$/.test(imei)) return false;
  let sum = 0;
  for (let i = 0; i < 15; i++) {
    let d = parseInt(imei[i], 10);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

/**
 * Generates a valid 15-digit IMEI from a prefix (8–12 digits).
 * Fills remaining positions up to digit 14 with random digits, then appends
 * the Luhn check digit as position 15.
 */
export function generateImei(prefix: string): string {
  if (!/^\d{8,12}$/.test(prefix)) {
    throw new Error("Prefix must be 8–12 digits");
  }
  let digits14 = prefix;
  while (digits14.length < 14) {
    digits14 += Math.floor(Math.random() * 10).toString();
  }
  return digits14 + calculateCheckDigit(digits14).toString();
}

export interface ImeiBreakdown {
  /** Type Allocation Code — digits 1-8 */
  tac: string;
  /** Serial Number — digits 9-14 */
  snr: string;
  /** Luhn check digit — digit 15 */
  checkDigit: string;
}

/**
 * Parses the structural components of a 15-digit IMEI.
 * Returns null if the input is not exactly 15 digits.
 */
export function parseImeiBreakdown(imei: string): ImeiBreakdown | null {
  if (!/^\d{15}$/.test(imei)) return null;
  return {
    tac: imei.slice(0, 8),
    snr: imei.slice(8, 14),
    checkDigit: imei.slice(14),
  };
}
