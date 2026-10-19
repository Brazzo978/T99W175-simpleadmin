/** A named AT command preset shown in the Commands popover. */
export interface ATCommandPreset {
  label: string;
  command: string;
  /** Built-in presets: the label's key in the "terminal" namespace, shown
   *  instead of `label` (custom presets have only the label they were
   *  given) */
  labelKey?: string;
}

/**
 * T99W175 (Foxconn) commands used elsewhere in SimpleAdmin; the queries are
 * read-only, the last three change the radio state.
 */
export const DEFAULT_AT_COMMANDS: ATCommandPreset[] = [
  { label: "Modem identity", labelKey: "presets.identity", command: "ATI" },
  { label: "IMEI", labelKey: "presets.imei", command: "AT+CGSN" },
  { label: "IMSI", labelKey: "presets.imsi", command: "AT+CIMI" },
  { label: "ICCID", labelKey: "presets.iccid", command: "AT+ICCID" },
  { label: "SIM status", labelKey: "presets.sim_status", command: "AT+CPIN?" },
  { label: "Active SIM slot", labelKey: "presets.sim_slot", command: "AT^SWITCH_SLOT?" },
  { label: "Operator", labelKey: "presets.operator", command: "AT+COPS?" },
  { label: "Signal quality", labelKey: "presets.signal_quality", command: "AT+CSQ" },
  { label: "Carrier aggregation", labelKey: "presets.carrier_aggregation", command: "AT^CA_INFO?" },
  { label: "Network mode", labelKey: "presets.network_mode", command: "AT^SLMODE?" },
  { label: "5G mode (NSA/SA)", labelKey: "presets.nr5g_mode", command: "AT^NR5G_MODE?" },
  { label: "Band preferences", labelKey: "presets.band_preferences", command: "AT^BAND_PREF_EXT?" },
  { label: "LTE cell lock", labelKey: "presets.lte_lock", command: "AT^LTE_LOCK?" },
  { label: "5G cell lock", labelKey: "presets.nr5g_lock", command: "AT^NR5G_LOCK?" },
  { label: "APN profiles", labelKey: "presets.apn_profiles", command: "AT+CGDCONT?" },
  { label: "Data connection", labelKey: "presets.data_connection", command: "AT+CGCONTRDP=1" },
  // CFUN=4 keeps the SIM: CFUN=0 loses it until a reboot on this modem.
  { label: "Radio off", labelKey: "presets.radio_off", command: "AT+CFUN=4" },
  { label: "Radio on", labelKey: "presets.radio_on", command: "AT+CFUN=1" },
  { label: "Reboot", labelKey: "presets.reboot", command: "AT+CFUN=1,1" },
];
