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
    // Auto-refresh interval ID
    intervalId: null,
    // Phone number
    phoneNumber: "Unknown",
    // International Mobile Subscriber Identity
    imsi: "Unknown",
    // Integrated Circuit Card Identifier
    iccid: "Unknown",
    // Power Amplifier temperature
    paTemperature: "Unknown",
    // Skin temperature
    skinTemperature: "Unknown",
    // Connection test results
    connectionDetails: {
      ping: null,
      dns: null
    },
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
        bands: "Not Available",
        temperature: tempValue,
        decimalCellId: null
      });
        return;
      }
      // SIM is ready, execute full command set
      this.atcmd =
        'AT^TEMP?;^SWITCH_SLOT?;+CGPIAF=1,1,1,1;^DEBUG?;+CPIN?;+CGCONTRDP=1;$QCSIMSTAT?;+CSQ;+COPS?;+CIMI;+ICCID;+CNUM;';

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
                bandDisplay,
                bandwidthDisplay: currentEntry.bandwidth || "N/A",
                channelDisplay: currentEntry.channel || "N/A",
                pciDisplay: currentEntry.pci || "N/A",
                rxDiversityDisplay: currentEntry.rxDiversity || "",
                metrics: [],
                antennas: [],
              };

              const addMetric = (key, label, value, unit, calculator) => {
                const normalized = roundValue(value);
                if (normalized === null) {
                  detail.metrics.push({
                    key,
                    label,
                    display: "N/A",
                    percentage: 0,
                  });
                  return;
                }

                const displayValue = unit ? `${normalized} ${unit}` : `${normalized}`;
                const percentage = typeof calculator === "function"
                  ? calculator.call(this, normalized)
                  : 0;

                detail.metrics.push({
                  key,
                  label,
                  display: displayValue,
                  percentage,
                });
              };

              addMetric(
                "rsrq",
                currentEntry.technology === "NR" ? "SS_RSRQ" : "RSRQ",
                currentEntry.metricsData.rsrq,
                "dB",
                this.calculateRSRQPercentage
              );
              addMetric(
                "rsrp",
                currentEntry.technology === "NR" ? "SS_RSRP" : "RSRP",
                currentEntry.metricsData.rsrp,
                "dBm",
                this.calculateRSRPPercentage
              );
              addMetric(
                "rssi",
                "RSSI",
                currentEntry.metricsData.rssi,
                "dBm",
                this.calculateRSSIPercentage
              );
              addMetric(
                "sinr",
                currentEntry.technology === "NR" ? "SS_SINR" : "SINR",
                currentEntry.metricsData.sinr,
                "dB",
                this.calculateSINRPercentage
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
                    logicalIndex: antenna.logicalIndex,
                    physicalAntenna,
                  };
                }

                return {
                  label,
                  display: `${normalized} dBm`,
                  percentage: this.calculateRSRPPercentage(normalized),
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
          // find this example value from lines "+QENG: \"servingcell\",\"NOCONN\",\"NR5G-SA\",\"TDD\",515,66,7000C4001,475,702000,620640,78,12,-83,-3,16,1,-\r"
          const ratLine = lines.find((line) => line.includes('RAT:'));
          const network_mode = ratLine
            ? ratLine.split(":")[1].trim()
            : "Unknown";
          this.networkMode = network_mode;
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
                this.rsrpLTEPercentage,
                this.sinrLTEPercentage
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
                this.rsrpNRPercentage,
                this.sinrNRPercentage
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
                this.rsrpLTEPercentage,
                this.sinrLTEPercentage
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
              this.rsrpNRPercentage,
              this.sinrNRPercentage
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

          // Parse SIM info: IMSI, ICCID, Phone Number
          for (const line of lines) {
            const trimmed = line.trim();

            // Parse IMSI (15 digits)
            if (/^\d{15}$/.test(trimmed)) {
              this.imsi = trimmed;
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

  calculateRSSIPercentage(rssi) {
    const RSSI_MIN = -110;
    const RSSI_MAX = -30;

    if (isNaN(rssi)) {
      return 0;
    }

    if (rssi <= RSSI_MIN) {
      return 0;
    }

    let percentage =
      ((rssi - RSSI_MIN) / (RSSI_MAX - RSSI_MIN)) * 100;

    if (percentage > 100) {
      percentage = 100;
    }

    if (percentage < 15) {
      percentage = 15;
    }

    return Math.round(percentage);
  },

  calculateRSRPPercentage(rsrp) {
    let RSRP_min = -135;
    let RSRP_max = -65;
    // If rsrp is null, return 0%
    if (isNaN(rsrp) || rsrp < -140) {
      return 0;
    }

    let percentage = ((rsrp - RSRP_min) / (RSRP_max - RSRP_min)) * 100;
    
    if (percentage > 100) {
      percentage = 100;
    }
    // if percentage is less than 15%, make it 15%
    if (percentage < 15) {
      percentage = 15;
    }

    return Math.round(percentage);
  },

  calculateRSRQPercentage(rsrq) {
    let RSRQ_min = -20;
    let RSRQ_max = -8;
    // If rsrq is null, return 0%
    if (isNaN(rsrq) || rsrq < -20) {
      return 0;
    }

    let percentage = ((rsrq - RSRQ_min) / (RSRQ_max - RSRQ_min)) * 100;

    if (percentage > 100) {
      percentage = 100;
    }
    // if percentage is less than 15%, make it 15%
    if (percentage < 15) {
      percentage = 15;
    }

    return Math.round(percentage);
  },

  calculateSINRPercentage(sinr) {
    let SINR_min = -10; // Changed from 0
    let SINR_max = 35;
    // If sinr is null, return 0%
    if (isNaN(sinr) || sinr < -10) {
      return 0;
    }

    let percentage = ((sinr - SINR_min) / (SINR_max - SINR_min)) * 100;

    if (percentage > 100) {
      percentage = 100;
    }
    // if percentage is less than 15%, make it 15%
    if (percentage < 15) {
      percentage = 15;
    }

    return Math.round(percentage);
  },
  // Calculate the overall signal assessment
  calculateSignalPercentage(rsrpNRPercentage, sinrNRPercentage) {
    // Get the average of the RSRP Percentage and SINR Percentage
    let average = (rsrpNRPercentage + sinrNRPercentage) / 2;
    return Math.round(average);
  },

  getProgressBarClass(percentage) {
    if (percentage >= 60) {
      return "bg-success is-medium";
    } else if (percentage >= 40) {
      return "bg-warning is-warning is-medium";
    }
    return "bg-danger is-medium";
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
  getTempIconClass() {
    const tempValue = parseInt(this.temperature) || 0;
    if (tempValue >= 0 && tempValue <= 40) {
      return 'icon-container icon-temp temp-good';
    } else if (tempValue >= 41 && tempValue <= 50) {
      return 'icon-container icon-temp temp-warning';
    } else {
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
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        // Success - could add visual feedback here if needed
      }).catch((err) => {
        console.error('Failed to copy to clipboard:', err);
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.opacity = '0';
        document.body.appendChild(textArea);
        textArea.select();
        try {
          document.execCommand('copy');
        } catch (fallbackErr) {
          console.error('Fallback copy failed:', fallbackErr);
        }
        document.body.removeChild(textArea);
      });
    } else {
      // Fallback for browsers without clipboard API
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.opacity = '0';
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
      } catch (err) {
        console.error('Copy failed:', err);
      }
      document.body.removeChild(textArea);
    }
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
};
}
