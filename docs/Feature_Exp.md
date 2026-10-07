## Home (`/index.html`)

The **Home** page is the main dashboard of **SimpleT99**. It provides a quick overview of the device status and exposes interactive widgets for deeper inspection and configuration.

### Interactive Status Tiles (4)

At the top, the dashboard shows **4 clickable tiles**. Each tile is interactive and updates in real time (including **color changes** based on current values/status). Clicking a tile opens a dedicated submenu.

#### 1) Temperature

- Opens a panel showing **all temperature sensors** reported by the modem.
- The temperature shown on the main tile is the **average** of all available readings.

#### 2) SIM Status

- Displays the current **SIM state** and related details.
- Includes a **PIN unlock** menu with two modes:
  - **Permanent unlock**: enter the PIN once and the SIM stays unlocked permanently.
  - **Temporary unlock**: enter the PIN to unlock the SIM **until the CPE is rebooted**.
- The two-mode approach is designed for **simplicity and efficiency**.

#### 3) Signal Percentage

- Shows a **single percentage score** computed from the available signal metrics.
- Clicking opens **Advanced Signal Details**, which includes:
  - Signal metrics for **each band currently used** by the modem (e.g. *7 + 3 + 1 + n78*).
  - Animated signal bars for each metric.
  - For primary **4G and 5G** carriers, it displays:
    - `RSSI`, `RSRP`, `SINR`, `RSRQ`
    - Per-antenna readings when available (`RSRP` per physical antenna)
    - Automatic adaptation to the active MIMO setup:
      - **4x4 MIMO** → 4 antenna values
      - **2x2 MIMO** → 2 antenna values
      - **1x1** → 1 antenna value (main antenna only)
  - At the bottom, an **automatic analysis tool** applies the same logic used in the **Network Analyzer** module to highlight potential issues and suggest improvements.

**Chart mode (v1.0.4+)**

- Starting from **v1.0.4**, an icon next to *Advanced Signal Details* enables a live chart.
- The chart visualizes primary **4G and 5G** band values.
- Bands/metrics can be toggled via **checkboxes** for a cleaner view.
- Time window: **3 minutes**.
- Refresh rate follows the GUI refresh interval configured on the Home page.

#### 4) Connected / Internet Connection

- Opens **Connection Details** where you can configure one or more hosts used for connectivity checks.
- Supported check methods:
  - **Ping**
  - **DNS resolution**
- These checks feed the main status tile (Connected / Not connected).

### Signal Information Panel

A dedicated **Signal Information** section shows a compact, readable summary of the current radio state:

- **Assessment**: an overall score/grade of the current signal quality.
- **Network Mode**: current RAT status (e.g. **4G**, **NR-NSA**, **NR-SA**).
- **Bands**: lists the currently used **4G and 5G** bands.
- **Bandwidth**: bandwidth of the currently active bands.
- **E/ARFCN (4G/5G)**: EARFCN/NR-ARFCN values for the active bands.
- **PCI**: PCI for the connected cell(s).
- **Cell ID**: shows serving cell information.
  - A globe icon next to the Cell ID provides quick lookup:
    - When used in **Italy**, it opens **LTEItaly** directly on the currently connected BTS (when available).
- At the bottom, the panel shows the **basic primary-band signal metrics** (the “main” signal values only).

### Network & System Information Panel

Below the tiles there is a **Network & System Information** section with key device and network details, including:

- Active SIM
- Provider info + **MCC/MNC**
  - Includes a globe icon linking to an external provider lookup page for more details
- APN
- IPv4 address and **IPv6 (if available)**
- CPE uptime
- CPU and RAM usage
- Ethernet port link speed

**Refresh rate toggle**

- At the end of this panel there is a **Refresh Rate** control for the GUI.
- Minimum supported refresh interval: **5 seconds**.
