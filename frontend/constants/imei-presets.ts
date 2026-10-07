// =============================================================================
// imei-presets.ts — IMEI TAC (Type Allocation Code) Presets
// =============================================================================
// Device presets for the IMEI Generator. Each entry provides an 8-digit TAC
// that seeds the generator. The "Custom" option allows free-form entry.
//
// To add a new device preset: append an entry to IMEI_TAC_PRESETS below.
// =============================================================================

export interface ImeiTacPreset {
  /** Unique key for this preset (used as Select value) */
  id: string;
  /** Display name in the dropdown */
  label: string;
  /** Exactly 8 digits — the Type Allocation Code */
  tac: string;
}

/**
 * Device TAC preset list.
 * Add new devices here — the Generator dropdown picks them up automatically.
 */
export const IMEI_TAC_PRESETS: ImeiTacPreset[] = [
    { id: "iphone_16", label: "Apple iPhone 16", tac: "35995431" },
  { id: "iphone_17_pro", label: "Apple iPhone 17 Pro", tac: "35122243" },
  { id: "ipad_pro_12_9", label: "Apple iPad Pro 12.9-inch", tac: "35286992" },
  { id: "ipad_pro_11", label: "Apple iPad Pro 11-inch", tac: "35164046" },
  { id: "s25_ultra", label: "Samsung Galaxy S25 Ultra", tac: "35069390" },
  { id: "s10_plus", label: "Samsung Galaxy Tab S10 Plus", tac: "35015886" },
  { id: "pixel_10_pro", label: "Google Pixel 10 Pro", tac: "35744080" },
];

/** Sentinel value for the custom prefix option in the Select dropdown */
export const IMEI_CUSTOM_ID = "custom";

/** Look up a preset by ID. Returns undefined for IMEI_CUSTOM_ID or unknown IDs. */
export function getImeiTacPreset(id: string): ImeiTacPreset | undefined {
  return IMEI_TAC_PRESETS.find((p) => p.id === id);
}
