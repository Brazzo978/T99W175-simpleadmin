/**
 * Dashboard data processing and display for T99W175 modem.
 *
 * Provides Alpine.js component for aggregating and displaying modem status:
 * - Signal metrics (CSQ, RSSI, RSRP, RSRQ, SINR) for LTE/NR
 * - Network information (provider, bands, EARFCN, PCI)
 * - IP configuration (IPv4/IPv6)
 * - System metrics (temperature, uptime, memory, CPU)
 * - Throughput statistics
 * - Connection testing (ping, DNS)
 * - Multi-cell signal aggregation
 *
 * @module index-process
 * @requires Alpine.js
 * @requires atcommand-utils.js
 */

/**
 * Alpine.js component for dashboard status processing.
 *
 * Aggregates data from multiple AT commands and system endpoints to provide
 * a comprehensive real-time view of modem status, signal quality, and performance.
 *
 * @returns {Object} Alpine.js component data object
 */
function processAllInfos() {
  // Default state for all dashboard data
  const defaultDataState = {
    // AT command buffer
    atcmd: "",
    // Internet connection status
    internetConnectionStatus: "Disconnected",
    // Modem temperature
    temperature: "0",
    // SIM status string
    simStatus: "No SIM",
    // Active SIM slot
    activeSim: "No SIM",
    // Network provider name
    networkProvider: "N/A",
    // Mobile Country Code + Mobile Network Code
    mccmnc: "00000",
    // Current APN
    apn: "Unknown",
    // Network mode (LTE/NSA/SA)
    networkMode: "Disconnected",
    // Network mode badges for display
    networkModeBadges: [],
    // Active bands
    bands: "Unknown Bands",
    // Channel bandwidth
    bandwidth: "Unknown Bandwidth",
    // E-UTRA Absolute Radio Frequency Channel Number
    earfcns: "000",
    // Primary Cell PCI
    pccPCI: "0",
    // Secondary Cell PCI
    sccPCI: "-",
    // IPv4 address
    ipv4: "000.000.000.000",
    // IPv6 address
    ipv6: "0000:0000:0000:0000:0000:0000:0000:0000",
    // Cell ID
    cellID: "Unknown",
    // Decimal cell ID (long) - stored for direct access
    decimalCellId: null,
    // eNodeB ID for LTE
    eNBIDLTE: "-",
    // eNodeB ID for NR
    eNBIDNR: "-",
    // Tracking Area Code (legacy, kept for compatibility)
    tac: "Unknown",
    // Tracking Area Code for LTE
    tacLTE: "-",
    // Tracking Area Code for NR
    tacNR: "-",
    // Signal quality indicator
    csq: "-",
    // LTE Received Signal Strength Indicator
    rssiLTE: "-",
    // NR Received Signal Strength Indicator
    rssiNR: "-",
    // LTE RSSI percentage
    rssiLTEPercentage: "0%",
    // NR RSSI percentage
    rssiNRPercentage: "0%",
    // LTE Reference Signal Received Power
    rsrpLTE: "-",
    // NR Reference Signal Received Power
    rsrpNR: "-",
    // LTE RSRP percentage
    rsrpLTEPercentage: "0%",
    // NR RSRP percentage
    rsrpNRPercentage: "0%",
    // LTE Reference Signal Received Quality
    rsrqLTE: "-",
    // NR Reference Signal Received Quality
    rsrqNR: "-",
    // LTE RSRQ percentage
    rsrqLTEPercentage: "0%",
    // NR RSRQ percentage
    rsrqNRPercentage: "0%",
    // LTE Signal to Interference plus Noise Ratio
    sinrLTE: "-",
    // NR Signal to Interference plus Noise Ratio
    sinrNR: "-",
    // LTE SINR percentage
    sinrLTEPercentage: "0%",
    // NR SINR percentage
    sinrNRPercentage: "0%",
    // Overall signal percentage
    signalPercentage: "0",
    // Signal quality assessment
    signalAssessment: "Unknown",
    // System uptime
    uptime: "Unknown",
    // System bus speed
    systemSpeed: "Unknown",
    // System duplex mode
    systemDuplex: "Unknown",
    // CPU usage percentage
    cpuUsage: 0,
    // Memory used in MB
    memUsed: 0,
    // Total memory in MB
    memTotal: 0,
    // Memory usage percentage
    memPercent: 0,
    // Last update timestamp
    lastUpdate: new Date().toLocaleString(),
    // New refresh rate to apply
    newRefreshRate: null,
    // Current refresh rate in seconds
    refreshRate: 10,
    // NR (5G) download speed
    nrDownload: "0",
    // NR (5G) upload speed
    nrUpload: "0",
    // Non-NR download speed
    nonNrDownload: "0",
    // Non-NR upload speed
    nonNrUpload: "0",
    // Total download statistic
    downloadStat: "0",
    // Total upload statistic
    uploadStat: "0",
    // Detailed signal measurements for multiple cells
    detailedSignals: [],
    // Network analysis advisor output
    networkAnalysis: null,
    // Auto-refresh interval ID
    intervalId: null,
    // Phone number
    phoneNumber: "Unknown",
    // International Mobile Subscriber Identity
    imsi: "Unknown",
    // Integrated Circuit Card Identifier
    iccid: "Unknown",
    // SIM PIN unlock state
    simPin: "",
    simPinDisableMode: "permanent",
    simUnlockMessage: "",
    simUnlockError: "",
    isSimUnlocking: false,
    // Power Amplifier temperature
    paTemperature: "Unknown",
    // Skin temperature
    skinTemperature: "Unknown",
    // Connection test results
    connectionDetails: {
      ping: null,
      dns: null
    },
    // IMEI editing state (for device info modal)
    imei: "Unknown",
    newImei: "",
    showImeiWarningModal: false,
    showImeiInputModal: false,
    imeiValidationError: "",
    isImeiValid: false,
    // Device information (available even without SIM)
    manufacturer: "-",
    modelName: "-",
    firmwareVersion: "-",
    lanIp: "-",
    wwanIpv4: "-",
    wwanIpv6: "-",
  };

  return {
    // Spread default state as component data
    ...defaultDataState,

    /**
     * Resets component data to defaults with optional overrides.
     *
     * Preserves refresh rate and interval ID while resetting all other values.
     *
     * @param {Object} [overrides={}] - Optional data overrides to apply
     */
    resetData(overrides = {}) {
      const preservedState = {
        refreshRate: this.refreshRate,
        newRefreshRate: this.newRefreshRate,
        intervalId: this.intervalId,
        simPin: this.simPin,
        simPinDisableMode: this.simPinDisableMode,
      };

      Object.assign(
        this,
        {
          ...defaultDataState,
          ...preservedState,
          lastUpdate: new Date().toLocaleString(),
        },
        overrides
      );

      this.detailedSignals = Array.isArray(overrides.detailedSignals)
        ? [...overrides.detailedSignals]
        : [];
    },

    /**
     * Applies fallback state when data retrieval fails.
     *
     * Resets to default state with "Unavailable" message when
     * modem communication fails.
     *
     * @param {string} [message] - Optional error message to display
     */
    applyFallback(message) {
      const fallbackMessage = message
        ? `Unavailable (${message})`
        : defaultDataState.activeSim;

      this.resetData({
        activeSim: fallbackMessage,
      signalAssessment: "Unknown",
      internetConnectionStatus: "Disconnected",
    });
  },
  async fetchAllInfo() {
    // First check if SIM is present
    const simCheckCmd = 'AT+CPIN?';

    try {
      const simCheckResult = await ATCommandService.execute(simCheckCmd, {
        retries: 2,
        timeout: 5000,
      });

      let simReady = false;
      let simStatusText = "No SIM";

      if (simCheckResult.ok && simCheckResult.data) {
        const simStatus = simCheckResult.data.trim();
        simReady = simStatus.includes('READY');
        simStatusText = simStatus.includes('CPIN:') ? simStatus.split(':')[1].trim() : "No SIM";
      }
      
      // If SIM is not ready, get basic info only
      if (!simReady) {
        console.warn("SIM not ready:", simStatusText);
        // Get basic info that doesn't require SIM (temperature + slot)
        const basicCmd = 'AT^TEMP?;^SWITCH_SLOT?';
        
        let tempValue = "0";
        let simSlot = "No SIM Detected";
        
        try {
          const basicResult = await ATCommandService.execute(basicCmd, {
            retries: 2,
            timeout: 10000,
          });
          
          if (basicResult.ok && basicResult.data) {
            const lines = basicResult.data.split("\n");
            // Temperature
            try {
              tempValue = lines
                .find((line) => line.includes('TSENS:'))
                .split(":")[1]
                .replace(/"/g, "");
            } catch (error) {
              try {
                tempValue = lines
                  .find((line) => line.includes('TSENS:'))
                  .split(",")[1]
                  .replace(/"/g, "");
              } catch (error2) {
                tempValue = "0";
              }
            }
            // Active SIM slot
            try {
              const current_sim = lines
                .find((line) => line.includes("ENABLE"))
                .split(" ")[0]
                .replace(/\D/g, "");
              if (current_sim == 1) {
                simSlot = "SIM 1 (No SIM Detected)";
              } else if (current_sim == 2) {
                simSlot = "SIM 2 (No SIM Detected)";
              } else {
                simSlot = "Unknown Slot (No SIM Detected)";
              }
            } catch (error) {
              simSlot = "Unknown Slot (No SIM Detected)";
            }
          }
        } catch (error) {
          console.error("Error fetching basic info:", error);
        }
        
      this.resetData({
        simStatus: simStatusText,
        activeSim: simSlot,
        signalAssessment: "Unknown",
        internetConnectionStatus: "Disconnected",
        networkProvider: "N/A",
        apn: "Not Available",
        networkMode: "Not Available",
        networkModeBadges: [],
        bands: "Not Available",
        temperature: tempValue,
        decimalCellId: null
      });
        return;
      }
      // SIM is ready, execute full command set
      this.atcmd =
        'AT^TEMP?;^SWITCH_SLOT?;+CGPIAF=1,1,1,1;^DEBUG?;+CPIN?;+CGCONTRDP=1;$QCSIMSTAT?;+CSQ;+COPS?;+CIMI;+ICCID;+CNUM;+CSCS=\"GSM\";+CGMI;+CGMM;^VERSION?;+CGSN';

      const result = await ATCommandService.execute(this.atcmd, {
        retries: 3,
        timeout: 15000,
      });

      if (!result.ok) {
        const fallbackMessage = result.error
          ? result.error.message
          : 'Invalid AT Response.';

        this.applyFallback(fallbackMessage);
        return;
      }

      const rawdata = result.data;

      if (!rawdata || !rawdata.trim()) {
        this.applyFallback('Emtpy AT Response from Modem.');
        return;
      }

      if (rawdata.includes('ERROR')) {
        this.applyFallback('Modem is in error state.');
        return;
      }

      try {
          const lines = rawdata.split("\n");

          console.log(lines);

          const buildDetailedSignals = () => {
            const details = [];
            let currentEntry = null;
            let scellCounter = 0;
            let entryCounter = 0;
            let pendingLteAntennas = [];
            let pendingLteDiversity = null;

            const roundValue = (value) => {
              if (typeof value !== "number" || Number.isNaN(value)) {
                return null;
              }
              return Math.round(value * 10) / 10;
            };

            const parseAntennaLine = (line, prefix) => {
              const match = line.match(/\(([^)]+)\)/);
              if (!match) {
                return [];
              }

              return match[1].split(",").map((item, index) => {
                const trimmed = item.trim();
                const numeric = parseFloat(trimmed);
                return {
                  label: `${prefix} ${index + 1}`,
                  logicalIndex: index, // 0-based logical antenna index
                  value: Number.isNaN(numeric) ? null : numeric,
                };
              });
            };

            // Mapping from logical antenna index to physical antenna index
            // Logical: 0, 1, 2, 3 (displayed as "Antenna 1", "Antenna 2", "Antenna 3", "Antenna 4")
            // Physical: 0, 1, 2, 3 (ANT0, ANT1, ANT2, ANT3)

            // LTE mapping: Logical 0->ANT0, Logical 1->ANT3, Logical 2->ANT2, Logical 3->ANT1
            const LTE_LOGICAL_TO_PHYSICAL = [0, 3, 2, 1];

            // Case 1: 5G FDD 2x2 MIMO (N5, N8, N12, N20, N28, N71) - Only 2 antennas used
            // Mapping: [0, 3] means MAIN->ANT0, AUX1->ANT3, others (ANT1, ANT2) added as "Not Used"
            const NR_FDD_2X2_LOGICAL_TO_PHYSICAL = [0, 3];

            // Case 2: 5G FDD 4x4 MIMO (N1, N2, N3, N7, N25, N66) - All 4 antennas
            // Mapping: [2, 3, 0, 1] means MAIN->ANT2, AUX1->ANT3, AUX2->ANT0, AUX3->ANT1
            const NR_FDD_4X4_LOGICAL_TO_PHYSICAL = [2, 3, 0, 1];

            // Case 3: 5G TDD 4x4 MIMO (N38, N40, N41, N77, N78, N79)
            // Mapping: [2, 1, 0, 3] means MAIN->ANT2, AUX1->ANT1, AUX2->ANT0, AUX3->ANT3
            const NR_TDD_LOGICAL_TO_PHYSICAL = [2, 1, 0, 3];

            // Helper function to determine NR antenna mapping based on band
            const getNrMapping = (band) => {
              if (!band) return NR_FDD_4X4_LOGICAL_TO_PHYSICAL;

              const bandNum = parseInt(band.replace(/\D/g, '')); // Extract number from band string

              // Case 1: 5G FDD 2x2 MIMO bands
              if ([5, 8, 12, 20, 28, 71].includes(bandNum)) {
                return NR_FDD_2X2_LOGICAL_TO_PHYSICAL;
              }

              // Case 2: 5G FDD 4x4 MIMO bands
              if ([1, 2, 3, 7, 25, 66].includes(bandNum)) {
                return NR_FDD_4X4_LOGICAL_TO_PHYSICAL;
              }

              // Case 3: 5G TDD 4x4 MIMO bands
              if ([38, 40, 41, 77, 78, 79].includes(bandNum)) {
                return NR_TDD_LOGICAL_TO_PHYSICAL;
              }

              // Default: Assume 4x4 FDD for unknown bands
              return NR_FDD_4X4_LOGICAL_TO_PHYSICAL;
            };

            const finalizeEntry = () => {
              if (!currentEntry) {
                return;
              }

              const bandDisplay = currentEntry.band
                ? currentEntry.technology === "LTE"
                  ? `Band ${currentEntry.band}`
                  : currentEntry.band
                : "N/A";

              let title = "";
              if (currentEntry.technology === "LTE") {
                if (currentEntry.role === "primary") {
                  title = "Primary 4G";
                } else {
                  title = currentEntry.caIndex
                    ? `CA 4G #${currentEntry.caIndex}`
                    : "CA 4G";
                }
              } else {
                title = "Primary 5G";
              }

              if (bandDisplay !== "N/A") {
                title += ` (${bandDisplay})`;
              }

              const detail = {
                id: currentEntry.id,
                title,
                technology: currentEntry.technology,
                band: currentEntry.band,
                bandDisplay,
                bandwidthDisplay: currentEntry.bandwidth || "N/A",
                channelDisplay: currentEntry.channel || "N/A",
                pciDisplay: currentEntry.pci || "N/A",
                rxDiversityDisplay: currentEntry.rxDiversity || "",
                metrics: [],
                antennas: [],
              };

              const addMetric = (key, label, value, unit, calculator, isCA = false) => {
                const normalized = roundValue(value);
                if (normalized === null) {
                  detail.metrics.push({
                    key,
                    label,
                    display: "N/A",
                    percentage: 0,
                    color: '#6c757d',
                    value: null,
                    isCA,
                  });
                  return;
                }

                const displayValue = unit ? `${normalized} ${unit}` : `${normalized}`;
                const percentage = typeof calculator === "function"
                  ? calculator.call(this, normalized)
                  : 0;

                // Calculate color based on metric type
                let color = '#6c757d'; // default gray
                const tech = currentEntry.technology || 'LTE';
                if (key === 'rssi') {
                  const barResult = this.calculateRSSIBar(normalized, tech);
                  color = barResult.color;
                } else if (key === 'rsrp') {
                  const barResult = this.calculateRSRPBar(normalized, tech);
                  color = barResult.color;
                } else if (key === 'rsrq') {
                  const barResult = this.calculateRSRQBar(normalized, tech);
                  color = barResult.color;
                } else if (key === 'sinr') {
                  const barResult = this.calculateSINRBar(normalized, tech);
                  color = barResult.color;
                }

                detail.metrics.push({
                  key,
                  label,
                  display: displayValue,
                  percentage,
                  color,
                  value: normalized,
                  isCA,
                });
              };

              addMetric(
                "rssi",
                "RSSI",
                currentEntry.metricsData.rssi,
                "dBm",
                this.calculateRSSIPercentage
              );
              addMetric(
                "rsrp",
                "RSRP",
                currentEntry.metricsData.rsrp,
                "dBm",
                this.calculateRSRPPercentage
              );
              addMetric(
                "sinr",
                "SINR",
                currentEntry.metricsData.sinr,
                "dB",
                this.calculateSINRPercentage,
                currentEntry.role === "secondary"
              );
              addMetric(
                "rsrq",
                "RSRQ",
                currentEntry.metricsData.rsrq,
                "dB",
                this.calculateRSRQPercentage
              );

              // Process antennas for display
              let processedAntennas = (currentEntry.antennas || [])
                .filter(antenna => antenna.value !== null) // Filter out null values (NA) before mapping
                .map((antenna, index) => {
                const normalized = roundValue(antenna.value);
                const label = antenna.label || `Antenna ${index + 1}`;

                // Map logical antenna to physical antenna
                let physicalAntenna;
                if (antenna.logicalIndex !== undefined && antenna.logicalIndex >= 0 && antenna.logicalIndex <= 3) {
                  const mapping = currentEntry.technology === 'LTE'
                    ? LTE_LOGICAL_TO_PHYSICAL
                    : getNrMapping(currentEntry.band);
                  physicalAntenna = mapping[antenna.logicalIndex];
                }

                if (normalized === null) {
                  return {
                    label,
                    display: "N/A",
                    percentage: 0,
                    color: '#6c757d',
                    logicalIndex: antenna.logicalIndex,
                    physicalAntenna,
                  };
                }

                const tech = currentEntry.technology || 'LTE';
                const barResult = this.calculateRSRPBar(normalized, tech);

                return {
                  label,
                  display: `${normalized} dBm`,
                  percentage: barResult.percentage,
                  color: barResult.color,
                  logicalIndex: antenna.logicalIndex,
                  physicalAntenna,
                };
              });

              // Add missing physical antennas as "Not Used" for 2x2 MIMO bands
              if (currentEntry.technology === 'NR') {
                const usedPhysicalAntennas = processedAntennas
                  .map(a => a.physicalAntenna)
                  .filter(p => p !== undefined && p !== null);

                const allPhysicalAntennas = [0, 1, 2, 3]; // ANT0, ANT1, ANT2, ANT3
                const missingAntennas = allPhysicalAntennas.filter(p => !usedPhysicalAntennas.includes(p));

                // Add missing antennas as "Not Used"
                missingAntennas.forEach(physicalAntenna => {
                  processedAntennas.push({
                    label: `Antenna ${physicalAntenna}`,
                    display: "Not Used",
                    percentage: 0,
                    logicalIndex: null,
                    physicalAntenna: physicalAntenna,
                  });
                });
              }

              detail.antennas = processedAntennas.sort((a, b) => {
                // Sort by physical antenna number
                const aPhys = a.physicalAntenna ?? 999;
                const bPhys = b.physicalAntenna ?? 999;
                return aPhys - bPhys;
              });

              details.push(detail);
              currentEntry = null;
            };

            for (const rawLine of lines) {
              const line = rawLine.trim();
              if (!line) {
                continue;
              }

              if (line.startsWith("lte_ant_rsrp")) {
                pendingLteAntennas = parseAntennaLine(line, "Antenna");
                const diversityMatch = line.match(/rx_diversity:([0-9]+)/i);
                if (diversityMatch) {
                  pendingLteDiversity = diversityMatch[1];
                }
                continue;
              }

              if (line.startsWith("pcell:")) {
                finalizeEntry();
                currentEntry = {
                  id: `lte-primary-${entryCounter++}`,
                  technology: "LTE",
                  role: "primary",
                  band: null,
                  bandwidth: null,
                  channel: null,
                  pci: null,
                  rxDiversity: pendingLteDiversity,
                  antennas: pendingLteAntennas,
                  metricsData: {},
                };
                pendingLteAntennas = [];
                pendingLteDiversity = null;

                const bandMatch = line.match(/lte_band:(\d+)/i);
                if (bandMatch) {
                  currentEntry.band = bandMatch[1];
                }
                const bwMatch = line.match(/lte_band_width:([^\s]+)/i);
                if (bwMatch) {
                  currentEntry.bandwidth = bwMatch[1];
                }
                continue;
              }

              if (line.startsWith("scell:")) {
                finalizeEntry();
                scellCounter += 1;
                currentEntry = {
                  id: `lte-scell-${entryCounter++}`,
                  technology: "LTE",
                  role: "secondary",
                  caIndex: scellCounter,
                  band: null,
                  bandwidth: null,
                  channel: null,
                  pci: null,
                  rxDiversity: null,
                  antennas: [],
                  metricsData: {},
                };

                const bandMatch = line.match(/lte_band:(\d+)/i);
                if (bandMatch) {
                  currentEntry.band = bandMatch[1];
                }
                const bwMatch = line.match(/lte_band_width:([^\s]+)/i);
                if (bwMatch) {
                  currentEntry.bandwidth = bwMatch[1];
                }
                continue;
              }

              if (
                line.startsWith("channel:") &&
                currentEntry &&
                currentEntry.technology === "LTE"
              ) {
                const channelMatch = line.match(/channel:(\d+)/i);
                if (channelMatch) {
                  currentEntry.channel = channelMatch[1];
                }
                const pciMatch = line.match(/pci:(\d+)/i);
                if (pciMatch) {
                  currentEntry.pci = pciMatch[1];
                }
                continue;
              }

              if (
                line.startsWith("lte_rsrp:") &&
                currentEntry &&
                currentEntry.technology === "LTE"
              ) {
                const rsrpMatch = line.match(/lte_rsrp:([\-\d\.]+)/i);
                if (rsrpMatch) {
                  currentEntry.metricsData.rsrp = parseFloat(rsrpMatch[1]);
                }
                const rsrqMatch = line.match(/rsrq:([\-\d\.]+)/i);
                if (rsrqMatch) {
                  currentEntry.metricsData.rsrq = parseFloat(rsrqMatch[1]);
                }
                continue;
              }

              if (
                line.startsWith("lte_rssi:") &&
                currentEntry &&
                currentEntry.technology === "LTE"
              ) {
                const rssiMatch = line.match(/lte_rssi:([\-\d\.]+)/i);
                if (rssiMatch) {
                  currentEntry.metricsData.rssi = parseFloat(rssiMatch[1]);
                }
                const snrMatch = line.match(/lte_snr:([\-\d\.]+)/i);
                if (snrMatch) {
                  currentEntry.metricsData.sinr = parseFloat(snrMatch[1]);
                }
                continue;
              }

              if (line.startsWith("nr_band:")) {
                finalizeEntry();
                currentEntry = {
                  id: `nr-primary-${entryCounter++}`,
                  technology: "NR",
                  role: "primary",
                  band: null,
                  bandwidth: null,
                  channel: null,
                  pci: null,
                  rxDiversity: null,
                  antennas: [],
                  metricsData: {},
                };
                const bandMatch = line.match(/nr_band:([^\s]+)/i);
                if (bandMatch) {
                  currentEntry.band = bandMatch[1];
                }
                continue;
              }

              if (
                line.startsWith("nr_band_width:") &&
                currentEntry &&
                currentEntry.technology === "NR"
              ) {
                const parts = line.split(":");
                currentEntry.bandwidth = parts.length > 1 ? parts[1].trim() : null;
                continue;
              }

              if (
                line.startsWith("nr_channel:") &&
                currentEntry &&
                currentEntry.technology === "NR"
              ) {
                const parts = line.split(":");
                currentEntry.channel = parts.length > 1 ? parts[1].trim() : null;
                continue;
              }

              if (
                line.startsWith("nr_pci:") &&
                currentEntry &&
                currentEntry.technology === "NR"
              ) {
                const parts = line.split(":");
                currentEntry.pci = parts.length > 1 ? parts[1].trim() : null;
                continue;
              }

              if (
                line.startsWith("nr_rsrp:") &&
                currentEntry &&
                currentEntry.technology === "NR"
              ) {
                const rsrpMatch = line.match(/nr_rsrp:([\-\d\.]+)/i);
                if (rsrpMatch) {
                  currentEntry.metricsData.rsrp = parseFloat(rsrpMatch[1]);
                }
                const diversityMatch = line.match(/rx_diversity:\s*([\d]+)/i);
                if (diversityMatch) {
                  currentEntry.rxDiversity = diversityMatch[1];
                }
                currentEntry.antennas = parseAntennaLine(line, "Antenna");
                continue;
              }

              if (
                line.startsWith("nr_rsrq:") &&
                currentEntry &&
                currentEntry.technology === "NR"
              ) {
                const rsrqMatch = line.match(/nr_rsrq:([\-\d\.]+)/i);
                if (rsrqMatch) {
                  currentEntry.metricsData.rsrq = parseFloat(rsrqMatch[1]);
                }
                continue;
              }

              if (
                line.startsWith("nr_rssi:") &&
                currentEntry &&
                currentEntry.technology === "NR"
              ) {
                const rssiMatch = line.match(/nr_rssi:([\-\d\.]+)/i);
                if (rssiMatch) {
                  currentEntry.metricsData.rssi = parseFloat(rssiMatch[1]);
                }
                continue;
              }

              if (
                line.startsWith("nr_snr:") &&
                currentEntry &&
                currentEntry.technology === "NR"
              ) {
                const snrMatch = line.match(/nr_snr:([\-\d\.]+)/i);
                if (snrMatch) {
                  currentEntry.metricsData.sinr = parseFloat(snrMatch[1]);
                }
                continue;
              }
            }

            finalizeEntry();
            return details;
          };

          this.detailedSignals = buildDetailedSignals();
          this.networkAnalysis = this.buildNetworkAnalysis(this.detailedSignals);

          // --- Temperature ---
          try {
            this.temperature = lines
              .find((line) => line.includes('TSENS:'))
              .split(":")[1]
              .replace(/"/g, "");
          } catch (error) {
            this.temperature = lines
              .find((line) => line.includes('TSENS:'))
              .split(",")[1]
              .replace(/"/g, "");
          }

          // --- PA Temperature ---
          try {
            const paLine = lines.find((line) => line.trim().startsWith('PA:'));
            if (paLine) {
              this.paTemperature = paLine.split(':')[1].trim() || 'Unknown';
            }
          } catch (error) {
            this.paTemperature = 'Unknown';
          }

          // --- Skin Temperature ---
          try {
            const skinLine = lines.find((line) => line.trim().startsWith('Skin Sensor:'));
            if (skinLine) {
              this.skinTemperature = skinLine.split(':')[1].trim() || 'Unknown';
            }
          } catch (error) {
            this.skinTemperature = 'Unknown';
          }
          // --- SIM Status ---
          const sim_status = lines
            .find((line) => line.includes("+CPIN:"))
            .split(":")[1]
            .replace(/"/g, "")
            .trim();
            
          // console.log(sim_status)
          if (sim_status == "READY") {
            this.simStatus = "Active";
          } else {
            this.simStatus = sim_status;
          }
          // --- Active SIM ---
          const current_sim = lines
            .find((line) => line.includes("ENABLE"))
            .split(" ")[0]
            .replace(/\D/g, "");
          if (current_sim == 1) {
            this.activeSim = "SIM 1";
          } else if (current_sim == 2) {
            this.activeSim = "SIM 2";
          } else {
            this.activeSim = "No SIM";
          }
          // --- Network Provider & MCCMNC ---
          // Helper function to remove consecutive duplicate words
          const removeConsecutiveDuplicates = (str) => {
            return str.replace(/(.+)(\s+\1)+/gi, '$1').trim();
          };

          // Try to get operator name from +COPS? first
          const copsLine = lines.find((line) => line.includes("+COPS:"));
          if (copsLine) {
            // Format: +COPS: mode,format,"operator_name",act
            const copsMatch = copsLine.match(/\+COPS:\s*\d+,\d+,"([^"]*)"/);
            if (copsMatch && copsMatch[1]) {
              let operatorName = copsMatch[1].trim();
              // Remove consecutive duplicates like "BetterRoaming BetterRoaming"
              operatorName = removeConsecutiveDuplicates(operatorName);
              this.networkProvider = operatorName || "Unknown";
            } else {
              this.networkProvider = "Unknown";
            }
          } else {
            this.networkProvider = "Unknown";
          }

          // Still extract MCCMNC code from debug output for reference
          const mccLine = lines.find((line) => line.includes("mcc:"));
          if (mccLine) {
            const mccMatch = mccLine.match(/mcc:\s*(\d+)/i);
            const mncMatch = mccLine.match(/mnc:\s*(\d+)/i);
            this.mccmnc =
              mccMatch && mncMatch
                ? `${mccMatch[1]}${mncMatch[1].padStart(2, "0")}`
                : mccLine.replace(/\D/g, "") || "Unknown";
          } else {
            this.mccmnc = "Unknown";
          }
          // --- APN ---
          // find this example value from lines "+CGCONTRDP: 1,0,\"internet.dito.ph\",\"100.65.141.236\",\"36.5.141.64.76.204.39.68.23.210.251.16.49.239.42.149\", \"254.128.0.0.0.0.0.0.0.0.0.0.0.0.0.1\",\"131.226.72.19\",\"131.226.73.19\"\r"
          this.apn = lines
            .find((line) => line.includes("+CGCONTRDP:"))
            .split(",")[2]
            .replace(/"/g, "");
          // --- Network Mode ---
          // Parse RAT field and create badges for display
          const ratLine = lines.find((line) => line.includes('RAT:'));
          const ratValue = ratLine
            ? ratLine.split(":")[1].trim()
            : "Unknown";
          this.networkMode = ratValue;
          
          // Parse RAT value and create badges array
          this.networkModeBadges = [];
          if (ratValue === "LTE+NR") {
            this.networkModeBadges = [
              { label: "LTE", class: "badge-success-modern" },
              { label: "NR-NSA", class: "badge-info-modern" }
            ];
          } else if (ratValue === "LTE") {
            this.networkModeBadges = [
              { label: "LTE", class: "badge-success-modern" }
            ];
          } else if (ratValue === "NR5G_SA") {
            this.networkModeBadges = [
              { label: "NR-SA", class: "badge-purple-dark-modern" }
            ];
          } else {
            // For unknown or other values, show as text
            this.networkModeBadges = [];
          }
          // --- Bands ---
          // Get all the values with LTE BAND n (for example, LTE BAND 3, LTE BAND 1) and then store them in an array
          const bands = lines.filter((line) =>
            line.includes("lte_band:")
          );
          // since it includes the whole line, we need to extract the band part only
          for (let i = 0; i < bands.length; i++) {
            bands[i] = bands[i].split(":")[2].split(" ")[0].replace(/"/g, "");
          }
          // Get all the values with NR BAND n (for example, NR BAND 3, NR BAND 1) and then store them in an array
          const bands_5g = lines.filter((line) =>
            line.includes("nr_band:")
          );
          // since it includes the whole line, we need to extract the band number only
          for (let i = 0; i < bands_5g.length; i++) {
            bands_5g[i] = bands_5g[i].split(":")[1].replace(/"/g, "");
          }
          // Combine the bands and bands_5g arrays seperated by a comma. however, bands or bands_5g can be empty
          if (bands.length > 0 && bands_5g.length > 0) {
            this.bands = bands.join(", ") + ", " + bands_5g.join(", ");
          } else if (bands.length > 0) {
            this.bands = bands.join(", ");
          } else if (bands_5g.length > 0) {
            this.bands = bands_5g.join(", ");
          } else {
            this.bands = "No Bands";
          }
          // --- Bandwidth ---
          const bandwidth = lines.filter((line) =>
            line.includes("lte_band_width:")
          );
          for (let i = 0; i < bandwidth.length; i++) {
            bandwidth[i] = bandwidth[i].split(":")[3].replace(/"/g, "");
          }
          const bandwidth_5gs = lines.filter((line) =>
            line.includes("nr_band_width:")
          );
          console.log(bandwidth_5gs)
          for (let i = 0; i < bandwidth_5gs.length; i++) {
            bandwidth_5gs[i] = bandwidth_5gs[i].split(":")[1];
          }
          if (bandwidth.length > 0 && bandwidth_5gs.length > 0) {
            this.bandwidth = bandwidth.join(", ") + ", " + bandwidth_5gs.join(", ");
          } else if (bandwidth.length > 0) {
            this.bandwidth = bandwidth.join(", ");
          } else if (bandwidth_5gs.length > 0) {
            this.bandwidth = bandwidth_5gs.join(", ");
          } else {
            this.bandwidth = "Unknown Bandwidth";
          }
          // --- E/ARFCN ---
          const lteArfcnLines = lines.filter((line) =>
            line.startsWith("channel:")
          );
          const nrArfcnLines = lines.filter((line) =>
            line.includes("nr_channel:")
          );

          const lteArfcns = lteArfcnLines
            .map((line) => {
              const segment = line.split(":")[1];
              if (!segment) {
                return null;
              }
              return segment.split(" ")[0].trim();
            })
            .filter((value) => value && value.length > 0);

          const nrArfcns = nrArfcnLines
            .map((line) => {
              const segment = line.split(":")[1];
              return segment ? segment.trim() : null;
            })
            .filter((value) => value && value.length > 0);

          const allArfcns = [...lteArfcns, ...nrArfcns];
          if (allArfcns.length > 0) {
            this.earfcns = allArfcns.join(", ");
          } else {
            this.earfcns = "Unknown E/ARFCN";
          }
          // --- PCI ---
          const ltePciLines = lines.filter(
            (line) => line.startsWith("channel:") && line.includes('pci:')
          );
          const nrPciLines = lines.filter((line) =>
            line.includes('nr_pci:')
          );

          const ltePcis = ltePciLines
            .map((line) => {
              const segment = line.split('pci:')[1];
              return segment ? segment.trim().split(' ')[0] : null;
            })
            .filter((value) => value && value.length > 0);

          const nrPcis = nrPciLines
            .map((line) => {
              const segment = line.split(":")[1];
              return segment ? segment.trim() : null;
            })
            .filter((value) => value && value.length > 0);

          const allPcis = [...ltePcis, ...nrPcis];
          if (allPcis.length > 0) {
            this.pccPCI = allPcis.join(", ");
            this.sccPCI = "-";
          } else {
            this.pccPCI = "0";
            this.sccPCI = "-";
          }
          // --- IPv4 and IPv6 ---
          // find the value from line "IPV4"
          this.ipv4 = lines
            .find((line) => line.includes("+CGCONTRDP:"))
            .split(",")[3]
            .replace(/"/g, "");
          // find the value from line "IPV6"
          this.ipv6 = lines
            .find((line) => line.includes("+CGCONTRDP:"))
            .split(",")[4]
            .replace(/"/g, "");

          // Also store in wwanIpv4/wwanIpv6 for device info modal
          this.wwanIpv4 = this.ipv4;
          this.wwanIpv6 = this.ipv6;

          // Signal Informations
          const currentNetworkMode = this.networkMode;
          const hasNRStats = lines.some((line) =>
            line.includes('nr_rsrp:')
          );
          const hasLTEStats = lines.some((line) =>
            line.includes('lte_rsrp:')
          );

          const normalizeCellId = (value) => {
            if (!value) {
              return null;
            }
            const trimmed = value.trim().replace(/"/g, "");
            if (trimmed === "") {
              return null;
            }
            if (/^0x/i.test(trimmed)) {
              return trimmed.replace(/^0x/i, "").toUpperCase();
            }
            if (/^[0-9A-Fa-f]+$/.test(trimmed) && /[A-Fa-f]/.test(trimmed)) {
              return trimmed.toUpperCase();
            }
            const decimalValue = parseInt(trimmed, 10);
            if (Number.isNaN(decimalValue)) {
              return null;
            }
            return decimalValue.toString(16).toUpperCase();
          };

          const formatCellInfo = (hexValue) => {
            if (!hexValue) {
              return null;
            }
            const longDec = parseInt(hexValue, 16);
            const shortHex = hexValue.slice(-2);
            const shortDec = parseInt(shortHex, 16);
            const eNbHex = hexValue.slice(0, -2);
            const eNbDec = eNbHex ? parseInt(eNbHex, 16) : NaN;
            const cellDisplay =
              "Short " +
              shortHex +
              "(" +
              (Number.isNaN(shortDec) ? "-" : shortDec) +
              ")" +
              ", " +
              "Long " +
              hexValue +
              "(" +
              (Number.isNaN(longDec) ? "-" : longDec) +
              ")";
            return {
              display: cellDisplay,
              eNbId: Number.isNaN(eNbDec) ? "-" : eNbDec,
              decimalCellId: Number.isNaN(longDec) ? null : longDec,
            };
          };

          const formatTac = (value) => {
            if (!value) {
              return null;
            }
            const trimmed = value.trim().replace(/"/g, "");
            if (trimmed === "") {
              return null;
            }
            const isHexCandidate = /[A-Fa-f]/.test(trimmed) || /^0x/i.test(trimmed);
            const numericValue = isHexCandidate
              ? parseInt(trimmed, 16)
              : parseInt(trimmed, 10);
            if (Number.isNaN(numericValue)) {
              const fallback = parseInt(trimmed, 16);
              if (Number.isNaN(fallback)) {
                return null;
              }
              return fallback + " (" + trimmed + ")";
            }
            return numericValue + " (" + trimmed + ")";
          };

          let cellInfoSet = false;
          let signalSamples = [];

          if (hasNRStats || hasLTEStats) {
            if (!hasNRStats) {
              this.rsrpNR = "-";
              this.rsrqNR = "-";
              this.sinrNR = "-";
              this.rsrpNRPercentage = 0;
              this.rsrqNRPercentage = 0;
              this.sinrNRPercentage = 0;
              this.eNBIDNR = "-";
            }

            if (!hasLTEStats) {
              this.rsrpLTE = "-";
              this.rsrqLTE = "-";
              this.sinrLTE = "-";
              this.rsrpLTEPercentage = 0;
              this.rsrqLTEPercentage = 0;
              this.sinrLTEPercentage = 0;
              this.eNBIDLTE = "-";
            }

            if (hasLTEStats) {
              const lteCellIdLine = lines.find((line) =>
                line.includes('lte_cell_id:')
              );
              if (lteCellIdLine) {
                const lteCellIdValue = lteCellIdLine.split(":")[1];
                const cellInfo = formatCellInfo(
                  normalizeCellId(lteCellIdValue)
                );
                if (cellInfo) {
                  this.cellID = cellInfo.display;
                  this.eNBIDLTE = cellInfo.eNbId;
                  this.decimalCellId = cellInfo.decimalCellId;
                  cellInfoSet = true;
                }
              }

              const lteTacLine = lines.find((line) =>
                line.includes('lte_tac:')
              );
              if (lteTacLine) {
                const tacValue = lteTacLine.split(":")[1].trim().replace(/"/g, "");
                if (tacValue) {
                  const isHexCandidate = /[A-Fa-f]/.test(tacValue) || /^0x/i.test(tacValue);
                  const numericValue = isHexCandidate
                    ? parseInt(tacValue, 16)
                    : parseInt(tacValue, 10);
                  if (!Number.isNaN(numericValue)) {
                    this.tacLTE = numericValue.toString();
                    this.tac = formatTac(lteTacLine.split(":")[1]);
                  }
                }
              }

              const csqLine = lines.find((line) =>
                line.includes("+CSQ:")
              );
              if (csqLine) {
                this.csq = csqLine
                  .split(" ")[1]
                  .replace("+CSQ: ", "")
                  .replace(/"/g, "");
              } else {
                this.csq = hasNRStats ? "LTE+NR Mode" : "LTE Mode";
              }

              const lteRsrpLine = lines.find((line) =>
                line.includes('lte_rsrp:')
              );
              if (lteRsrpLine) {
                const rsrpParts = lteRsrpLine.split(',');
                const rsrpValue = rsrpParts[0]
                  ? rsrpParts[0].split(":")[1].trim()
                  : null;
                const rsrqValue = rsrpParts[1]
                  ? rsrpParts[1].split(":")[1].trim()
                  : null;
                this.rsrpLTE = rsrpValue || "-";
                this.rsrqLTE = rsrqValue || "-";
              }

              const lteSnrLine = lines.find((line) =>
                line.includes('lte_snr:')
              );
              if (lteSnrLine) {
                const snrSegment = lteSnrLine.split('lte_snr:')[1];
                this.sinrLTE = snrSegment
                  ? snrSegment.trim().split(',')[0]
                  : "-";
              }

              const lteRssiLine = lines.find((line) =>
                line.includes('lte_rssi:')
              );
              if (lteRssiLine) {
                const rssiMatch = lteRssiLine.match(/lte_rssi:([^,\s]+)/i);
                this.rssiLTE = rssiMatch ? rssiMatch[1].trim() : "-";
              } else {
                this.rssiLTE = "-";
              }

              this.rsrpLTEPercentage = this.calculateRSRPPercentage(
                parseFloat(this.rsrpLTE)
              );
              this.rsrqLTEPercentage = this.calculateRSRQPercentage(
                parseFloat(this.rsrqLTE)
              );
              this.sinrLTEPercentage = this.calculateSINRPercentage(
                parseFloat(this.sinrLTE)
              );
              this.rssiLTEPercentage = this.calculateRSSIPercentage(
                parseFloat(this.rssiLTE)
              );

              const lteSignal = this.calculateSignalPercentage(
                this.sinrLTEPercentage,
                this.rsrpLTEPercentage,
                this.rsrqLTEPercentage
              );
              signalSamples.push(lteSignal);
            }

            if (hasNRStats) {
              const nrCellIdLine = lines.find((line) =>
                line.includes('nr_cell_id:')
              );
              if (nrCellIdLine) {
                const nrCellIdValue = nrCellIdLine.split(":")[1];
                const cellInfo = formatCellInfo(
                  normalizeCellId(nrCellIdValue)
                );
                if (cellInfo) {
                  this.cellID = cellInfo.display;
                  this.eNBIDNR = cellInfo.eNbId;
                  this.decimalCellId = cellInfo.decimalCellId;
                  if (!cellInfoSet) {
                    cellInfoSet = true;
                  }
                }
              }

              const nrTacLine = lines.find((line) =>
                line.includes('nr_tac:')
              );
              if (nrTacLine) {
                const tacValue = nrTacLine.split(":")[1].trim().replace(/"/g, "");
                if (tacValue) {
                  const isHexCandidate = /[A-Fa-f]/.test(tacValue) || /^0x/i.test(tacValue);
                  const numericValue = isHexCandidate
                    ? parseInt(tacValue, 16)
                    : parseInt(tacValue, 10);
                  if (!Number.isNaN(numericValue)) {
                    this.tacNR = numericValue.toString();
                    if (!cellInfoSet) {
                      this.tac = formatTac(nrTacLine.split(":")[1]);
                    }
                  }
                }
              }

            }

            if (hasNRStats) {
              if (!hasLTEStats && !lines.some((line) => line.includes("+CSQ:"))) {
                this.csq = "NR Mode";
              }

              const nrRsrpLine = lines.find((line) =>
                line.includes('nr_rsrp:')
              );
              if (nrRsrpLine) {
                const rsrpSegment = nrRsrpLine.split(":")[1];
                this.rsrpNR = rsrpSegment
                  ? rsrpSegment.split(" ")[0].trim()
                  : "-";
              }

              const nrRsrqLine = lines.find((line) =>
                line.includes('nr_rsrq:')
              );
              if (nrRsrqLine) {
                const rsrqSegment = nrRsrqLine.split(":")[1];
                this.rsrqNR = rsrqSegment ? rsrqSegment.trim() : "-";
              }

              const nrSnrLine = lines.find((line) =>
                line.includes('nr_snr:')
              );
              if (nrSnrLine) {
                const snrSegment = nrSnrLine.split(":")[1];
                this.sinrNR = snrSegment ? snrSegment.trim() : "-";
              }

              const nrRssiLine = lines.find((line) =>
                line.includes('nr_rssi:')
              );
              if (nrRssiLine) {
                const rssiMatch = nrRssiLine.match(/nr_rssi:([^,\s]+)/i);
                this.rssiNR = rssiMatch ? rssiMatch[1].trim() : "-";
              } else {
                this.rssiNR = "-";
              }

              this.rsrpNRPercentage = this.calculateRSRPPercentage(
                parseFloat(this.rsrpNR)
              );
              this.rsrqNRPercentage = this.calculateRSRQPercentage(
                parseFloat(this.rsrqNR)
              );
              this.sinrNRPercentage = this.calculateSINRPercentage(
                parseFloat(this.sinrNR)
              );
              this.rssiNRPercentage = this.calculateRSSIPercentage(
                parseFloat(this.rssiNR)
              );

              const nrSignal = this.calculateSignalPercentage(
                this.sinrNRPercentage,
                this.rsrpNRPercentage,
                this.rsrqNRPercentage
              );
              signalSamples.push(nrSignal);
            }

            if (signalSamples.length > 0) {
              const totalSignal = signalSamples.reduce(
                (accumulator, current) => accumulator + current,
                0
              );
              this.signalPercentage = Math.round(
                totalSignal / signalSamples.length
              );
              this.signalAssessment = this.signalQuality(
                this.signalPercentage
              );
            } else {
              this.signalPercentage = 0;
              this.signalAssessment = "No Signal";
            }
          } else if (currentNetworkMode == "5G NSA") {
            // find the value from line "+QENG: \"LTE\" for LTE
            // LongCID
            const longCID = lines
              .find((line) => line.includes('+QENG: "LTE"'))
              .split(",")[4]
              .replace(/"/g, "");
            // Get the eNBID. Its just Cell ID minus the last 2 characters
            this.eNBIDLTE = parseInt(longCID.substring(0, longCID.length - 2), 16);
            // Get the short Cell ID (Last 2 characters of the Cell ID)
            const shortCID = longCID.substring(longCID.length - 2);
            // Store decimal cell ID directly
            this.decimalCellId = parseInt(longCID, 16);
            // cellID
            this.cellID =
              "Short " +
              shortCID +
              "(" +
              parseInt(shortCID, 16) +
              ")" +
              ", " +
              "Long " +
              longCID +
              "(" +
              this.decimalCellId +
              ")";
            // TAC
            const localTac = lines
              .find((line) => line.includes('+QENG: "LTE"'))
              .split(",")[10]
              .replace(/"/g, "");
            const tacNumeric = parseInt(localTac, 16);
            if (!Number.isNaN(tacNumeric)) {
              this.tacLTE = tacNumeric.toString();
              this.tac = tacNumeric + " ("+localTac+")";
            }
            this.cellID =
              "Short " +
              shortCID +
              "(" +
              parseInt(shortCID, 16) +
              ")" +
              ", " +
              "Long " +
              longCID +
              "(" +
              this.decimalCellId +
              ")";
            // CSQ
            this.csq = lines
              .find((line) => line.includes("+CSQ:"))
              .split(" ")[1]
              .replace("+CSQ: ", "")
              .replace(/"/g, "");
            // RSRP LTE
            this.rsrpLTE = lines
              .find((line) => line.includes('+QENG: "LTE"'))
              .split(",")[11]
              .replace(/"/g, "");
            // RSRQ LTE
            this.rsrqLTE = lines
              .find((line) => line.includes('+QENG: "LTE"'))
              .split(",")[12]
              .replace(/"/g, "");
            // RSSI LTE
            this.rssiLTE = lines
              .find((line) => line.includes('+QENG: "LTE"'))
              .split(",")[13]
              .replace(/"/g, "");
            // SINR LTE
            this.sinrLTE = lines
              .find((line) => line.includes('+QENG: "LTE"'))
              .split(",")[14]
              .replace(/"/g, "");
            // Calculate the RSRP LTE Percentage
            this.rsrpLTEPercentage = this.calculateRSRPPercentage(
              parseInt(this.rsrpLTE)
            );
            // Calculate the RSRQ LTE Percentage
            this.rsrqLTEPercentage = this.calculateRSRQPercentage(
              parseInt(this.rsrqLTE)
            );
            // Calculate the SINR LTE Percentage
            this.sinrLTEPercentage = this.calculateSINRPercentage(
              parseInt(this.sinrLTE)
            );
            // Calculate the RSSI LTE Percentage
            this.rssiLTEPercentage = this.calculateRSSIPercentage(
              parseInt(this.rssiLTE)
            );
            // Calculate the Signal Percentage
            const lte_signal_percentage =
              this.calculateSignalPercentage(
                this.sinrLTEPercentage,
                this.rsrpLTEPercentage,
                this.rsrqLTEPercentage
              );
            // RSRP NR
            this.rsrpNR = lines
              .find((line) => line.includes('+QENG: "NR5G-NSA"'))
              .split(",")[4]
              .replace(/"/g, "");
            // SINR NR
            this.sinrNR = lines
              .find((line) => line.includes('+QENG: "NR5G-NSA"'))
              .split(",")[5]
              .replace(/"/g, "");
            // RSRQ NR
            this.rsrqNR = lines
              .find((line) => line.includes('+QENG: "NR5G-NSA"'))
              .split(",")[6]
              .replace(/"/g, "");
            try {
              this.rssiNR = lines
                .find((line) => line.includes('+QENG: "NR5G-NSA"'))
                .split(",")[7]
                .replace(/"/g, "");
            } catch (error) {
              this.rssiNR = "-";
            }
            // Calculate the RSRP NR Percentage
            this.rsrpNRPercentage = this.calculateRSRPPercentage(
              parseInt(this.rsrpNR)
            );
            // Calculate the RSRQ NR Percentage
            this.rsrqNRPercentage = this.calculateRSRQPercentage(
              parseInt(this.rsrqNR)
            );
            // Calculate the SINR NR Percentage
            this.sinrNRPercentage = this.calculateSINRPercentage(
              parseInt(this.sinrNR)
            );
            // Calculate the RSSI NR Percentage
            this.rssiNRPercentage = this.calculateRSSIPercentage(
              parseInt(this.rssiNR)
            );
            // Calculate the Signal Percentage
            const nr_signal_percentage = this.calculateSignalPercentage(
              this.sinrNRPercentage,
              this.rsrpNRPercentage,
              this.rsrqNRPercentage
            );
            // Average the LTE and NR Signal Percentages
            this.signalPercentage =
              (lte_signal_percentage + nr_signal_percentage) / 2;
            // Calculate the Signal Assessment
            this.signalAssessment = this.signalQuality(
              this.signalPercentage
            );
          } else {
            this.signalAssessment = "No Signal";
          }

          // Parse SIM info: IMSI, ICCID, Phone Number, Device Info
          let ctx = null;
          for (const line of lines) {
            const trimmed = line.trim();

            // Track context for multi-line AT command responses
            if (trimmed.startsWith("AT+")) {
              ctx = trimmed;
              continue;
            }

            // Parse IMSI (15 digits) - only in AT+CIMI context
            if (ctx?.startsWith("AT+CIMI") && /^\d{15}$/.test(trimmed)) {
              this.imsi = trimmed;
              ctx = null;
              continue;
            }
            // Fallback IMSI detection
            if ((!this.imsi || this.imsi === "Unknown" || this.imsi === "-") && /^\d{15}$/.test(trimmed) && !trimmed.startsWith("89") && trimmed !== this.imei) {
              this.imsi = trimmed;
              continue;
            }

            // Parse ICCID
            if (trimmed.startsWith('ICCID:')) {
              this.iccid = trimmed.replace('ICCID:', '').trim();
            } else if (trimmed.startsWith('+ICCID:')) {
              const parts = trimmed.split(':');
              if (parts[1]) {
                this.iccid = parts[1].replace(/"/g, '').trim();
              }
            }

            // Parse phone number
            if (trimmed.includes('+CNUM:')) {
              const match = trimmed.match(/,"?(\+?\d+)"?/);
              if (match && match[1]) {
                this.phoneNumber = match[1];
              }
            }

            // Parse IMEI (from AT+CGSN context or +CGSN: response)
            if (ctx?.startsWith("AT+CGSN")) {
              const imeiMatch = trimmed.match(/(\d{15,17})/);
              if (imeiMatch) {
                this.imei = imeiMatch[1].substring(0, 15);
              }
              ctx = null;
              continue;
            }
            if (trimmed.includes('+CGSN:')) {
              const imeiMatch = trimmed.match(/(\d{15,17})/);
              if (imeiMatch) {
                this.imei = imeiMatch[1].substring(0, 15);
              }
              continue;
            }
            // Fallback IMEI detection (only if not already found)
            if ((this.imei === "Unknown" || this.imei === "-" || !this.imei) && /^\d{15,17}$/.test(trimmed) && !trimmed.startsWith("89") && trimmed !== this.imsi) {
              this.imei = trimmed.substring(0, 15);
              continue;
            }

            // Parse firmware version (^VERSION?)
            if (trimmed.startsWith('^VERSION:')) {
              this.firmwareVersion = trimmed.split(':')[1]?.trim() || trimmed;
              // Extract model name from version if not yet set
              if (this.modelName === "-") {
                const modelMatch = this.firmwareVersion.match(/^([A-Za-z0-9_-]+)/);
                if (modelMatch) {
                  this.modelName = modelMatch[1];
                }
              }
            }

            // Parse manufacturer (+CGMI)
            if (ctx?.startsWith("AT+CGMI")) {
              this.manufacturer = trimmed;
              ctx = null;
              continue;
            }
            // Fallback manufacturer detection
            if (this.manufacturer === "-" && /QUALCOMM|QUECTEL|HUAWEI|FIBOCOM|Sierra|Foxconn/i.test(trimmed)) {
              this.manufacturer = trimmed;
            }

            // Parse model name (+CGMM)
            if (ctx?.startsWith("AT+CGMM")) {
              this.modelName = trimmed;
              ctx = null;
              continue;
            }
          }

        this.lastUpdate = new Date().toLocaleString();
      } catch (parseError) {
        console.error("Error while parsing the AT response", parseError);
        this.applyFallback("Failed to parse the AT response.");
      }
    } catch (error) {
      console.error("Error while executing the AT command", error);
      this.applyFallback(
        error.message || "Unknown error occurred during the AT request."
      );
    }

    // Fetch LAN IP (this works even without SIM)
    fetch("/cgi-bin/get_lanip")
      .then(res => res.json())
      .then(data => {
        this.lanIp = data.lanip;
      })
      .catch(error => {
        console.error("Error fetching LAN IP:", error);
      });
  },


  bytesToSize(bytes) {
    const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
    if (bytes == 0) return "0 Byte";
    const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)));
    return Math.round(bytes / Math.pow(1024, i), 2) + " " + sizes[i];
  },

  requestPing() {
    // Create timeout controller (10 seconds)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    return fetch("/cgi-bin/get_ping", { signal: controller.signal })
      .then((response) => {
        clearTimeout(timeoutId);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
      })
      .then((data) => {
        // Save detailed connection data for the modal
        if (data.ping && data.dns) {
          this.connectionDetails = {
            ping: data.ping,
            dns: data.dns
          };
        }
        return data;
      })
      .catch((error) => {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
          console.error("Ping request timeout");
          throw new Error('Request timeout');
        }
        console.error("Error:", error);
        throw error;
      });
  },

  calculate_lte_bw(lte_bw) {
    const BANDWIDTH_MAP = {
      0: 1.4,
      1: 3,
      2: 5,
      3: 10,
      4: 15,
      5: 20,
      6: 40,
      7: 80,
      8: 100,
      9: 200,
    };
    return BANDWIDTH_MAP[lte_bw];
  },

  calculate_nr_bw(nr_bw) {
    const NR_BANDWIDTH_MAP = {
      0: 5,
      1: 10,
      2: 15,
      3: 20,
      4: 25,
      5: 30,
      6: 40,
      7: 50,
      8: 60,
      9: 70,
      10: 80,
      11: 90,
      12: 100,
      13: 200,
      14: 400,
    };
    return NR_BANDWIDTH_MAP[nr_bw];
  },

  /**
   * Signal quality thresholds configuration.
   * Each metric type has thresholds for different quality levels with colors directly defined.
   * Thresholds are ordered from best (green_dark) to worst (min).
   */
  signalThresholds: {
    RSSI: {
      unit: 'dBm',
      range: { min: -130, max: 0 },
      thresholds: {
        green_dark: { value: 0, color: '#006400' },      // Dark green
        green: { value: -75, color: '#28a745' },         // Green
        yellow: { value: -85, color: '#ffc107' },         // Yellow
        orange: { value: -95, color: '#fd7e14' },         // Orange
        red: { value: -105, color: '#dc3545' },           // Red
        min: { value: -130, color: '#6c757d' }            // Gray (below minimum)
      }
    },
    RSRP: {
      unit: 'dBm',
      range: { min: -140, max: -10 },
      thresholds: {
        green_dark: { value: -10, color: '#006400' },     // Dark green
        green: { value: -85, color: '#28a745' },          // Green
        yellow: { value: -95, color: '#ffc107' },         // Yellow
        orange: { value: -105, color: '#fd7e14' },        // Orange
        red: { value: -115, color: '#dc3545' },           // Red
        min: { value: -140, color: '#6c757d' }           // Gray (below minimum)
      }
    },
    RSRQ: {
      unit: 'dB',
      range: { min: -40, max: 20 },
      thresholds: {
        green_dark: { value: 20, color: '#006400' },     // Dark green
        green: { value: -6, color: '#28a745' },           // Green
        yellow: { value: -10, color: '#ffc107' },          // Yellow
        orange: { value: -15, color: '#fd7e14' },         // Orange
        red: { value: -20, color: '#dc3545' },            // Red
        min: { value: -40, color: '#6c757d' }             // Gray (below minimum)
      }
    },
    SINR: {
      unit: 'dB',
      range: { min: -30, max: 50 }, // Default for LTE, NR uses -50
      thresholds: {
        green_dark: { value: 50, color: '#006400' },       // Dark green
        green: { value: 22, color: '#28a745' },            // Green
        yellow: { value: 15, color: '#ffc107' },           // Yellow
        orange: { value: 10, color: '#fd7e14' },          // Orange
        red: { value: 3, color: '#dc3545' },              // Red
        min: { value: -30, color: '#6c757d' }            // Gray (below minimum, -50 for NR)
      }
    },
    CPU: {
      unit: '%',
      range: { min: 0, max: 100 },
      thresholds: {
        green: { value: 50, color: '#28a745' },           // Green (< 50%)
        yellow: { value: 80, color: '#ffc107' },          // Yellow (50-80%)
        red: { value: 100, color: '#dc3545' }             // Red (>= 80%)
      }
    },
    Memory: {
      unit: '%',
      range: { min: 0, max: 100 },
      thresholds: {
        green: { value: 50, color: '#28a745' },           // Green (< 50%)
        yellow: { value: 80, color: '#ffc107' },          // Yellow (50-80%)
        red: { value: 100, color: '#dc3545' }             // Red (>= 80%)
      }
    }
  },

  signalPercentagePoints: {
  SINR: [
    [-30, 0],
    [3, 20],
    [10, 40],
    [15, 65],
    [22, 85],
    [50, 100],
  ],
  RSRP: [
    [-140, 0],
    [-115, 20],
    [-105, 40],
    [-95, 65],
    [-85, 85],
    [-10, 100],
  ],
  RSRQ: [
    [-40, 0],
    [-20, 20],
    [-15, 40],
    [-10, 65],
    [-6, 85],
    [20, 100],
  ],
  RSSI: [
    [-130, 0],
    [-105, 20],
    [-95, 40],
    [-85, 65],
    [-75, 85],
    [0, 100],
  ]
},


  /**
   * Determines the color based on value and thresholds.
   * @param {number} value - The signal value
   * @param {Object} thresholds - Threshold configuration object with color definitions
   * @param {boolean} [inverted=false] - If true, lower values are better (for CPU/Memory)
   * @returns {string} CSS color value (hex color)
   */
  getSignalColor(value, thresholds, inverted = false) {
    // Ensure value is a number
    const numValue = typeof value === 'number' ? value : parseFloat(value);
    
    if (isNaN(numValue) || numValue === null || numValue === undefined) {
      return thresholds.min?.color || '#6c757d';
    }

    if (inverted) {
      // For inverted thresholds (CPU/Memory): lower is better
      // Check from best (lowest threshold) to worst (highest threshold)
      if (thresholds.green && numValue < thresholds.green.value) {
        return thresholds.green.color;
      } else if (thresholds.yellow && numValue < thresholds.yellow.value) {
        return thresholds.yellow.color;
      } else if (thresholds.red && numValue < thresholds.red.value) {
        return thresholds.red.color;
      } else {
        return thresholds.red?.color || '#dc3545'; // >= red threshold
      }
    } else {
      // For normal thresholds (signal metrics): higher is better
      // Check thresholds from best to worst
      if (thresholds.green_dark && typeof thresholds.green_dark.value === 'number' && numValue >= thresholds.green_dark.value) {
        return thresholds.green_dark.color;
      } else if (thresholds.green && typeof thresholds.green.value === 'number' && numValue >= thresholds.green.value) {
        return thresholds.green.color;
      } else if (thresholds.yellow && typeof thresholds.yellow.value === 'number' && numValue >= thresholds.yellow.value) {
        return thresholds.yellow.color;
      } else if (thresholds.orange && typeof thresholds.orange.value === 'number' && numValue >= thresholds.orange.value) {
        return thresholds.orange.color;
      } else if (thresholds.red && typeof thresholds.red.value === 'number' && numValue >= thresholds.red.value) {
        return thresholds.red.color;
      } else if (thresholds.min && typeof thresholds.min.value === 'number' && numValue >= thresholds.min.value) {
        return thresholds.red?.color || thresholds.min.color; // below red threshold but above min
      } else {
        return thresholds.min?.color || '#6c757d'; // below minimum
      }
    }
  },

  hexToRgb(hex) {
    const cleanHex = hex.replace('#', '');
    if (cleanHex.length !== 6) {
      return null;
    }
    const num = parseInt(cleanHex, 16);
    return {
      r: (num >> 16) & 255,
      g: (num >> 8) & 255,
      b: num & 255,
    };
  },

  rgbToHex({ r, g, b }) {
    const toHex = (value) => value.toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  },

  interpolateColor(colorA, colorB, factor) {
    const rgbA = this.hexToRgb(colorA);
    const rgbB = this.hexToRgb(colorB);
    if (!rgbA || !rgbB) {
      return colorA || colorB || '#6c757d';
    }
    const clampFactor = Math.min(1, Math.max(0, factor));
    const mix = (start, end) =>
      Math.round(start + (end - start) * clampFactor);
    return this.rgbToHex({
      r: mix(rgbA.r, rgbB.r),
      g: mix(rgbA.g, rgbB.g),
      b: mix(rgbA.b, rgbB.b),
    });
  },

  getInterpolatedSignalColor(value, thresholds, inverted = false) {
    const numValue = typeof value === 'number' ? value : parseFloat(value);
    if (isNaN(numValue) || numValue === null || numValue === undefined) {
      return thresholds.min?.color || '#6c757d';
    }

    const stops = Object.values(thresholds)
      .filter((threshold) => typeof threshold?.value === 'number')
      .map((threshold) => ({ value: threshold.value, color: threshold.color }))
      .sort((a, b) => a.value - b.value);

    if (stops.length === 0) {
      return '#6c757d';
    }

    if (numValue <= stops[0].value) {
      return stops[0].color;
    }
    if (numValue >= stops[stops.length - 1].value) {
      return stops[stops.length - 1].color;
    }

    for (let i = 0; i < stops.length - 1; i++) {
      const start = stops[i];
      const end = stops[i + 1];
      if (numValue >= start.value && numValue <= end.value) {
        const range = end.value - start.value;
        if (range === 0) {
          return end.color;
        }
        const factor = (numValue - start.value) / range;
        return inverted
          ? this.interpolateColor(start.color, end.color, factor)
          : this.interpolateColor(start.color, end.color, factor);
      }
    }

    return stops[stops.length - 1].color;
  },

  clampValue(value, min, max) {
    return Math.min(Math.max(value, min), max);
  },

  lerpValue(value, x1, y1, x2, y2) {
    return y1 + ((value - x1) / (x2 - x1)) * (y2 - y1);
  },

  piecewisePercentage(value, points) {
    const numValue = typeof value === 'number' ? value : parseFloat(value);
    if (isNaN(numValue) || !Array.isArray(points) || points.length === 0) {
      return 0;
    }

    const [x0, y0] = points[0];
    const [xn, yn] = points[points.length - 1];

    if (numValue <= x0) {
      return y0;
    }
    if (numValue >= xn) {
      return yn;
    }

    for (let i = 0; i < points.length - 1; i++) {
      const [x1, y1] = points[i];
      const [x2, y2] = points[i + 1];
      if (numValue >= x1 && numValue <= x2) {
        return this.lerpValue(numValue, x1, y1, x2, y2);
      }
    }

    return yn;
  },

  /**
   * Calculates percentage based on value within a range.
   * @param {number} value - The signal value
   * @param {number} min - Minimum value in the range
   * @param {number} max - Maximum value in the range
   * @returns {number} Percentage (0-100)
   */
  calculatePercentage(value, min, max) {
    if (isNaN(value)) {
      return 0;
    }

    // Clamp value to range
    if (value <= min) {
      return 0;
    }
    if (value >= max) {
      return 100;
    }

    // Calculate percentage
    const percentage = ((value - min) / (max - min)) * 100;
    
    // Ensure minimum visibility (at least 15% if value is above min)
    if (percentage > 0 && percentage < 15) {
      return 15;
    }

    return Math.round(percentage);
  },

  /**
   * Calculates RSSI bar graph properties (color and percentage).
   * @param {number} rssi - RSSI value in dBm
   * @param {string} [technology='LTE'] - Technology type ('LTE' or 'NR')
   * @returns {Object} Object with color (threshold level name) and percentage properties
   * @returns {string} returns.color - Threshold level: 'green_dark', 'green', 'yellow', 'orange', 'red', or 'min'
   * @returns {number} returns.percentage - Percentage value (0-100)
   */
  calculateRSSIBar(rssi, technology = 'LTE') {
    const config = this.signalThresholds.RSSI;
    
    // Ensure rssi is a number
    const numRssi = typeof rssi === 'number' ? rssi : parseFloat(rssi);
    
    if (isNaN(numRssi)) {
      return { color: '#6c757d', percentage: 0 };
    }
    
    const percentage = Math.round(
      this.piecewisePercentage(numRssi, this.signalPercentagePoints.RSSI)
    );
    const color = this.getInterpolatedSignalColor(numRssi, config.thresholds);
    
    return { color, percentage };
  },

  /**
   * Calculates RSRP bar graph properties (color and percentage).
   * @param {number} rsrp - RSRP value in dBm
   * @param {string} [technology='LTE'] - Technology type ('LTE' or 'NR')
   * @returns {Object} Object with color (threshold level name) and percentage properties
   * @returns {string} returns.color - Threshold level: 'green_dark', 'green', 'yellow', 'orange', 'red', or 'min'
   * @returns {number} returns.percentage - Percentage value (0-100)
   */
  calculateRSRPBar(rsrp, technology = 'LTE') {
    const config = this.signalThresholds.RSRP;
    
    // Ensure rsrp is a number
    const numRsrp = typeof rsrp === 'number' ? rsrp : parseFloat(rsrp);
    
    if (isNaN(numRsrp)) {
      return { color: '#6c757d', percentage: 0 };
    }
    
    const percentage = Math.round(
      this.piecewisePercentage(numRsrp, this.signalPercentagePoints.RSRP)
    );
    const color = this.getInterpolatedSignalColor(numRsrp, config.thresholds);
    
    return { color, percentage };
  },

  /**
   * Calculates RSRQ bar graph properties (color and percentage).
   * @param {number} rsrq - RSRQ value in dB
   * @param {string} [technology='LTE'] - Technology type ('LTE' or 'NR')
   * @returns {Object} Object with color (threshold level name) and percentage properties
   * @returns {string} returns.color - Threshold level: 'green_dark', 'green', 'yellow', 'orange', 'red', or 'min'
   * @returns {number} returns.percentage - Percentage value (0-100)
   */
  calculateRSRQBar(rsrq, technology = 'LTE') {
    const config = this.signalThresholds.RSRQ;
    
    // Ensure rsrq is a number
    const numRsrq = typeof rsrq === 'number' ? rsrq : parseFloat(rsrq);
    
    if (isNaN(numRsrq)) {
      return { color: '#6c757d', percentage: 0 };
    }
    
    const percentage = Math.round(
      this.piecewisePercentage(numRsrq, this.signalPercentagePoints.RSRQ)
    );
    const color = this.getInterpolatedSignalColor(numRsrq, config.thresholds);
    
    return { color, percentage };
  },

  /**
   * Calculates SINR bar graph properties (color and percentage).
   * @param {number} sinr - SINR value in dB
   * @param {string} [technology='LTE'] - Technology type ('LTE' or 'NR')
   * @returns {Object} Object with color (CSS hex color) and percentage properties
   * @returns {string} returns.color - CSS hex color value
   * @returns {number} returns.percentage - Percentage value (0-100)
   */
  calculateSINRBar(sinr, technology = 'LTE') {
    const config = this.signalThresholds.SINR;
    
    // Ensure sinr is a number
    const numSinr = typeof sinr === 'number' ? sinr : parseFloat(sinr);
    
    if (isNaN(numSinr)) {
      return { color: '#6c757d', percentage: 0 };
    }
    
    const percentage = Math.round(
      this.piecewisePercentage(numSinr, this.signalPercentagePoints.SINR)
    );
    
    // Adjust thresholds for NR - update min value
    const thresholds = technology === 'NR' 
      ? { 
          ...config.thresholds, 
          min: { value: -50, color: config.thresholds.min.color }
        }
      : config.thresholds;
    
    const color = this.getInterpolatedSignalColor(numSinr, thresholds);
    
    return { color, percentage };
  },

  /**
   * Calculates CPU usage bar graph properties (color and percentage).
   * @param {number} cpuUsage - CPU usage percentage (0-100)
   * @returns {Object} Object with color (CSS hex color) and percentage properties
   * @returns {string} returns.color - CSS hex color value
   * @returns {number} returns.percentage - Percentage value (0-100)
   */
  calculateCPUBar(cpuUsage) {
    const config = this.signalThresholds.CPU;
    
    const percentage = Math.min(100, Math.max(0, Math.round(cpuUsage)));
    const color = this.getSignalColor(percentage, config.thresholds, true); // inverted: lower is better
    
    return { color, percentage };
  },

  /**
   * Calculates Memory usage bar graph properties (color and percentage).
   * @param {number} memPercent - Memory usage percentage (0-100)
   * @returns {Object} Object with color (CSS hex color) and percentage properties
   * @returns {string} returns.color - CSS hex color value
   * @returns {number} returns.percentage - Percentage value (0-100)
   */
  calculateMemoryBar(memPercent) {
    const config = this.signalThresholds.Memory;
    
    const percentage = Math.min(100, Math.max(0, Math.round(memPercent)));
    const color = this.getSignalColor(percentage, config.thresholds, true); // inverted: lower is better
    
    return { color, percentage };
  },

  // Legacy functions for backward compatibility - now use the new bar functions
  calculateRSSIPercentage(rssi) {
    const result = this.calculateRSSIBar(rssi);
    return result.percentage;
  },

  calculateRSRPPercentage(rsrp) {
    const result = this.calculateRSRPBar(rsrp);
    return result.percentage;
  },

  calculateRSRQPercentage(rsrq) {
    const result = this.calculateRSRQBar(rsrq);
    return result.percentage;
  },

  calculateSINRPercentage(sinr) {
    const result = this.calculateSINRBar(sinr);
    return result.percentage;
  },

  buildNetworkAnalysis(detailedSignals) {
    if (!Array.isArray(detailedSignals) || detailedSignals.length === 0) {
      return null;
    }

    const carriers = detailedSignals.map((entry) => {
      const getMetricValue = (key) => {
        const metric = Array.isArray(entry.metrics)
          ? entry.metrics.find((item) => item.key === key)
          : null;
        return metric && typeof metric.value === "number" ? metric.value : null;
      };

      const bandRaw = entry.band || entry.bandDisplay || "";
      const bandNumber = typeof bandRaw === "number"
        ? bandRaw
        : parseInt(String(bandRaw).replace(/\D/g, ""), 10);

      return {
        rat: entry.technology,
        role: entry.role,
        band: Number.isNaN(bandNumber) ? null : bandNumber,
        rsrp_dBm: getMetricValue("rsrp"),
        rsrq_dB: getMetricValue("rsrq"),
        sinr_dB: getMetricValue("sinr"),
        rssi_dBm: getMetricValue("rssi"),
      };
    });

    const lteCarriers = carriers.filter((carrier) => carrier.rat === "LTE");
    const nrCarriers = carriers.filter((carrier) => carrier.rat === "NR");
    const lteSecondaryCarriers = lteCarriers.filter((carrier) => carrier.role === "secondary");
    const lteSecondaryCount = lteSecondaryCarriers.length;

    const median = (values) => {
      const items = values.filter((value) => typeof value === "number").sort((a, b) => a - b);
      if (items.length === 0) {
        return null;
      }
      const mid = Math.floor(items.length / 2);
      return items.length % 2 === 0
        ? (items[mid - 1] + items[mid]) / 2
        : items[mid];
    };

    const getBandCenterMHz = (rat, band) => {
      if (!band) {
        return null;
      }

      const lteBandsMHz = {
        1: { dlMin: 2110, dlMax: 2170 },
        3: { dlMin: 1805, dlMax: 1880 },
        7: { dlMin: 2620, dlMax: 2690 },
        8: { dlMin: 925, dlMax: 960 },
        20: { dlMin: 791, dlMax: 821 },
        28: { dlMin: 758, dlMax: 803 },
        32: { dlMin: 1452, dlMax: 1496 },
        38: { dlMin: 2570, dlMax: 2620 },
      };

      const nrBandsMHz = {
        28: { dlMin: 758, dlMax: 803 },
        38: { dlMin: 2570, dlMax: 2620 },
        78: { dlMin: 3300, dlMax: 3800 },
      };

      const table = rat === "NR" ? nrBandsMHz : lteBandsMHz;
      const bandInfo = table[band];
      if (!bandInfo) {
        return null;
      }
      return (bandInfo.dlMin + bandInfo.dlMax) / 2;
    };

    const getTier = (band, rat) => {
      const centerMHz = getBandCenterMHz(rat, band);
      if (typeof centerMHz !== "number") {
        return null;
      }
      if (centerMHz < 1000) {
        return "LOW";
      }
      if (centerMHz < 2300) {
        return "MID";
      }
      return "HIGH";
    };

    const buildScores = (carrier) => {
      const sinrPct = typeof carrier.sinr_dB === "number"
        ? this.calculateSINRPercentage(carrier.sinr_dB)
        : 0;
      const rsrpPct = typeof carrier.rsrp_dBm === "number"
        ? this.calculateRSRPPercentage(carrier.rsrp_dBm)
        : 0;
      const rsrqPct = typeof carrier.rsrq_dB === "number"
        ? this.calculateRSRQPercentage(carrier.rsrq_dB)
        : 0;
      return this.calculateSignalPercentage(sinrPct, rsrpPct, rsrqPct);
    };

    const lteScores = lteCarriers.map(buildScores);
    const nrScores = nrCarriers.map(buildScores);

    const lteRsrpMed = median(lteCarriers.map((carrier) => carrier.rsrp_dBm));
    const lteRsrqMed = median(lteCarriers.map((carrier) => carrier.rsrq_dB));
    const lteSinrMed = median(lteCarriers.map((carrier) => carrier.sinr_dB));
    const lteScoreMed = median(lteScores);

    const nrRsrpMed = median(nrCarriers.map((carrier) => carrier.rsrp_dBm));
    const nrRsrqMed = median(nrCarriers.map((carrier) => carrier.rsrq_dB));
    const nrSinrMed = median(nrCarriers.map((carrier) => carrier.sinr_dB));
    const nrScoreMed = median(nrScores);

    const lteLowBands = lteCarriers.filter((carrier) => {
      const tier = getTier(carrier.band, "LTE");
      return tier === "LOW" || tier === "MID";
    });
    const lteHighBands = lteCarriers.filter((carrier) => getTier(carrier.band, "LTE") === "HIGH");

    const lteLowRsrpMed = median(lteLowBands.map((carrier) => carrier.rsrp_dBm));
    const lteHighRsrpMed = median(lteHighBands.map((carrier) => carrier.rsrp_dBm));
    const lteHighCount = lteHighBands.length;

    const adjustedHighRsrp = typeof lteHighRsrpMed === "number" ? lteHighRsrpMed : -140;
    const deltaLowHigh = typeof lteLowRsrpMed === "number"
      ? lteLowRsrpMed - adjustedHighRsrp
      : null;

    const lteBestRsrp = lteCarriers.reduce((best, carrier) => {
      if (typeof carrier.rsrp_dBm !== "number") {
        return best;
      }
      return best === null ? carrier.rsrp_dBm : Math.max(best, carrier.rsrp_dBm);
    }, null);

    const lteCaCount = lteCarriers.length;
    const nrCount = nrCarriers.length;

    const caSinrZeroCount = lteSecondaryCarriers.filter((carrier) =>
      typeof carrier.sinr_dB === "number" && Math.abs(carrier.sinr_dB) === 0
    ).length;
    const warnCaSinrZero = lteSecondaryCount > 0 &&
      (caSinrZeroCount > 1 || (caSinrZeroCount === lteSecondaryCount && caSinrZeroCount > 0));
    const warnCaReleased = lteCarriers.length > 0 && lteSecondaryCount === 0;

    const lteCongested = typeof lteRsrpMed === "number" &&
      lteRsrpMed >= -95 &&
      ((typeof lteSinrMed === "number" && lteSinrMed <= 3) ||
        (typeof lteRsrqMed === "number" && lteRsrqMed <= -12));

    const nrCongested = nrCount > 0 &&
      typeof nrRsrpMed === "number" &&
      nrRsrpMed >= -95 &&
      ((typeof nrSinrMed === "number" && nrSinrMed <= 3) ||
        (typeof nrRsrqMed === "number" && nrRsrqMed <= -12));

    const formatValue = (value, unit) => {
      if (typeof value !== "number") {
        return "N/A";
      }
      const rounded = Math.round(value * 10) / 10;
      return unit ? `${rounded} ${unit}` : `${rounded}`;
    };

    const buildConfidence = ({ strong = false } = {}) => {
      let confidence = 50;
      if (lteCaCount >= 3) {
        confidence += 10;
      }
      if (lteHighCount > 0) {
        confidence += 10;
      }
      if (strong) {
        confidence += 10;
      }
      return Math.min(100, Math.max(0, confidence));
    };

    const secondaryNotes = [];

    const buildSecondaryNotes = (notes) => {
      const combined = Array.isArray(notes) ? [...notes] : [];
      if (warnCaSinrZero) {
        combined.push("CA SINR can stay at 0 dB on secondary carriers when there is no traffic; rules may be influenced during idle periods.");
      }
      if (warnCaReleased) {
        combined.push("When there is no traffic the modem may release all CA carriers; some rules can trigger even if coverage is unchanged.");
      }
      return combined;
    };

    if (!lteCongested && !nrCongested) {
      const overallGood = (typeof lteScoreMed === "number" && lteScoreMed >= 80) ||
        (nrCount > 0 && typeof nrScoreMed === "number" && nrScoreMed >= 80);
      if (overallGood) {
        return {
          primary_title: "No issues detected",
          primary_message: "Signal quality looks good across the observed carriers.",
          why: [],
          suggestions: [],
          secondary_notes: buildSecondaryNotes([]),
        };
      }
    }

    const ruleA =
      typeof lteLowRsrpMed === "number" &&
      lteLowRsrpMed >= -95 &&
      (lteHighCount === 0 || (typeof lteHighRsrpMed === "number" && lteHighRsrpMed <= -108)) &&
      typeof deltaLowHigh === "number" &&
      deltaLowHigh >= 12;

    if (ruleA) {
      const confidence = buildConfidence({ strong: deltaLowHigh >= 18 });
      if (confidence >= 60) {
        return {
          primary_title: "Likely far from the antenna / strong attenuation",
          primary_message: "Low-band LTE looks healthy while higher bands are weak or missing.",
          why: [
            `LTE low-band median RSRP: ${formatValue(lteLowRsrpMed, "dBm")}`,
            `LTE high-band median RSRP: ${formatValue(lteHighRsrpMed, "dBm")} (${lteHighCount} bands)`,
            `Low vs high delta: ${formatValue(deltaLowHigh, "dB")}`,
          ],
          suggestions: [
            "Move the router toward a window or higher position.",
            "Try small rotations/repositioning (especially with directional antennas).",
          ],
          secondary_notes: buildSecondaryNotes([]),
        };
      }
      secondaryNotes.push("Possible low vs high band imbalance (distance/attenuation).");
    }

    if (lteCongested || nrCongested) {
      const strong = (typeof lteSinrMed === "number" && lteSinrMed < 0) ||
        (typeof lteRsrqMed === "number" && lteRsrqMed < -15) ||
        (typeof nrSinrMed === "number" && nrSinrMed < 0) ||
        (typeof nrRsrqMed === "number" && nrRsrqMed < -15);
      const confidence = buildConfidence({ strong });
      if (confidence >= 60) {
        let title = "Likely congestion/interference";
        if (lteCongested && !nrCongested) {
          title = "Likely 4G cell congestion/interference";
        } else if (nrCongested && !lteCongested) {
          title = "Likely 5G cell congestion/interference";
        } else if (lteCongested && nrCongested) {
          title = "Likely 4G/5G congestion/interference";
        }
        const why = [];
        if (lteCongested) {
          why.push(`LTE RSRP median: ${formatValue(lteRsrpMed, "dBm")}`);
          why.push(`LTE SINR median: ${formatValue(lteSinrMed, "dB")}`);
          why.push(`LTE RSRQ median: ${formatValue(lteRsrqMed, "dB")}`);
        }
        if (nrCongested) {
          why.push(`NR RSRP median: ${formatValue(nrRsrpMed, "dBm")}`);
          why.push(`NR SINR median: ${formatValue(nrSinrMed, "dB")}`);
          why.push(`NR RSRQ median: ${formatValue(nrRsrqMed, "dB")}`);
        }
        return {
          primary_title: title,
          primary_message: "Strong signal levels with low quality typically indicate congestion or interference.",
          why,
          suggestions: [
            "Try a different band/cell if your UI supports locking.",
            "Test at different times of day.",
            "If using a directional antenna, try small re-aim adjustments.",
          ],
          secondary_notes: buildSecondaryNotes([]),
        };
      }
      secondaryNotes.push("Possible congestion/interference detected.");
    }

    const ruleC = lteCaCount >= 3 &&
      typeof lteScoreMed === "number" &&
      lteScoreMed >= 75 &&
      (nrCount === 0 ||
        (typeof nrRsrpMed === "number" && nrRsrpMed <= -110) ||
        (typeof nrScoreMed === "number" && nrScoreMed <= 40));

    if (ruleC) {
      const confidence = buildConfidence({ strong: nrCount === 0 || (typeof nrScoreMed === "number" && nrScoreMed <= 30) });
      if (confidence >= 60) {
        return {
          primary_title: "5G reception seems suboptimal vs 4G",
          primary_message: "LTE carrier aggregation looks good, but 5G is weak or absent.",
          why: [
            `LTE CA count: ${lteCaCount}`,
            `LTE score median: ${formatValue(lteScoreMed, "")}`,
            `NR count: ${nrCount}`,
            `NR RSRP/score: ${formatValue(nrRsrpMed, "dBm")} / ${formatValue(nrScoreMed, "")}`,
          ],
          suggestions: [
            "Reposition/rotate the device toward the likely 5G direction (n78 is more sensitive).",
            "Verify 5G availability at your location and test near a window/outdoors.",
          ],
          secondary_notes: buildSecondaryNotes([]),
        };
      }
      secondaryNotes.push("5G appears weaker than strong LTE CA.");
    }

    const weakCoverage = typeof lteRsrpMed === "number" && lteRsrpMed <= -105 &&
      (nrCount === 0 || (typeof nrRsrpMed === "number" && nrRsrpMed <= -105));
    const lowHighBalanced = typeof deltaLowHigh === "number" ? deltaLowHigh < 12 : true;
    const ruleD = weakCoverage &&
      (lowHighBalanced || (lteHighCount === 0 && typeof lteLowRsrpMed === "number" && lteLowRsrpMed <= -105));

    if (ruleD) {
      const confidence = buildConfidence({ strong: typeof lteRsrpMed === "number" && lteRsrpMed <= -110 });
      if (confidence >= 60) {
        const why = [
          `LTE RSRP median: ${formatValue(lteRsrpMed, "dBm")}`,
        ];
        if (nrCount > 0) {
          why.push(`NR RSRP median: ${formatValue(nrRsrpMed, "dBm")}`);
        }
        return {
          primary_title: "Overall coverage is weak",
          primary_message: "All observed carriers show weak signal levels.",
          why,
          suggestions: [
            "Try a better placement (near a window or higher position).",
            "Consider an external antenna and avoid thick walls.",
          ],
          secondary_notes: buildSecondaryNotes([]),
        };
      }
      secondaryNotes.push("Overall coverage looks weak.");
    }

    const ruleE = lteCaCount <= 2 &&
      ((typeof lteBestRsrp === "number" && lteBestRsrp <= -100) ||
        (typeof lteRsrpMed === "number" && lteRsrpMed <= -100));

    if (ruleE) {
      const confidence = buildConfidence({ strong: typeof lteBestRsrp === "number" && lteBestRsrp <= -105 });
      if (confidence >= 60) {
        return {
          primary_title: "Signal likely too weak for higher CA",
          primary_message: "Limited carrier aggregation is typical when signal strength is low.",
          why: [
            `LTE CA count: ${lteCaCount}`,
            `Best LTE RSRP: ${formatValue(lteBestRsrp, "dBm")}`,
          ],
          suggestions: [
            "Improve RSRP first (placement/antenna) to enable more stable CA.",
          ],
          secondary_notes: buildSecondaryNotes([]),
        };
      }
      secondaryNotes.push("Carrier aggregation may be limited by weak signal.");
    }

    if (secondaryNotes.length > 0) {
      return {
        primary_title: "No issues detected",
        primary_message: "No strong issues were detected, but see secondary notes.",
        why: [],
        suggestions: [],
        secondary_notes: buildSecondaryNotes(secondaryNotes),
      };
    }

    return {
      primary_title: "No issues detected",
      primary_message: "No clear issues were detected with the current signals.",
      why: [],
      suggestions: [],
      secondary_notes: buildSecondaryNotes([]),
    };
  },

  // Calculate the overall signal assessment
  calculateSignalPercentage(sinrPercentage, rsrpPercentage, rsrqPercentage) {
    const sinr = Number.isFinite(sinrPercentage) ? sinrPercentage : 0;
    const rsrp = Number.isFinite(rsrpPercentage) ? rsrpPercentage : 0;
    const rsrq = Number.isFinite(rsrqPercentage) ? rsrqPercentage : 0;
    const score = (0.45 * sinr) + (0.35 * rsrp) + (0.20 * rsrq);
    return this.clampValue(score, 0, 100);
  },

  /**
   * Gets progress bar class for signal metrics (backward compatibility).
   * For new code, use the calculate*Bar functions directly.
   * @param {number} percentage - Percentage value (0-100)
   * @returns {string} Bootstrap CSS class
   */
  getProgressBarClass(percentage) {
    if (percentage >= 60) {
      return "bg-success is-medium";
    } else if (percentage >= 40) {
      return "bg-warning is-warning is-medium";
    }
    return "bg-danger is-medium";
  },

  /**
   * Gets progress bar style string with color for signal metrics.
   * @param {number} percentage - Percentage value (0-100)
   * @param {string} type - Signal type: 'RSSI', 'RSRP', 'RSRQ', 'SINR', 'CPU', 'Memory'
   * @param {string} [technology='LTE'] - Technology type ('LTE' or 'NR') - only for signal types
   * @returns {string} CSS style string with background-color
   */
  getProgressBarStyle(percentage, type, technology = 'LTE') {
    let color = '#6c757d'; // default gray
    
    if (type === 'CPU') {
      const result = this.calculateCPUBar(percentage);
      color = result.color;
    } else if (type === 'Memory') {
      const result = this.calculateMemoryBar(percentage);
      color = result.color;
    } else if (type === 'RSSI') {
      // For percentage-based, we need to reverse calculate the value
      // This is a simplified approach - for accurate colors, use calculateRSSIBar with actual value
      if (percentage >= 60) {
        color = this.signalThresholds.RSSI.thresholds.green.color;
      } else if (percentage >= 40) {
        color = this.signalThresholds.RSSI.thresholds.yellow.color;
      } else {
        color = this.signalThresholds.RSSI.thresholds.red.color;
      }
    } else {
      // For other signal types, use similar logic
      if (percentage >= 60) {
        color = this.signalThresholds[type]?.thresholds.green?.color || '#28a745';
      } else if (percentage >= 40) {
        color = this.signalThresholds[type]?.thresholds.yellow?.color || '#ffc107';
      } else {
        color = this.signalThresholds[type]?.thresholds.red?.color || '#dc3545';
      }
    }
    
    return `background-color: ${color};`;
  },

  signalQuality(percentage) {
    if (percentage >= 80) {
      return "Excellent";
    } else if (percentage >= 60) {
      return "Good";
    } else if (percentage >= 40) {
      return "Fair";
    } else if (percentage >= 0) {
      return "Poor";
    } else {
      return "No Signal";
    }
  },

  // Format temperature with Fahrenheit conversion
  formatTempWithFahrenheit(tempStr) {
    if (!tempStr || tempStr === 'Unknown') {
      return 'Unknown';
    }
    // Extract numeric value (remove 'C' or any non-numeric characters except digits and decimal point)
    const celsiusMatch = tempStr.match(/(\d+(?:\.\d+)?)/);
    if (!celsiusMatch) {
      return tempStr;
    }
    const celsius = parseFloat(celsiusMatch[1]);
    const fahrenheit = Math.round((celsius * 9/5) + 32);
    return `${celsius} °C (${fahrenheit} °F)`;
  },

  // Get temperature icon container class based on temperature value
  // Operating range: -30 to 70°C, typical at 25°C
  // Color scheme:
  //   Blue (cold): < 0°C (approaching lower limit)
  //   Green (optimal): 0-35°C (typical at 25°C)
  //   Yellow (warm): 35-50°C (acceptable but getting warm)
  //   Orange (hot): 50-60°C (approaching upper limit)
  //   Red (danger): > 60°C (danger zone, near/beyond 70°C limit)
  getTempIconClass() {
    // Parse temperature, handling both "25C" and "25" formats
    const tempStr = String(this.temperature || '0').replace(/[^\d.-]/g, '');
    const tempValue = parseFloat(tempStr) || 0;
    
    if (tempValue < 0) {
      // Blue: Cold, approaching lower limit (-30°C)
      return 'icon-container icon-temp temp-cold';
    } else if (tempValue >= 0 && tempValue < 35) {
      // Green: Optimal range (typical at 25°C)
      return 'icon-container icon-temp temp-optimal';
    } else if (tempValue >= 35 && tempValue < 50) {
      // Yellow: Warm but acceptable
      return 'icon-container icon-temp temp-warm';
    } else if (tempValue >= 50 && tempValue <= 60) {
      // Orange: Hot, approaching upper limit
      return 'icon-container icon-temp temp-hot';
    } else {
      // Red: Danger zone (near/beyond 70°C limit)
      return 'icon-container icon-temp temp-danger';
    }
  },

  // Get signal icon container class based on signal percentage
  getSignalIconClass() {
    const signalValue = parseInt(this.signalPercentage) || 0;
    if (signalValue <= 45) {
      return 'icon-container icon-signal signal-poor';
    } else if (signalValue >= 46 && signalValue <= 50) {
      return 'icon-container icon-signal signal-fair';
    } else {
      return 'icon-container icon-signal signal-good';
    }
  },

  // Get cloud icon class based on connection status
  getConnectionIconClass() {
    if (this.internetConnectionStatus === 'Connected') {
      return 'icon-container icon-cloud connection-connected';
    } else if (this.internetConnectionStatus === 'Partial') {
      return 'icon-container icon-cloud connection-warning';
    } else {
      return 'icon-container icon-cloud connection-disconnected';
    }
  },

  // Get SIM icon container class based on SIM status
  // Color scheme:
  //   Green (active): "Active" or "READY" - SIM is ready and working
  //   Yellow/Orange (warning): "SIM PIN", "SIM PIN2", "PH-NET PIN" - PIN required
  //   Red (danger): "No SIM", "SIM PUK", "SIM PUK2", or any error state
  getSimIconClass() {
    const status = String(this.simStatus || 'No SIM').trim().toUpperCase();
    
    if (status === 'ACTIVE' || status === 'READY') {
      // Green: SIM is ready and working
      return 'icon-container icon-sim sim-active';
    } else if (status.includes('PIN') || status.includes('PUK')) {
      // Yellow/Orange: PIN/PUK required (warning state)
      return 'icon-container icon-sim sim-warning';
    } else {
      // Red: No SIM or error state
      return 'icon-container icon-sim sim-error';
    }
  },

  isSimPinRequired() {
    const status = String(this.simStatus || '').trim().toUpperCase();
    return status.includes('SIM PIN');
  },

  isSimPinSectionDisabled() {
    const status = String(this.simStatus || '').trim().toUpperCase();
    const simReady = status === 'ACTIVE' || status === 'READY';
    return simReady && !this.isSimPinRequired();
  },

  async unlockSimPin() {
    const pin = String(this.simPin || '').trim();
    this.simUnlockError = "";
    this.simUnlockMessage = "";

    if (!pin) {
      this.simUnlockError = "Please enter the SIM PIN.";
      return;
    }

    this.isSimUnlocking = true;

    try {
      const unlockCmd = `AT+CPIN="${pin}"`;
      const unlockResult = await ATCommandService.execute(unlockCmd, {
        retries: 2,
        timeout: 10000,
      });

      if (!unlockResult.ok) {
        const message = unlockResult.error
          ? unlockResult.error.message
          : "Failed to unlock the SIM.";
        this.simUnlockError = message;
        return;
      }

      const verifyResult = await ATCommandService.execute('AT+CPIN?', {
        retries: 2,
        timeout: 5000,
      });

      if (!verifyResult.ok || !verifyResult.data || !verifyResult.data.includes('READY')) {
        this.simUnlockError = "SIM PIN accepted but SIM is not ready.";
        return;
      }

      let successMessage = "SIM unlocked successfully.";

      if (this.simPinDisableMode === "permanent") {
        const disableCmd = `AT+CLCK="SC",0,"${pin}"`;
        const disableResult = await ATCommandService.execute(disableCmd, {
          retries: 2,
          timeout: 10000,
        });

        if (disableResult.ok) {
          successMessage = "SIM unlocked and PIN disabled permanently.";
        } else {
          const disableError = disableResult.error
            ? disableResult.error.message
            : "Failed to disable SIM PIN permanently.";
          this.simUnlockError = `SIM unlocked, but ${disableError}`;
        }
      } else {
        successMessage = "SIM unlocked until reboot. The SIM will require the PIN again after restart.";
      }

      this.simUnlockMessage = successMessage;
      this.simStatus = "Active";
      this.simPin = "";
      this.fetchAllInfo();
    } catch (error) {
      this.simUnlockError = error.message || "Unexpected error while unlocking SIM.";
    } finally {
      this.isSimUnlocking = false;
    }
  },

 fetchSysInfo() {
  fetch("/cgi-bin/get_sys_info")
    .then((response) => {
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return response.json();
    })
    .then((data) => {
      if (data.status !== 'ok') {
        this.uptime = "Unknown Time";
        this.systemSpeed = "Unknown";
        this.systemDuplex = "Unknown";
        this.cpuUsage = 0;
        this.memUsed = 0;
        this.memTotal = 0;
        this.memPercent = 0;
        return;
      }

      const days = parseInt(data.days) || 0;
      const hours = parseInt(data.hours) || 0;
      const minutes = parseInt(data.minutes) || 0;

      const parts = [];

      // Format days
      if (days > 0) {
        parts.push(`${days} ${days === 1 ? 'day' : 'days'}`);
      }

      // Format hours
      if (hours > 0) {
        parts.push(`${hours} ${hours === 1 ? 'hour' : 'hours'}`);
      }

      // Format minutes
      if (minutes > 0) {
        parts.push(`${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`);
      }

      // Join with commas and spaces
      if (parts.length === 0) {
        this.uptime = "Less than 1 minute";
      } else if (parts.length === 1) {
        this.uptime = parts[0];
      } else if (parts.length === 2) {
        this.uptime = parts.join(' and ');
      } else {
        // For 3 parts (days, hours, minutes)
        this.uptime = parts[0] + ', ' + parts[1] + ' and ' + parts[2];
      }

      // Extract system speed
      this.systemSpeed = data.speed || "Unknown";

      // Extract duplex mode
      this.systemDuplex = data.duplex || "Unknown";

      // Extract CPU usage percentage
      this.cpuUsage = parseInt(data.cpu_usage) || 0;

      // Extract memory usage
      this.memUsed = parseInt(data.mem_used) || 0;
      this.memTotal = parseInt(data.mem_total) || 0;
      this.memPercent = parseInt(data.mem_percent) || 0;
    })
    .catch((error) => {
      console.error("Error fetching uptime:", error);
      this.uptime = "Unknown Time";
      this.systemSpeed = "Unknown";
      this.systemDuplex = "Unknown";
      this.cpuUsage = 0;
      this.memUsed = 0;
      this.memTotal = 0;
      this.memPercent = 0;
    });
  },

  updateRefreshRate() {
    // Check if the refresh rate is less than 5
    if (this.newRefreshRate < 5) {
      this.newRefreshRate = 5;
    }
    // Set the refresh rate
    this.refreshRate = this.newRefreshRate;
    console.log("Refresh Rate Updated to " + this.refreshRate);
    // Store the refresh rate in local storage or session storage
    localStorage.setItem("refreshRate", this.refreshRate);
    // Initialize with the new refresh rate, skipping localStorage read since we just set it
    this.init(true);
  },

  copyToClipboard(text) {
    // Check if we're inside a modal
    const modal = document.querySelector('.modal.show');

    if (modal) {
      // We're in a modal - append input INSIDE the modal-dialog to work around focus enforcement
      const modalDialog = modal.querySelector('.modal-dialog');

      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.setAttribute('readonly', '');
      textArea.style.position = 'fixed';
      textArea.style.top = '0';
      textArea.style.left = '0';
      textArea.style.width = '2em';
      textArea.style.height = '2em';
      textArea.style.padding = '0';
      textArea.style.border = 'none';
      textArea.style.outline = 'none';
      textArea.style.boxShadow = 'none';
      textArea.style.background = 'transparent';

      // Append to modal dialog instead of body - this works with Bootstrap's focus enforcement
      modalDialog.appendChild(textArea);

      textArea.focus();
      textArea.select();
      textArea.setSelectionRange(0, 99999);

      try {
        const successful = document.execCommand('copy');
        if (!successful) {
          console.error('Copy command failed');
        }
      } catch (err) {
        console.error('Copy failed:', err);
      }

      modalDialog.removeChild(textArea);
    } else {
      // Not in a modal - use standard method
      this.doCopy(text);
    }
  },

  doCopy(text) {
    // Create a textarea element for copying (works across browsers including iOS)
    const textArea = document.createElement('textarea');

    // Set the value
    textArea.value = text;

    // Make it read-only to prevent keyboard from showing on mobile
    textArea.setAttribute('readonly', '');

    // Position it off-screen but still in the DOM
    textArea.style.position = 'fixed';
    textArea.style.top = '0';
    textArea.style.left = '0';
    textArea.style.width = '2em';
    textArea.style.height = '2em';
    textArea.style.padding = '0';
    textArea.style.border = 'none';
    textArea.style.outline = 'none';
    textArea.style.boxShadow = 'none';
    textArea.style.background = 'transparent';

    document.body.appendChild(textArea);

    // Select the text
    textArea.select();

    // Most modern browsers also require setSelectionRange for iOS
    textArea.setSelectionRange(0, 99999);

    // Execute the copy command
    try {
      const successful = document.execCommand('copy');
      if (!successful) {
        console.error('Copy command failed');
      }
    } catch (err) {
      console.error('Copy failed:', err);
    }

    // Remove the textarea
    document.body.removeChild(textArea);
  },

  /**
   * Returns the stored decimal cell ID (long).
   * @returns {number|null} The decimal cell ID or null if not available
   */
  getDecimalCellId() {
    return this.decimalCellId;
  },

  /**
   * Generates the map URL for LTE Italy with MCCMNC and cell ID.
   * @returns {string|null} The map URL or null if data is not available
   */
  getMapUrl() {
    if (!this.mccmnc || this.mccmnc === "00000" || this.mccmnc === "Unknown") {
      return null;
    }
    const decimalCellId = this.getDecimalCellId();
    if (decimalCellId === null) {
      return null;
    }
    // Calculate cell ID divided by 256 (floored)
    const cellIdDivided = Math.floor(decimalCellId / 256);
    // Build URL: https://lteitaly.it/internal/map.php#bts=MCCMNC.CELLID
    return `https://lteitaly.it/internal/map.php#bts=${this.mccmnc}.${cellIdDivided}`;
  },

  /**
   * Generates the MCC-MNC.org URL for network information.
   * @returns {string|null} The MCC-MNC.org URL or null if data is not available
   */
  getMccMncUrl() {
    if (!this.mccmnc || this.mccmnc === "00000" || this.mccmnc === "Unknown") {
      return null;
    }
    // mccmnc format: MCC (3 digits) + MNC (2 digits) = 5 digits total
    // Example: "22288" -> MCC: "222", MNC: "88"
    if (this.mccmnc.length < 5) {
      return null;
    }
    const mcc = this.mccmnc.substring(0, 3);
    const mnc = this.mccmnc.substring(3, 5);
    // Build URL: https://mcc-mnc.org/networks/MCC_MNC
    return `https://mcc-mnc.org/networks/${mcc}_${mnc}`;
  },

  /**
   * Returns the 5G badge text based on RAT field.
   * @returns {string} "NR-SA" for standalone, "NR-NSA" for non-standalone, or "5G" as fallback
   */
  get5GBadgeText() {
    if (this.networkMode === "NR5G_SA") {
      return "NR-SA";
    } else if (this.networkMode === "LTE+NR") {
      return "NR-NSA";
    }
    // Fallback to "5G" if RAT is unknown or other value
    return "5G";
  },

  /**
   * Returns the overall RSSI value (prefers LTE, falls back to NR).
   * @returns {string} RSSI value or "-" if not available
   */
  getOverallRSSI() {
    if (this.rssiLTE && this.rssiLTE !== "-") {
      return this.rssiLTE;
    } else if (this.rssiNR && this.rssiNR !== "-") {
      return this.rssiNR;
    }
    return "-";
  },

  /**
   * Returns the overall RSSI percentage (prefers LTE, falls back to NR).
   * @returns {number} RSSI percentage or 0 if not available
   */
  getOverallRSSIPercentage() {
    if (this.rssiLTE && this.rssiLTE !== "-" && this.rssiLTEPercentage) {
      return parseInt(this.rssiLTEPercentage) || 0;
    } else if (this.rssiNR && this.rssiNR !== "-" && this.rssiNRPercentage) {
      return parseInt(this.rssiNRPercentage) || 0;
    }
    return 0;
  },

  init(skipLocalStorage = false) {
    // Clear any existing interval before creating a new one
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
    // Fetch system information (uptime, load, network speed)
    this.fetchSysInfo();
    // Retrieve the refresh rate from local storage or session storage
    // Skip reading from localStorage if skipLocalStorage is true (e.g., when called from updateRefreshRate)
    if (!skipLocalStorage) {
      const storedRefreshRate = localStorage.getItem("refreshRate");
      // If a refresh rate is stored, use it; otherwise, use a default value
      this.refreshRate = storedRefreshRate
        ? parseInt(storedRefreshRate)
        : 10; // Default refresh rate in seconds
    }
    this.fetchAllInfo();

    this.requestPing()
      .then((data) => {
        if (data.status === 'ok') {
          this.internetConnectionStatus = "Connected";
        } else if (data.status === 'warning') {
          this.internetConnectionStatus = "Partial";
        } else {
          this.internetConnectionStatus = "Disconnected";
        }
      })
      .catch((error) => {
        console.error("Error:", error);
        this.internetConnectionStatus = "Disconnected";
      });

    this.lastUpdate = new Date().toLocaleString();
    console.log("Initialized");
    // Set the refresh rate for interval
    this.intervalId = setInterval(() => {
      this.fetchSysInfo();

      this.fetchAllInfo();

      this.requestPing()
        .then((data) => {
          if (data.status === 'ok') {
            this.internetConnectionStatus = "Connected";
          } else if (data.status === 'warning') {
            this.internetConnectionStatus = "Partial";
          } else {
            this.internetConnectionStatus = "Disconnected";
          }
        })
        .catch((error) => {
          console.error("Error:", error);
          this.internetConnectionStatus = "Disconnected";
        });

      this.lastUpdate = new Date().toLocaleString();
      console.log("Refreshed");
    }, this.refreshRate * 1000);
  },

  /**
   * Shows a toast notification with information about SINR on CA bands.
   */
  showSinrInfoToast() {
    const toastElement = document.getElementById('sinrInfoToast');
    if (toastElement) {
      const toast = new bootstrap.Toast(toastElement);
      toast.show();
    }
  },

  // ===== IMEI Modal Functions =====

  openImeiModal() {
    this.showImeiWarningModal = true;
  },

  closeImeiWarningModal() {
    this.showImeiWarningModal = false;
  },

  acceptImeiWarning() {
    this.showImeiWarningModal = false;
    this.showImeiInputModal = true;
    this.newImei = "";
    this.imeiValidationError = "";
    this.isImeiValid = false;
  },

  closeImeiInputModal() {
    this.showImeiInputModal = false;
    this.newImei = "";
    this.imeiValidationError = "";
    this.isImeiValid = false;
  },

  /**
   * Closes the connection details modal and opens the monitoring configuration modal.
   * Used by the settings button in the connection modal header.
   */
  closeAndOpenMonitoring() {
    const connectionModalEl = document.getElementById('connectionModal');
    const connectionModal = bootstrap.Modal.getInstance(connectionModalEl);
    if (connectionModal) {
      connectionModal.hide();
      setTimeout(() => {
        const monitoringModalEl = document.getElementById('monitoringConfigModal');
        const monitoringModal = new bootstrap.Modal(monitoringModalEl);
        monitoringModal.show();
      }, 300);
    }
  },

  /**
   * Validate IMEI input
   */
  validateImeiInput() {
    const imei = this.newImei.trim();

    // Check if empty
    if (imei === "") {
      this.imeiValidationError = "";
      this.isImeiValid = false;
      return;
    }

    // Check if only digits
    if (!/^\d+$/.test(imei)) {
      this.imeiValidationError = "IMEI must contain only digits";
      this.isImeiValid = false;
      return;
    }

    // Check length
    if (imei.length < 15) {
      this.imeiValidationError = `IMEI must be 15 digits (current: ${imei.length})`;
      this.isImeiValid = false;
      return;
    }

    if (imei.length > 15) {
      this.imeiValidationError = "IMEI must be exactly 15 digits";
      this.isImeiValid = false;
      return;
    }

    // Check if same as current IMEI
    if (imei === this.imei) {
      this.imeiValidationError = "New IMEI is the same as current IMEI";
      this.isImeiValid = false;
      return;
    }

    // Valid
    this.imeiValidationError = "";
    this.isImeiValid = true;
  },

  confirmImeiChange() {
    if (!this.isImeiValid) {
      return;
    }
    this.updateIMEI();
    this.showImeiInputModal = false;
    // Trigger global reboot modal
    const modal = document.getElementById('globalRebootModal');
    if (modal) {
      modal.style.display = 'flex';
    }
  },

  /**
   * Process IMEI for AT command format
   * @param {string} imei - 15-digit IMEI
   * @returns {string} Formatted IMEI string
   */
  processImei(imei) {
    const withPrefix = "80A" + imei;

    const pairs = [];
    for (let i = 0; i < withPrefix.length; i += 2) {
      pairs.push(withPrefix.substring(i, i + 2));
    }

    const swappedPairs = pairs.map(pair => {
      if (pair.length === 1) return pair;
      return pair[1] + pair[0];
    });

    return swappedPairs.join(',').toLowerCase();
  },

  /**
   * Update IMEI via AT commands
   */
  async updateIMEI() {
    const formatted = this.processImei(this.newImei);
    const byteCount = formatted.split(',').length;

    // Clear existing IMEI
    const clearCmd = `AT^NV=550,0`;
    await ATCommandService.execute(clearCmd, { retries: 1, timeout: 5000 });

    // Set new IMEI
    const setCmd = `AT^NV=550,${byteCount},"${formatted}"`;
    await ATCommandService.execute(setCmd, { retries: 1, timeout: 5000 });
  },
};
}
