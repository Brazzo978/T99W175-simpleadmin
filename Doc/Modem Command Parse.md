## Conventions

* `→` command sent
* `←` modem response
* `OK / ERROR` final status

---

## 1. ATI — Modem Identification

### Command

```text
ATI
```

### Example Output

```text
Manufacturer: QUALCOMM
Model: T99W175
Revision: T99W175.F0.1.0.0.9.DF.015
SVN: 01
IMEI: XXXXXXXXXXXXX
+GCAP: +CGSM
MPN: 32
OK
```

### Field Parsing

| Field        | Description              |
| ------------ | ------------------------ |
| Manufacturer | Chipset vendor           |
| Model        | Modem model              |
| Revision     | Firmware / build version |
| SVN          | Sub‑version number       |
| IMEI         | Modem unique identifier  |
| GCAP         | Legacy capability flags  |

---

## 2. AT^DEBUG? — Get Serving Cell Information

### Command

```text
AT^DEBUG?
```

### Purpose

Returns serving cell information for the current network (LTE, LTE+NR, or NR5G SA).

---

## Supported RAT Values

* `WCDMA`
* `LTE`
* `LTE+NR` (5G NSA / ENDC)
* `NR5G_SA` (5G Standalone)

---

## Parameters

| Parameter                  | Description                          |
| -------------------------- | ------------------------------------ |
| RAT                        | Radio Access Technology              |
| mcc / mnc                  | Mobile Country / Network Code        |
| band                       | Active band                          |
| band_width                 | Channel bandwidth                    |
| channel                    | EARFCN / NRARFCN                     |
| cell_id                    | Cell ID                              |
| lte_tac / nr_tac           | Tracking Area Code                   |
| tx_pwr                     | UE transmit power                    |
| pcell                      | Primary serving cell                 |
| scell                      | Secondary cell (Carrier Aggregation) |
| pci                        | Physical Cell ID                     |
| rsrp                       | Reference Signal Received Power      |
| rsrq                       | Reference Signal Received Quality    |
| rssi                       | Received Signal Strength Indicator   |
| snr                        | Signal‑to‑Noise Ratio                |
| rx_diversity               | RX chain validity bitmask            |
| lte_ant_rsrp / nr_ant_rsrp | Per‑antenna RSRP values              |

---

## Example 1 — LTE + NR (5G NSA / ENDC)

```text
AT^DEBUG?
RAT:LTE+NR
mcc:222,mnc:88
lte_cell_id:80389889
lte_tac:30648
lte_tx_pwr:9.0dBm
lte_ant_rsrp:rx_diversity:1 (-84.4dBm,NA,NA,NA)
pcell: lte_band:3 lte_band_width:20.0MHz
channel:1650 pci:28
lte_rsrp:-84.1dBm,rsrq:-13.6dB
lte_rssi:-50.6dBm,lte_snr:13.4dB
scell: lte_band:1 lte_band_width:20.0MHz
channel:100 pci:28
scell: lte_band:7 lte_band_width:20.0MHz
channel:3350 pci:85
nr_band:n78
nr_band_width:80.0MHz
nr_channel:638016
nr_pci:532
nr_rsrp:-87dBm rx_diversity:15 (-84.8,-112.4,-84.7,-116.1)
nr_rsrq:-11dB
nr_snr:29.0dB
OK
```

---

## Example 2 — NR5G SA (Standalone)

```text
AT^DEBUG?
RAT:NR5G_SA
mcc:202,mnc:01
nr_cell_id:4946788483
nr_tac:5615
nr_band:n78
nr_band_width:100.0MHz
nr_channel:634080
nr_pci:363
nr_rsrp:-83dBm rx_diversity:15 (-87.8,-83.0,-97.0,-88.7)
nr_rsrq:-11dB
nr_snr:8.5dB
OK
```
---
## Example 3 — LTE Only

```text
AT^DEBUG?
RAT:LTE
mcc:222,mnc:10
lte_cell_id:12176170
lte_tac:22097
lte_tx_pwr:18.2dBm
lte_ant_rsrp:rx_diversity:3 (-79.5dBm,-75.9dBm,NA,NA)
pcell: lte_band:1 lte_band_width:15.0MHz
channel:525 pci:263
lte_rsrp:-75.7dBm,rsrq:-10.2dB
lte_rssi:-46.6dBm,lte_snr:4.8dB
OK
```

---

## 3. AT^TEMP? — Check Modem Temperature

### Command

```text
AT^TEMP?
```

### Purpose

Returns the current internal temperature readings from the modem sensors.

---

## Parameters

| Parameter   | Description                               |
| ----------- | ----------------------------------------- |
| TSENS       | Baseband / chipset temperature (°C)       |
| PA          | Power Amplifier temperature (°C)          |
| Skin Sensor | External / board surface temperature (°C) |

---

## Example Output

```text
AT^TEMP?
PA: 37C
Skin Sensor: 37C
TSENS: 39C
OK
```

---

## Notes

* All values are expressed in **degrees Celsius**

---

DA QUI 



## 4. AT^SWITCH_SLOT — Switch Physical SIM Slot

### Command

```text
AT^SWITCH_SLOT?
```

```text
AT^SWITCH_SLOT=<mode>
```

### Purpose

Reads or switches the active physical SIM slot.

---

## Parameters

| Parameter | Value | Description |
| --------- | ----- | ----------- |
| `<mode>`  | `0`   | Enable SIM1 |
| `<mode>`  | `1`   | Enable SIM2 |

---

## Read Command — Example Output

```text
AT^SWITCH_SLOT?
SIM1 ENABLE
OK
```

```text
AT^SWITCH_SLOT?
SIM2 ENABLE
OK
```

---

## Write Command — Examples

```text
AT^SWITCH_SLOT=0
OK
```

```text
AT^SWITCH_SLOT?
SIM1 ENABLE
OK
```

```text
AT^SWITCH_SLOT=1
OK
```

```text
AT^SWITCH_SLOT?
SIM2 ENABLE
OK
```

---

## 5. AT^BAND_PREF_EXT — Enable / Disable Bands

### Command (Read)

```text
AT^BAND_PREF_EXT?
```

### Command (Write)

```text
AT^BAND_PREF_EXT=<tech>,<status>,<band1>[:<band2>[:<band3>...]]
```

### Command (Exec)

```text
AT^BAND_PREF_EXT
```

### Purpose

Configures band preferences for **WCDMA, LTE, NR5G NSA, and NR5G SA** without requiring a reboot.

---

### Parameters

| Parameter  | Value       | Description               |
| ---------- | ----------- | ------------------------- |
| `<tech>`   | `WCDMA`     | WCDMA bands               |
|            | `LTE`       | LTE bands                 |
|            | `NR5G_NSA`  | 5G NSA bands              |
|            | `NR5G_SA`   | 5G SA bands               |
| `<status>` | `1`         | Disable listed bands      |
|            | `2`         | Enable listed bands       |
| `<band>`   | `1:2:3:...` | Colon-separated band list |

---

### Supported Bands (Device-dependent)

**WCDMA**: 1, 2, 4, 5, 6, 8, 9, 19
**LTE**: 1, 2, 3, 4, 5, 7, 8, 12, 13, 14, 17, 18, 19, 20, 25, 26, 28, 29, 30, 32, 34, 38, 39, 40, 41, 42, 46, 48, 66, 71
**NR5G_NSA**: 1, 2, 3, 5, 7, 8, 12, 20, 28, 38, 41, 66, 71, 77, 78, 79 *(optional: 25, 40, 48, n257–n261)*
**NR5G_SA**: 1, 2, 3, 5, 7, 8, 12, 20, 28, 38, 41, 66, 71, 77, 78, 79 *(optional: 25, 40, 48)*

> Unsupported bands are silently omitted from the response.

---

### Read Command — Example Output

```text
AT^BAND_PREF_EXT?
WCDMA,Enable Bands :1,2,4,5,6,8,9,19,
WCDMA,Disable Bands:
LTE,Enable Bands :1,2,3,4,5,7,8,12,13,14,17,18,19,20,25,26,28,29,30,32,34,38,39,40,41,42,43,46,48,66,71,
LTE,Disable Bands:
NR5G_NSA,Enable Bands :1,2,3,5,7,8,12,14,20,25,28,38,40,41,48,66,71,77,78,79,257,258,260,261,
NR5G_NSA,Disable Bands:
NR5G_SA,Enable Bands :1,2,3,5,7,8,12,20,25,28,38,40,41,48,66,71,77,78,79,
NR5G_SA,Disable Bands:
OK
```

---

### Write Command — Examples

Disable specific LTE bands:

```text
AT^BAND_PREF_EXT=LTE,1,3:4:5:7:8:12:13:14
OK
```

Disable specific NR5G NSA bands:

```text
AT^BAND_PREF_EXT=NR5G_NSA,1,1:260
OK
```

Enable specific NR5G SA bands:

```text
AT^BAND_PREF_EXT=NR5G_SA,2,77:78:79
OK
```

---

### Exec Command — Restore Defaults

```text
AT^BAND_PREF_EXT
OK
```

---

### Notes

* Changes apply **immediately**, no reboot required
* NSA and SA band preferences are managed **independently**
* Use `AT^BAND_PREF` if NSA and SA must be configured together
* Unsupported bands return no error and are not shown in responses


## 6. AT^LTE_LOCK — Lock LTE EARFCN and PCI

### Command (Write)

```text
AT^LTE_LOCK=<pci1>,<dl_earfcn1>[,<pci2>,<dl_earfcn2>...[,<pci8>,<dl_earfcn8>]]
```

### Command (Read)

```text
AT^LTE_LOCK?
```

### Command (Exec)

```text
AT^LTE_LOCK
```

### Purpose

Locks one or more **LTE cells** by forcing specific **PCI** and **downlink EARFCN** values.

After applying a lock:

* The modem is forced into **LTE-only mode**
* If the specified PCI / EARFCN is not available, the modem will enter **No Service** state

> A device restart is required for write and exec commands to take effect.

---

### Parameters

| Parameter     | Value   | Description         |
| ------------- | ------- | ------------------- |
| `<pci>`       | 0–503   | Physical Cell ID    |
| `<dl_earfcn>` | Integer | LTE downlink EARFCN |

* Up to **8 PCI / EARFCN pairs** are supported

---

### Read Command — Example

```text
AT^LTE_LOCK?
^LTE_LOCK: Have not set cell lock before
OK
```

---

### Write Command — Single Cell Lock

```text
AT^LTE_LOCK=405,40936
OK
```

```text
AT+RESET
OK
```

```text
AT^DEBUG?
RAT:LTE
pcell: lte_band:41
channel:40936 pci:405
OK
```

---

### Write Command — Multiple Cell Lock

```text
AT^LTE_LOCK=405,40936,477,1300,169,36275
OK
```

```text
AT+RESET
OK
```

```text
AT^DEBUG?
RAT:LTE
pcell: lte_band:34
channel:36275 pci:169
OK
```

---

### Exec Command — Clear Lock

```text
AT^LTE_LOCK
OK
```

```text
AT+RESET
OK
```

---

### Notes

* Locking applies **only to LTE** (not NR)
* LTE cell lock forces LTE-only mode automatically
* Always verify PCI and EARFCN using `AT^DEBUG?` before locking
* Incorrect values will result in **No Service**


## 7. AT^NR5G_LOCK — Lock NR-ARFCN and PCI (NR5G SA)

### Command (Write)

```text
AT^NR5G_LOCK=<band>,<scs_type>,<nr_arfcn>,<pci>
```

### Command (Read)

```text
AT^NR5G_LOCK?
```

### Command (Exec)

```text
AT^NR5G_LOCK
```

### Purpose

Locks the modem to a specific **NR5G SA cell** by forcing **NR-ARFCN (downlink)** and **PCI**.

After applying the lock:

* The modem is forced into **NR5G-only (SA) mode**
* If the specified combination is not available, the modem will enter **No Service** state

> This command supports **only one NR cell lock** at a time.

> Write and exec commands require a **device reboot** to take effect.

---

### Parameters

| Parameter    | Value   | Description                         |
| ------------ | ------- | ----------------------------------- |
| `<band>`     | Integer | NR operating band (e.g. 78 for n78) |
| `<scs_type>` | `0`     | Subcarrier spacing 15 kHz           |
|              | `1`     | Subcarrier spacing 30 kHz           |
|              | `2`     | Subcarrier spacing 60 kHz           |
|              | `3`     | Subcarrier spacing 120 kHz          |
| `<nr_arfcn>` | Integer | NR downlink ARFCN                   |
| `<pci>`      | Integer | Physical Cell ID                    |

---

### Read Command — Example

```text
AT^NR5G_LOCK?
NR5G_LOCK:Have not set cell lock before
OK
```

---

### Write Command — Example

```text
AT^NR5G_LOCK=78,1,627264,148
OK
```

```text
AT^NR5G_LOCK?
^NR5G_LOCK:(78,1,627264,148)
OK
```

```text
AT+RESET
OK
```

---

### Verification (AT^DEBUG)

```text
AT^DEBUG?
RAT:NR5G_SA
nr_band:n78
nr_band_width:100.0MHz
nr_channel:627264
nr_pci:148
nr_rsrp:-102.0dBm
nr_rsrq:-12.0dB
nr_snr:11.5dB
OK
```

---

### Exec Command — Clear Lock

```text
AT^NR5G_LOCK
OK
```

```text
AT+RESET
OK
```

---

### Notes

* Supported **only in NR5G SA private network mode**
* If NR5G SA is not enabled (see `AT^NR5G_MODE`), the command returns **ERROR**
* Always validate band, SCS, ARFCN and PCI using `AT^DEBUG?` before locking
* Invalid parameters will result


## 8. AT^NR5G_MODE — Enable / Disable NR5G NSA / SA Mode

### Command (Write)

```text
AT^NR5G_MODE=<nr5g_mode>
```

### Command (Read)

```text
AT^NR5G_MODE?
```

### Purpose

Enables or disables NR5G operating modes (NSA and/or SA).

This command takes effect without requiring a module reset. The modem may need some time to re-search the network.


---

### Parameters

| Value | Description            |
| ----- | ---------------------- |
| `0`   | Enable NR5G NSA and SA |
| `1`   | Enable NR5G NSA only   |
| `2`   | Enable NR5G SA only    |

---

### Read Command — Example

```text
AT^NR5G_MODE?
^NR5G_MODE:0
OK
```

---

### Write Command — Example

```text
AT^NR5G_MODE=2
OK
```

```text
AT^NR5G_MODE?
^NR5G_MODE:2
OK
```

---

### Notes

* No reboot is required
* Network reselection may take several seconds
* NR5G SA needs to be supported by the network , otherwise the modem will end up on no service
* Use AT^DEBUG? to verify the active RAT after changing the mode


