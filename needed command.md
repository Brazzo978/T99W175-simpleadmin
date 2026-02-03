# Needed AT commands for the GUI (from JS + frontend usage)

This list is based on the commands referenced directly in the JavaScript UI logic and CGI helpers.
It groups commands by feature so you can later add parsing examples.

## Dashboard / home status (index page)
- SIM state: `AT+CPIN?`
- Temperature + SIM slot: `AT^TEMP?`, `AT^SWITCH_SLOT?`
- Full status bundle (single multi-command request):
  - `AT^TEMP?;^SWITCH_SLOT?;+CGPIAF=1,1,1,1;^DEBUG?;+CPIN?;+CGCONTRDP=1;$QCSIMSTAT?;+CSQ;+COPS?;+CIMI;+ICCID;+CNUM;+CSCS="GSM";+CGMI;+CGMM;^VERSION?;+CGSN`
- SIM unlock: `AT+CPIN="<pin>"`
- Disable SIM PIN: `AT+CLCK="SC",0,"<pin>"`
- Modem NV tuning (used for saving/clearing custom data): `AT^NV=550,0`, `AT^NV=550,<byte_count>,"<hex_payload>"`

## Device info page
- Device identification: `AT+CGMI`, `AT+CGMM`, `AT^VERSION?`, `AT+CGSN`
- SIM/phone info: `AT+CIMI`, `AT+ICCID`, `AT+CNUM`
- Data connection: `AT+CGCONTRDP=1`

## Radio settings / cellular configuration
- APN profiles: `AT+CGDCONT?`, `AT+CGDCONT=<cid>`, `AT+CGDCONT=1,"<type>","<apn>"`
- APN info / PDP: `AT+CGCONTRDP=1`
- Band preferences: `AT^BAND_PREF_EXT?`, `AT^BAND_PREF_EXT=<tech>,2,<bands>`, `AT^BAND_PREF_EXT` (clear)
- CA + serving cell info: `AT^CA_INFO?`, `AT^DEBUG?`
- SIM slot + mode: `AT^SWITCH_SLOT?`, `AT^SWITCH_SLOT=<slot>`, `AT^SLMODE?`, `AT^SLMODE=1,<mode>`
- SIM presence: `AT+CPIN?`
- Radio power: `AT+CFUN=0`, `AT+CFUN=1`, `AT+CFUN=1,1`
- LTE/NR locks: `AT^LTE_LOCK?`, `AT^LTE_LOCK=<pairs>`, `AT^LTE_LOCK` (clear)
- 5G locks: `AT^NR5G_LOCK?`, `AT^NR5G_LOCK=<band>,<scs>,<earfcn>,<pci>`, `AT^NR5G_LOCK` (clear)
- 5G mode: `AT^NR5G_MODE?`, `AT^NR5G_MODE=<mode>`, `AT^NR5G_MODE=0` (reset)

## SMS (frontend + send SMS CGI)
- Storage selection: `AT+CPMS?`, `AT+CPMS="<mem>","<mem>","<mem>"`
- SMS setup and list: `AT+CSMS=1`, `AT+CSDH=0`, `AT+CNMI=2,1,0,0,0`, `AT+CMGF=1`, `AT+CSCA?`, `AT+CSMP=17,167,0,8`, `AT+CMGL="ALL"`
- Delete SMS: `AT+CMGD=<index>`, `AT+CMGD=,4`
- Send SMS (CGI): `AT+CSCS="UCS2"`, `AT+CMGS="<number>"`

## Factory reset (CGI helper)
- Clear band and cell locks: `AT^BAND_PREF_EXT`, `AT^LTE_LOCK`, `AT^NR5G_LOCK`
- Reset mode defaults: `AT^SLMODE=1,0`, `AT^NR5G_MODE=0`

---

# AT commands in the Quectel manual that are relevant to reading GUI data

These commands appear in the Quectel AT command manual PDF and can provide read-only data
that aligns with the GUI fields (device info, SIM state, network status, SMS):

## Device / SIM / network status
- `AT+CPIN?` (SIM state)
- `AT+CSQ` (signal strength)
- `AT+COPS?` (operator selection / name)
- `AT+CIMI` (IMSI)
- `AT+CNUM` (phone number)
- `AT+CGMI` (manufacturer)
- `AT+CGMM` (model)
- `AT+CGSN` (IMEI)
- `AT+CGDCONT?` (PDP context / APN profiles)
- `AT+CFUN?` (functionality status)

## SMS readback
- `AT+CPMS?` (message storage info)
- `AT+CSMS` (SMS service support)
- `AT+CSDH` (show SMS headers)
- `AT+CNMI` (new message indications)
- `AT+CMGF?` (text/PDU mode)
- `AT+CSCA?` (service center number)
- `AT+CSMP` (SMS text mode parameters)
- `AT+CMGL` (list messages)
- `AT+CMGD` (delete messages)
- `AT+CMGS` (send message)
- `AT+CLCK` (SIM lock status/operations)

> Note: The GUI also relies on vendor-specific `AT^...` commands (e.g. `AT^DEBUG?`,
> `AT^TEMP?`, `AT^BAND_PREF_EXT?`). Those do not appear in this PDF text extraction,
> so they may be documented elsewhere or in a different Quectel-specific manual.
