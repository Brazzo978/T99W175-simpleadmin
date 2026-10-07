/** A named AT command preset shown in the Commands popover. */
export interface ATCommandPreset {
  label: string;
  command: string;
}

/**
 * T99W175 (Foxconn) commands used elsewhere in SimpleAdmin; the queries are
 * read-only, the last three change the radio state.
 */
export const DEFAULT_AT_COMMANDS: ATCommandPreset[] = [
  { label: "Modem identity", command: "ATI" },
  { label: "IMEI", command: "AT+CGSN" },
  { label: "IMSI", command: "AT+CIMI" },
  { label: "ICCID", command: "AT+ICCID" },
  { label: "SIM status", command: "AT+CPIN?" },
  { label: "Active SIM slot", command: "AT^SWITCH_SLOT?" },
  { label: "Operator", command: "AT+COPS?" },
  { label: "Signal quality", command: "AT+CSQ" },
  { label: "Carrier aggregation", command: "AT^CA_INFO?" },
  { label: "Network mode", command: "AT^SLMODE?" },
  { label: "5G mode (NSA/SA)", command: "AT^NR5G_MODE?" },
  { label: "Band preferences", command: "AT^BAND_PREF_EXT?" },
  { label: "LTE cell lock", command: "AT^LTE_LOCK?" },
  { label: "5G cell lock", command: "AT^NR5G_LOCK?" },
  { label: "APN profiles", command: "AT+CGDCONT?" },
  { label: "Data connection", command: "AT+CGCONTRDP=1" },
  { label: "Radio off", command: "AT+CFUN=0" },
  { label: "Radio on", command: "AT+CFUN=1" },
  { label: "Reboot", command: "AT+CFUN=1,1" },
];
