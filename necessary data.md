# Necessary data fields for GUI parsing

This list summarizes the **data points the frontend expects to parse** from AT command responses.
It is grouped by screen/module so you can attach example payloads later.

## Dashboard / status (index page)
- SIM status/state (READY, PIN, PUK) from `+CPIN:`
- Active SIM slot (1/2/unknown) from `^SWITCH_SLOT?`
- Temperatures from `^TEMP?`:
  - TSENS (baseband temp)
  - PA temperature
  - Skin sensor temperature
- Network provider/operator name from `+COPS:`
- MCC/MNC (combined `mcc:`/`mnc:`) from `^DEBUG?`
- APN name from `+CGCONTRDP:`
- IP addresses from `+CGCONTRDP:`
  - IPv4
  - IPv6
- Network mode / RAT (`RAT:`) from `^DEBUG?`
- LTE bands + NR bands from `^DEBUG?`
- Bandwidths (LTE + NR) from `^DEBUG?`
- Channel numbers (LTE `channel:` and NR `nr_channel:`)
- PCI values (LTE `pci:` and NR `nr_pci:`)
- Cell IDs (LTE `lte_cell_id`, NR `nr_cell_id`) and TACs
- Signal metrics:
  - RSRP/RSRQ/RSSI/SINR/SNR for LTE/NR
  - CSQ (RSSI/BER) fallback
- Antenna data:
  - LTE/NR per-antenna RSRP values
  - RX diversity bitmask
- SIM identifiers and device identity (from the combined command set):
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
- WWAN IPv4/IPv6 (`+CGCONTRDP:`)
- LAN IP (from `/cgi-bin/get_lanip` response)

## Radio settings
- APN profiles (CID, PDP type, APN) from `+CGDCONT:`
- Active APN + IP addresses from `+CGCONTRDP:`
- Current network mode (parsed from `^SLMODE?`)
- SIM slot selection (from `^SWITCH_SLOT?`)
- Band preferences + lock state from `^BAND_PREF_EXT?`
- CA info (from `^CA_INFO?`, if available)
- LTE lock state (from `^LTE_LOCK?`)
- NR5G lock state (from `^NR5G_LOCK?`)
- NR5G mode (from `^NR5G_MODE?`)

## SMS
- Storage status (memory type, used slots, total slots) from `+CPMS:`
- Service center number from `+CSCA:`
- Message list from `+CMGL:`
  - Index
  - Status
  - Sender number
  - Timestamp (date + time)
  - Message content (UCS-2 decoded)
  - Multipart metadata (reference, total parts, part index when present)

## SIM unlock / PIN control
- PIN status (`+CPIN:`)
- PIN unlock results (success/error)
- SIM PIN lock toggle response (`+CLCK:`)

## Factory reset + maintenance flows
- Band/cell lock clear success (OK/ERROR responses from `AT^BAND_PREF_EXT`,
  `AT^LTE_LOCK`, `AT^NR5G_LOCK`)
- Mode resets and reboot responses (`AT^SLMODE=1,0`, `AT^NR5G_MODE=0`, `AT+CFUN=1,1`)
