# Needed Quectel AT commands for GUI data collection

This file is the **actionable command list** you can run against a Quectel modem
to collect the data the GUI expects. Each section maps directly to fields the
frontend parses, so you can later add example payloads and parsing notes.

> Note: The GUI uses both standard `AT+...` commands and vendor-specific
> `AT^...` commands. The Quectel PDF bundled here contains mostly `AT+...`.
> The `AT^...` commands come from existing modem logic/firmware docs and are
> required by the current frontend.

---

## 1) Core status (dashboard)
Run this full bundle when the SIM is ready (current GUI behavior):

```
AT^TEMP?;^SWITCH_SLOT?;+CGPIAF=1,1,1,1;^DEBUG?;+CPIN?;+CGCONTRDP=1;$QCSIMSTAT?;+CSQ;+COPS?;+CIMI;+ICCID;+CNUM;+CSCS="GSM";+CGMI;+CGMM;^VERSION?;+CGSN
```

If the SIM is **not ready**, the GUI only runs the basic read:

```
AT^TEMP?;^SWITCH_SLOT?
```

### Individual commands (core status)
- `AT+CPIN?` (SIM state)
- `AT^TEMP?` (temperatures)
- `AT^SWITCH_SLOT?` (active SIM slot)
- `AT+CGPIAF=1,1,1,1` (enable numeric format for PDP address)
- `AT^DEBUG?` (serving cell + RF metrics)
- `AT+CGCONTRDP=1` (APN + IP addresses)
- `AT$QCSIMSTAT?` (SIM status detail)
- `AT+CSQ` (signal strength fallback)
- `AT+COPS?` (operator name)
- `AT+CIMI` (IMSI)
- `AT+ICCID` (ICCID)
- `AT+CNUM` (phone number)
- `AT+CSCS="GSM"` (character set for phone number parsing)
- `AT+CGMI` (manufacturer)
- `AT+CGMM` (model)
- `AT^VERSION?` (firmware version)
- `AT+CGSN` (IMEI)

## 2) Device info page
Run this bundle for the device info modal:

```
AT+CGMI;+CGMM;^VERSION?;+CIMI;+ICCID;+CGSN;+CNUM;+CGCONTRDP=1
```

## 3) Radio settings / cellular configuration
### Read current configuration
```
AT^SWITCH_SLOT?;^SLMODE?
AT+CPIN?
AT+CGCONTRDP=1;+CGDCONT?;^BAND_PREF_EXT?;^CA_INFO?;^SLMODE?;^LTE_LOCK?;^NR5G_LOCK?
AT^NR5G_MODE?
```

### APN management
```
AT+CGDCONT?
AT+CGDCONT=<cid>
AT+CGDCONT=1,"<type>","<apn>"
```

### Band preferences / lock
```
AT^BAND_PREF_EXT?
AT^BAND_PREF_EXT=<tech>,2,<bands>
AT^BAND_PREF_EXT        (clear)
```

### SIM slot / mode management
```
AT^SWITCH_SLOT=<slot>
AT^SLMODE=1,<mode>
```

### Radio power & reboot
```
AT+CFUN=0
AT+CFUN=1
AT+CFUN=1,1
```

### Cell locks
```
AT^LTE_LOCK?
AT^LTE_LOCK=<pairs>
AT^LTE_LOCK             (clear)

AT^NR5G_LOCK?
AT^NR5G_LOCK=<band>,<scs>,<earfcn>,<pci>
AT^NR5G_LOCK            (clear)

AT^NR5G_MODE?
AT^NR5G_MODE=<mode>
AT^NR5G_MODE=0          (reset)
```

## 4) SMS (frontend + send SMS CGI)
### Storage selection
```
AT+CPMS?
AT+CPMS="<mem>","<mem>","<mem>"
```

### SMS read
```
AT+CSMS=1
AT+CSDH=0
AT+CNMI=2,1,0,0,0
AT+CMGF=1
AT+CSCA?
AT+CSMP=17,167,0,8
AT+CMGL="ALL"
```

### SMS delete
```
AT+CMGD=<index>
AT+CMGD=,4
```

### SMS send (CGI)
```
AT+CSCS="UCS2"
AT+CMGS="<number>"
```

## 5) SIM unlock / PIN control
```
AT+CPIN="<pin>"
AT+CLCK="SC",0,"<pin>"
```

## 6) Factory reset (CGI helper)
```
AT^BAND_PREF_EXT
AT^LTE_LOCK
AT^NR5G_LOCK
AT^SLMODE=1,0
AT^NR5G_MODE=0
```

---

# Commands found in the bundled Quectel PDF that map to GUI data

The following **standard** commands are present in the PDF and correspond to
GUI readback needs. These are listed separately so you can confirm availability
on other Quectel models:

## Device / SIM / network status
- `AT+CPIN?`
- `AT+CSQ`
- `AT+COPS?`
- `AT+CIMI`
- `AT+CNUM`
- `AT+CGMI`
- `AT+CGMM`
- `AT+CGSN`
- `AT+CGDCONT?`
- `AT+CFUN?`

## SMS
- `AT+CPMS?`
- `AT+CSMS`
- `AT+CSDH`
- `AT+CNMI`
- `AT+CMGF?`
- `AT+CSCA?`
- `AT+CSMP`
- `AT+CMGL`
- `AT+CMGD`
- `AT+CMGS`
- `AT+CLCK`

> Vendor-specific commands used by the GUI (`AT^TEMP?`, `AT^DEBUG?`,
> `AT^BAND_PREF_EXT?`, etc.) are not listed in the PDF text extraction and may
> require a Quectel private/extended command reference.
