// =============================================================================
// mno-presets.ts — Mobile Network Operator Preset Configurations
// =============================================================================
// Shared carrier presets used by both Custom SIM Profiles and APN Management.
// Selecting a preset pre-fills APN, TTL, and HL fields.
// CID is NOT included — it is auto-detected via QMAP/CGPADDR cross-reference.
// Fields remain editable — the user can override any pre-filled value.
//
// To add a new carrier: append an entry to MNO_PRESETS below.
// The "Custom" option is always appended automatically by the form.
// =============================================================================

export interface MnoPreset {
  /** Unique key for this preset (used as Select value) */
  id: string;
  /** Display name in the dropdown */
  label: string;
  /** APN name to pre-fill */
  apn_name: string;
  /** IPv4 TTL value (0-255, 0 = don't change) */
  ttl: number;
  /** IPv6 Hop Limit value (0-255, 0 = don't change) */
  hl: number;
}

/**
 * Carrier preset list.
 * Add new carriers here — both Custom SIM Profiles and APN Management
 * dropdowns will automatically pick them up.
 */
export const MNO_PRESETS: MnoPreset[] = [
  {
    id: "smart",
    label: "Smart",
    apn_name: "SMARTLTE",
    ttl: 64,
    hl: 64,
  },
  {
    id: "dito",
    label: "DITO",
    apn_name: "internet.dito.ph",
    ttl: 0,
    hl: 0,
  },
  {
    id: "gomo",
    label: "GOMO",
    apn_name: "gomo.ph",
    ttl: 0,
    hl: 0,
  },
  {
    id: "globe",
    label: "Globe",
    apn_name: "internet.globe.com.ph",
    ttl: 0,
    hl: 0,
  },
  {
    id: "vzw",
    label: "Verizon",
    apn_name: "vzwinternet",
    ttl: 64,
    hl: 64,
  },
  {
    id: "att_5g_phone",
    label: "AT&T 5G Phone",
    apn_name: "enhancedphone",
    ttl: 0,
    hl: 0,
  },
  {
    id: "tmo_home",
    label: "T-Mobile Home Internet",
    apn_name: "fbb.home",
    ttl: 0,
    hl: 0,
  },
];

/**
 * Special value for the "Custom" option in the MNO dropdown.
 * When selected, all pre-filled fields are cleared for manual entry.
 */
export const MNO_CUSTOM_ID = "custom";

/**
 * Look up a preset by ID. Returns undefined if not found or if "custom".
 */
export function getMnoPreset(id: string): MnoPreset | undefined {
  if (id === MNO_CUSTOM_ID) return undefined;
  return MNO_PRESETS.find((p) => p.id === id);
}
