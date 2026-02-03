# Necessary data fields for GUI parsing

This list names the **exact data fields** the frontend currently parses.
Use it to attach sample AT responses for each field when adapting to other
Quectel modems.

---

## Dashboard / status (index page)
- SIM status/state (`+CPIN:` → READY / SIM PIN / SIM PUK)
- Active SIM slot (from `^SWITCH_SLOT?` → slot ENABLE line)
- Temperatures (from `^TEMP?`):
  - TSENS
  - PA temperature
  - Skin sensor temperature
- Network provider name (from `+COPS:`)
- MCC/MNC (from `mcc:` / `mnc:` in `^DEBUG?`)
- APN name (from `+CGCONTRDP:`)
- IP addresses (from `+CGCONTRDP:`): IPv4 + IPv6
- RAT / network mode (from `RAT:` in `^DEBUG?`)
- LTE bands (from `lte_band:`)
- NR bands (from `nr_band:`)
- Bandwidths (from `lte_band_width:` / `nr_band_width:`)
- Channel numbers (from `channel:` and `nr_channel:`)
- PCI values (from `pci:` and `nr_pci:`)
- Cell IDs (from `lte_cell_id`, `nr_cell_id`)
- TACs (from `lte_tac`, `nr_tac`)
- Signal metrics (from `^DEBUG?` + `+CSQ` fallback):
  - RSRP / RSRQ / RSSI / SNR/SINR
- Antenna data (from `^DEBUG?`):
  - Per-antenna RSRP values
  - RX diversity bitmask
- SIM + device identifiers (from the combined bundle):
  - IMSI (`AT+CIMI`)
  - ICCID (`AT+ICCID`)
  - Phone number (`+CNUM`)
  - IMEI (`AT+CGSN`)
  - Manufacturer (`AT+CGMI`)
  - Model (`AT+CGMM`)
  - Firmware version (`^VERSION?`)

## Device info page
- Manufacturer (`AT+CGMI`)
- Model (`AT+CGMM`)
- Firmware version (`^VERSION?`)
- IMSI (`AT+CIMI`)
- ICCID (`AT+ICCID`)
- IMEI (`AT+CGSN`)
- Phone number (`+CNUM`)
- WWAN IPv4/IPv6 (from `+CGCONTRDP:`)
- LAN IP (from `/cgi-bin/get_lanip` response)

## Radio settings
- APN profiles (from `+CGDCONT:`): CID, PDP type, APN
- Active APN + IP addresses (from `+CGCONTRDP:`)
- Network mode (parsed from `^SLMODE?`)
- SIM slot selection (from `^SWITCH_SLOT?`)
- Band preferences + lock state (from `^BAND_PREF_EXT?`)
- CA info (from `^CA_INFO?`, if available)
- LTE lock state (from `^LTE_LOCK?`)
- NR5G lock state (from `^NR5G_LOCK?`)
- NR5G mode (from `^NR5G_MODE?`)

## SMS
- Storage status (from `+CPMS:`): memory type, used slots, total slots
- Service center number (from `+CSCA:`)
- Message list (from `+CMGL:`):
  - Index
  - Status
  - Sender number
  - Timestamp
  - Content (UCS-2 decoded)
  - Multipart metadata (reference, total parts, part index when present)

## SIM unlock / PIN control
- PIN status (`+CPIN:`)
- PIN unlock result (OK/ERROR)
- SIM PIN lock toggle response (`+CLCK:`)

## Factory reset + maintenance flows
- Band/cell lock clear success (OK/ERROR from `AT^BAND_PREF_EXT`,
  `AT^LTE_LOCK`, `AT^NR5G_LOCK`)
- Mode resets and reboot responses (`AT^SLMODE=1,0`, `AT^NR5G_MODE=0`,
  `AT+CFUN=1,1`)
