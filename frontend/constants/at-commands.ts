/** A named AT command preset shown in the Commands popover. */
export interface ATCommandPreset {
  label: string;
  command: string;
}

/**
 * Default AT command presets loaded from the original `/etc/config/atcommands.user`.
 * Covers modem control (CFUN), network mode (QNWPREFCFG), SIM slots (QUIMSLOT),
 * APN management (CGDCONT), band queries, and IP passthrough (QMAP).
 */
export const DEFAULT_AT_COMMANDS: ATCommandPreset[] = [
  { label: "Reboot", command: "AT+CFUN=1,1" },
  { label: "Disconnect", command: "AT+CFUN=0" },
  { label: "Connect", command: "AT+CFUN=1" },
  { label: "Signal Info", command: 'AT+QENG="servingcell"' },
  { label: "CA Info", command: "AT+QCAINFO" },
  { label: "Get current SIM Slot", command: "AT+QUIMSLOT?" },
  { label: "Switch to SIM Slot 1", command: "AT+QUIMSLOT=1" },
  { label: "Switch to SIM Slot 2", command: "AT+QUIMSLOT=2" },
  { label: "Get current APN List", command: "AT+CGDCONT?" },
  { label: "Set APN to NRBROADBAND", command: 'AT+CGDCONT=1,"IPV4V6","NRBROADBAND"' },
  { label: "Show Current IMEI", command: "AT+EGMR=0,7" },
  { label: "Show Current Network Mode", command: 'AT+QNWPREFCFG="mode_pref"' },
  { label: "Set Network Mode to AUTO", command: 'AT+QNWPREFCFG="mode_pref",AUTO' },
  { label: "Set Network Mode to 5G NR/4G LTE Only", command: 'AT+QNWPREFCFG="mode_pref",NR5G:LTE' },
  { label: "Set Network Mode to 5G NR Only", command: 'AT+QNWPREFCFG="mode_pref",NR5G' },
  { label: "Set Network Mode to 4G LTE Only", command: 'AT+QNWPREFCFG="mode_pref",LTE' },
  { label: "Check SA/NSA disable status", command: 'AT+QNWPREFCFG="nr5g_disable_mode"' },
  { label: "Enable Both SA and NSA", command: 'AT+QNWPREFCFG="nr5g_disable_mode",0' },
  { label: "Disable SA Only", command: 'AT+QNWPREFCFG="nr5g_disable_mode",1' },
  { label: "Disable NSA Only", command: 'AT+QNWPREFCFG="nr5g_disable_mode",2' },
  { label: "Get Enabled 5G NR SA Bands", command: 'AT+QNWPREFCFG="nr5g_band"' },
  { label: "Get Enabled 5G NR NSA Bands", command: 'AT+QNWPREFCFG="nsa_nr5g_band"' },
  { label: "Get Enabled 4G LTE Bands", command: 'AT+QNWPREFCFG="lte_band"' },
  { label: "View assigned IP addresses", command: 'AT+QMAP="WWAN"' },
  { label: "Enable IPPT (MAC passthrough)", command: 'AT+QMAP="MPDN_rule",0,1,0,1,1,"FF:FF:FF:FF:FF:FF"' },
  { label: "Disable IPPT", command: 'AT+QMAP="MPDN_rule",0' },
];
