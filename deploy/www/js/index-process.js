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
    simPinHasBeenUnlocked: false,  // Tracks if SIM has been unlocked (PIN entered at least once)
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
    // SIM unlock prompt modal (first time only)
    showSimUnlockPrompt: false,
    simUnlockPromptDismissed: false,
    // Data comes from two WebSockets: diag_bridge (radio, port 9001) and
    // system_bridge (QMI modem data, system status, connectivity, port 9002).
    // radioSource says where the radio data on screen comes from: "diag",
    // "qmi" (system_bridge, when diag_bridge is not connected) or "none".
    radioSource: "none",
    sysStatus: "idle",
    diagSignals: [],
    diagNetworkAnalysis: null,
    diagSummary: null,
    diagStatus: "idle",
    diagLastUpdate: null,
    // Signal chart overlay state
    signalChartVisible: false,
    signalChartDurationMs: 3 * 60 * 1000,
    signalChartSeriesVisibility: {
      "lte-rssi": true,
      "lte-rsrp": true,
      "lte-rsrq": true,
      "lte-sinr": true,
      "nr-rssi": true,
      "nr-rsrp": true,
      "nr-rsrq": true,
      "nr-sinr": true,
    },
    signalHistory: [],
  };

  // Bridge sockets and their last messages live outside the reactive data:
  // Alpine would wrap them in proxies.
  const DIAG_WS_PORT = 9001;
  const SYS_WS_PORT = 9002;
  const BRIDGE_RECONNECT_MS = 3000;
  const DIAG_STALE_MS = 6000;      // radio falls back to QMI past this
  const SYS_STALE_MS = 10000;      // no system_bridge data: dashboard fallback
  const HISTORY_EVERY_MS = 10000;  // signal chart sample period
  const bridgeSockets = { diag: null, sys: null };
  const bridgeTimers = { diag: null, sys: null };
  const bridgeLast = { diag: null, diagAt: 0, sys: null, sysAt: 0 };

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
        showSimUnlockPrompt: this.showSimUnlockPrompt,
        simUnlockPromptDismissed: this.simUnlockPromptDismissed,
        simPinHasBeenUnlocked: this.simPinHasBeenUnlocked,
        radioSource: this.radioSource,
        sysStatus: this.sysStatus,
        diagSignals: this.diagSignals,
        diagNetworkAnalysis: this.diagNetworkAnalysis,
        diagSummary: this.diagSummary,
        diagStatus: this.diagStatus,
        diagLastUpdate: this.diagLastUpdate,
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
  /**
   * Reads the LAN address once per page: it only changes from the network
   * settings page, which reloads the dashboard anyway.
   */
  fetchLanIpOnce() {
    if (this.lanIpLoaded) {
      this.checkSimUnlockPrompt();
      return;
    }
    fetch("/cgi-bin/get_lanip")
      .then(res => res.json())
      .then(data => {
        this.lanIp = data.lanip;
        this.lanIpLoaded = true;
        // Check if we should show SIM unlock prompt (only once per session)
        // Must be here after simStatus is set
        this.checkSimUnlockPrompt();
      })
      .catch(error => {
        console.error("Error fetching LAN IP:", error);
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
    } else if (status.includes('PIN') || status.includes('PUK') || status.includes('LOCKED')) {
      // Yellow/Orange: PIN/PUK required or locked (warning state)
      return 'icon-container icon-sim sim-warning';
    } else {
      // Red: No SIM or error state
      return 'icon-container icon-sim sim-error';
    }
  },

  isSimPinRequired() {
    const status = String(this.simStatus || '').trim().toUpperCase();
    return status.includes('PIN') || status.includes('PUK') || status.includes('LOCKED');
  },

  isSimPinSectionDisabled() {
    const status = String(this.simStatus || '').trim().toUpperCase();
    const simReady = status === 'ACTIVE' || status === 'READY';
    return simReady;
  },

  shouldShowDisablePinOption() {
    // Show disable PIN option if SIM has been unlocked and is currently active/ready
    const status = String(this.simStatus || '').trim().toUpperCase();
    const simReady = status === 'ACTIVE' || status === 'READY';
    return this.simPinHasBeenUnlocked && simReady;
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
      this.simPinHasBeenUnlocked = true;  // Mark that SIM has been unlocked
      // The bridges push the new SIM state within seconds.
    } catch (error) {
      this.simUnlockError = error.message || "Unexpected error while unlocking SIM.";
    } finally {
      this.isSimUnlocking = false;
    }
  },

  /**
   * Disable SIM PIN only (for when SIM is already unlocked from prompt)
   */
  async disableSimPinOnly() {
    const pin = String(this.simPin || '').trim();
    this.simUnlockError = "";
    this.simUnlockMessage = "";

    if (!pin) {
      this.simUnlockError = "Please enter the SIM PIN.";
      return;
    }

    this.isSimUnlocking = true;

    try {
      let successMessage = "";

      if (this.simPinDisableMode === "permanent") {
        const disableCmd = `AT+CLCK="SC",0,"${pin}"`;
        const disableResult = await ATCommandService.execute(disableCmd, {
          retries: 2,
          timeout: 10000,
        });

        if (disableResult.ok) {
          successMessage = "SIM PIN disabled permanently.";
        } else {
          const disableError = disableResult.error
            ? disableResult.error.message
            : "Failed to disable SIM PIN permanently.";
          this.simUnlockError = disableError;
          return;
        }
      } else {
        successMessage = "SIM PIN will be required again after reboot.";
      }

      this.simUnlockMessage = successMessage;
      this.simPin = "";
    } catch (error) {
      this.simUnlockError = error.message || "Unexpected error while disabling SIM PIN.";
    } finally {
      this.isSimUnlocking = false;
    }
  },


  /**
   * Check if SIM unlock prompt should be shown (first time in session)
   * Only shows if SIM is locked and hasn't been dismissed this session
   */
  checkSimUnlockPrompt() {
    if (sessionStorage.getItem('simUnlockPromptDismissed')) {
      return;
    }
    if (!this.isSimPinRequired()) {
      return;
    }

    this.showSimUnlockPrompt = true;
  },

  /**
   * Dismiss the SIM unlock prompt for this session
   */
  dismissSimUnlockPrompt() {
    this.showSimUnlockPrompt = false;
    this.simUnlockPromptDismissed = true;
    sessionStorage.setItem('simUnlockPromptDismissed', 'true');
  },

  async unlockFromPrompt() {
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
        const message = unlockResult.error ? unlockResult.error.message : "Failed to unlock the SIM.";
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
      this.simUnlockMessage = "SIM unlocked successfully!";
      this.simStatus = "Active";
      this.simPin = "";
      this.showSimUnlockPrompt = false;
      this.simPinHasBeenUnlocked = true;  // Mark that SIM has been unlocked
      // The bridges push the new SIM state within seconds.
    } catch (error) {
      this.simUnlockError = error.message || "Unexpected error while unlocking SIM.";
    } finally {
      this.isSimUnlocking = false;
    }
  },

  /**
   * Uptime, link speed, CPU and memory for the dashboard, from a
   * get_sys_info-shaped object (system_bridge data is converted to it).
   */
  applySysInfo(data) {
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

  /**
   * Per-antenna rows always cover ANT0-ANT3 so the modal keeps the same
   * number of bars: antennas without data become placeholders, rendered
   * with a dash and a striped empty bar.
   *
   * @param {Array} list - Antenna/chain entries with physicalAntenna index
   * @returns {Array} Four entries ordered by physical antenna
   */
  fourChains(list) {
    const byAntenna = new Map();
    (Array.isArray(list) ? list : []).forEach((item, index) => {
      const antenna = typeof item.physicalAntenna === "number" ? item.physicalAntenna : index;
      if (antenna >= 0 && antenna < 4 && !byAntenna.has(antenna)) {
        byAntenna.set(antenna, item);
      }
    });
    return [0, 1, 2, 3].map(
      (antenna) =>
        byAntenna.get(antenna) || { physicalAntenna: antenna, percentage: 0, display: "—", noData: true }
    );
  },

  /**
   * Signal entries shown in the Advanced Signal Details modal.
   *
   * @returns {Array} entries built from the current radio snapshot
   */
  activeSignals() {
    return this.diagSignals;
  },

  /**
   * Network analysis of the current radio snapshot.
   *
   * @returns {Object|null}
   */
  activeNetworkAnalysis() {
    return this.diagNetworkAnalysis;
  },

  diagStatusLabel() {
    switch (this.diagStatus) {
      case "connected":
        return "DIAG bridge connected";
      case "connecting":
        return "Connecting to DIAG bridge…";
      case "disconnected":
        return "DIAG bridge unreachable (port " + DIAG_WS_PORT + "), retrying";
      default:
        return "DIAG bridge idle";
    }
  },

  /** Short label of the radio data source, for the toolbar and the modal. */
  radioSourceLabel() {
    return this.radioSource === "diag" ? "DIAG" : this.radioSource === "qmi" ? "QMI" : "—";
  },

  radioSourceTitle() {
    if (this.radioSource === "diag") return "Radio data from the Qualcomm DIAG interface (diag_bridge)";
    if (this.radioSource === "qmi") return "diag_bridge not connected: radio data from QMI (system_bridge)";
    return "No radio data: bridges unreachable";
  },

  /**
   * Opens one bridge WebSocket ("diag" or "sys") and keeps it open, retrying
   * every BRIDGE_RECONNECT_MS. Closed while the tab is hidden, so the
   * bridges stop polling the modem for nobody.
   */
  connectBridge(kind) {
    if (document.hidden) return;
    const port = kind === "diag" ? DIAG_WS_PORT : SYS_WS_PORT;
    const statusKey = kind === "diag" ? "diagStatus" : "sysStatus";
    const current = bridgeSockets[kind];
    if (current && (current.readyState === WebSocket.OPEN || current.readyState === WebSocket.CONNECTING)) {
      return;
    }
    clearTimeout(bridgeTimers[kind]);
    const host = window.location.hostname || "192.168.225.1";
    let ws;
    try {
      ws = new WebSocket("ws://" + host + ":" + port);
    } catch (_) {
      this[statusKey] = "disconnected";
      bridgeTimers[kind] = setTimeout(() => this.connectBridge(kind), BRIDGE_RECONNECT_MS);
      return;
    }
    bridgeSockets[kind] = ws;
    this[statusKey] = "connecting";
    ws.onopen = () => {
      if (bridgeSockets[kind] === ws) this[statusKey] = "connected";
    };
    ws.onmessage = (event) => {
      if (bridgeSockets[kind] !== ws) return;
      let data;
      try {
        data = JSON.parse(event.data);
      } catch (error) {
        console.warn("Ignoring malformed " + kind + " bridge message:", error);
        return;
      }
      if (kind === "diag") {
        bridgeLast.diag = data;
        bridgeLast.diagAt = Date.now();
      } else {
        bridgeLast.sys = data;
        bridgeLast.sysAt = Date.now();
        this.applySystemData(data);
      }
      this.refreshFromBridges();
    };
    ws.onerror = () => ws.close();
    ws.onclose = () => {
      if (bridgeSockets[kind] !== ws) return;
      bridgeSockets[kind] = null;
      this[statusKey] = "disconnected";
      bridgeTimers[kind] = setTimeout(() => this.connectBridge(kind), BRIDGE_RECONNECT_MS);
    };
  },

  disconnectBridge(kind) {
    clearTimeout(bridgeTimers[kind]);
    bridgeTimers[kind] = null;
    const ws = bridgeSockets[kind];
    bridgeSockets[kind] = null;
    if (ws) ws.close();
    this[kind === "diag" ? "diagStatus" : "sysStatus"] = "idle";
  },

  /**
   * Picks the radio snapshot (diag_bridge if fresh, else the QMI radio of
   * system_bridge) and updates the dashboard and the advanced view from it.
   */
  refreshFromBridges() {
    const now = Date.now();
    const diag = bridgeLast.diag;
    const sysFresh = bridgeLast.sys && now - bridgeLast.sysAt < SYS_STALE_MS;
    const diagFresh = diag && now - bridgeLast.diagAt < DIAG_STALE_MS &&
      ((diag.lte || []).length + (diag.nr || []).length) > 0;
    const qmiRadio = sysFresh ? bridgeLast.sys.radio : null;
    let snapshot = null;
    if (diagFresh) {
      snapshot = this.withQmiExtras(diag, sysFresh ? bridgeLast.sys : null);
      this.radioSource = "diag";
    } else if (qmiRadio && (qmiRadio.lte || qmiRadio.nr)) {
      snapshot = this.qmiAsDiag(bridgeLast.sys);
      this.radioSource = "qmi";
    } else {
      this.radioSource = "none";
      if (!sysFresh && (bridgeLast.sysAt || now - this.bridgesSince > SYS_STALE_MS)) {
        this.applyFallback("Bridges unreachable: no data from diag_bridge or system_bridge.");
      }
      return;
    }
    this._applyDiagData(snapshot);
    this.detailedSignals = this.diagSignals;
    this.networkAnalysis = this.diagNetworkAnalysis;
    this.applyRadioToDashboard(snapshot);
    if (now - (this.lastHistoryAt || 0) >= HISTORY_EVERY_MS) {
      this.updateSignalHistory();
      this.lastHistoryAt = now;
    }
    this.lastUpdate = new Date().toLocaleString();
  },

  /**
   * diag_bridge snapshot completed with what DIAG does not carry: the NR
   * SINR, and the PCell bandwidth / identity until RRC reports them.
   */
  withQmiExtras(diag, sys) {
    const snap = JSON.parse(JSON.stringify(diag));
    const radio = sys && sys.radio;
    if (!radio) return snap;
    const nr = (snap.nr || [])[0];
    if (nr && radio.nr && typeof radio.nr.sinr === "number" &&
        (snap.nr.length === 1 || radio.nr.pci === nr.pci)) {
      nr.sinr = radio.nr.sinr;
    }
    const pcell = (snap.lte || []).find((cell) => !cell.is_scell);
    if (pcell && radio.lte && radio.lte.earfcn === pcell.earfcn && radio.lte.pci === pcell.pci) {
      if (pcell.cell_id == null && radio.lte.cell_id) {
        pcell.cell_id = radio.lte.cell_id;
        pcell.tac = radio.lte.tac;
        pcell.mcc = sys.modem.mcc;
        pcell.mnc = sys.modem.mnc;
      }
      if (pcell.bandwidth_estimated && radio.lte.bandwidth_mhz) {
        pcell.bandwidth_mhz = radio.lte.bandwidth_mhz;
        delete pcell.bandwidth_estimated;
      }
    }
    // Active SCells diag_bridge has not learnt from RRC yet (it only sees
    // them in reconfigurations, so not right after it starts).
    if (radio.lte) {
      const none = [null, null, null, null];
      (radio.lte.scells || []).forEach((sc) => {
        if ((snap.lte || []).some((cell) => cell.earfcn === sc.earfcn && cell.pci === sc.pci)) return;
        (snap.lte = snap.lte || []).push({
          earfcn: sc.earfcn, pci: sc.pci, band: sc.band, scell_idx: sc.scell_idx, is_scell: 1,
          rsrp: null, rsrq: null, rssi: null, sinr: null, measured: false,
          rx_diversity: 0, rsrp_rx: none, sinr_rx: none, bandwidth_mhz: sc.bandwidth_mhz,
        });
      });
    }
    return snap;
  },

  /** system_bridge QMI radio in the diag_bridge JSON shape. */
  qmiAsDiag(sys) {
    const radio = sys.radio || {};
    const modem = sys.modem || {};
    const chainMask = (chains) =>
      (chains || []).reduce((mask, value, index) => (value != null ? mask | (1 << index) : mask), 0);
    const none = [null, null, null, null];
    const lte = [];
    const nr = [];
    if (radio.lte) {
      const l = radio.lte;
      lte.push({
        earfcn: l.earfcn, pci: l.pci, band: l.band, scell_idx: 0, is_scell: 0,
        rsrp: l.rsrp, rsrq: l.rsrq, rssi: l.rssi, sinr: l.sinr,
        rx_diversity: chainMask(l.rsrp_rx), rsrp_rx: l.rsrp_rx || none, sinr_rx: none,
        bandwidth_mhz: l.bandwidth_mhz, cell_id: l.cell_id, tac: l.tac, mcc: modem.mcc, mnc: modem.mnc,
      });
      (l.scells || []).forEach((sc) => lte.push({
        earfcn: sc.earfcn, pci: sc.pci, band: sc.band, scell_idx: sc.scell_idx, is_scell: 1,
        rsrp: null, rsrq: null, rssi: null, sinr: null, measured: false,
        rx_diversity: 0, rsrp_rx: none, sinr_rx: none, bandwidth_mhz: sc.bandwidth_mhz,
      }));
    }
    if (radio.nr) {
      const n = radio.nr;
      nr.push({
        arfcn: n.arfcn, pci: n.pci, band: n.band, rsrp: n.rsrp, rsrq: n.rsrq, sinr: n.sinr,
        rx_diversity: chainMask(n.rsrp_rx), rsrp_rx: n.rsrp_rx || none,
      });
    }
    const total = lte.concat(nr).reduce((sum, cell) => sum + (cell.bandwidth_mhz || 0), 0);
    return {
      lte, nr,
      summary: { cells: lte.length + nr.length, lte: lte.length, nr: nr.length,
                 total_bandwidth_mhz: total, total_dl_mbps: 0, total_ul_mbps: 0 },
    };
  },

  /** Dashboard cards from a radio snapshot (diag_bridge JSON shape). */
  applyRadioToDashboard(snap) {
    const lte = (snap.lte || []).slice().sort(
      (a, b) => (a.is_scell ? 1 : 0) - (b.is_scell ? 1 : 0) || (a.scell_idx || 0) - (b.scell_idx || 0)
    );
    const nr = snap.nr || [];
    const pcell = lte.find((cell) => !cell.is_scell) || null;
    const nr0 = nr[0] || null;
    const num = (v) => typeof v === "number" && Number.isFinite(v);
    const fmt = (v, unit) => (num(v) ? `${Math.round(v * 10) / 10}${unit}` : "-");

    if (pcell && nr0) {
      this.networkMode = "LTE+NR";
      this.networkModeBadges = [
        { label: "LTE", class: "badge-success-modern" },
        { label: "NR-NSA", class: "badge-info-modern" },
      ];
      this.csq = "LTE+NR Mode";
    } else if (pcell) {
      this.networkMode = "LTE";
      this.networkModeBadges = [{ label: "LTE", class: "badge-success-modern" }];
      this.csq = "LTE Mode";
    } else if (nr0) {
      this.networkMode = "NR5G_SA";
      this.networkModeBadges = [{ label: "NR-SA", class: "badge-purple-dark-modern" }];
      this.csq = "NR Mode";
    } else {
      this.networkMode = "Unknown";
      this.networkModeBadges = [];
    }

    const bands = lte.filter((c) => c.band).map((c) => String(c.band))
      .concat(nr.filter((c) => c.band).map((c) => `n${c.band}`));
    this.bands = bands.length ? bands.join(", ") : "No Bands";
    const widths = lte.concat(nr).filter((c) => num(c.bandwidth_mhz) && c.bandwidth_mhz > 0)
      .map((c) => `${c.bandwidth_mhz.toFixed(1)}MHz`);
    this.bandwidth = widths.length ? widths.join(", ") : "Unknown Bandwidth";
    const channels = lte.map((c) => c.earfcn).concat(nr.map((c) => c.arfcn)).filter((v) => v != null);
    this.earfcns = channels.length ? channels.join(", ") : "Unknown E/ARFCN";
    const pcis = lte.map((c) => c.pci).concat(nr.map((c) => c.pci)).filter((v) => v != null && v >= 0);
    this.pccPCI = pcis.length ? pcis.join(", ") : "0";
    this.sccPCI = "-";

    if (pcell && num(pcell.cell_id) && pcell.cell_id > 0) {
      const hex = pcell.cell_id.toString(16).toUpperCase();
      const shortHex = hex.slice(-2);
      this.cellID = `Short ${shortHex}(${parseInt(shortHex, 16)}), Long ${hex}(${pcell.cell_id})`;
      this.eNBIDLTE = hex.length > 2 ? parseInt(hex.slice(0, -2), 16) : "-";
      this.decimalCellId = pcell.cell_id;
    }
    if (pcell && num(pcell.tac) && pcell.tac > 0) {
      this.tacLTE = String(pcell.tac);
      this.tac = `${pcell.tac} (${pcell.tac.toString(16).toUpperCase()})`;
    }

    const samples = [];
    if (pcell) {
      this.rsrpLTE = fmt(pcell.rsrp, "dBm");
      this.rsrqLTE = fmt(pcell.rsrq, "dB");
      this.sinrLTE = fmt(pcell.sinr, "dB");
      this.rssiLTE = fmt(pcell.rssi, "dBm");
      this.rsrpLTEPercentage = this.calculateRSRPPercentage(parseFloat(this.rsrpLTE));
      this.rsrqLTEPercentage = this.calculateRSRQPercentage(parseFloat(this.rsrqLTE));
      this.sinrLTEPercentage = this.calculateSINRPercentage(parseFloat(this.sinrLTE));
      this.rssiLTEPercentage = this.calculateRSSIPercentage(parseFloat(this.rssiLTE));
      samples.push(this.calculateSignalPercentage(this.sinrLTEPercentage, this.rsrpLTEPercentage, this.rsrqLTEPercentage));
    } else {
      this.rsrpLTE = this.rsrqLTE = this.sinrLTE = this.rssiLTE = "-";
      this.rsrpLTEPercentage = this.rsrqLTEPercentage = this.sinrLTEPercentage = this.rssiLTEPercentage = 0;
      this.eNBIDLTE = "-";
    }
    if (nr0) {
      this.rsrpNR = fmt(nr0.rsrp, "dBm");
      this.rsrqNR = fmt(nr0.rsrq, "dB");
      this.sinrNR = fmt(nr0.sinr, "dB");
      this.rssiNR = "-";
      this.rsrpNRPercentage = this.calculateRSRPPercentage(parseFloat(this.rsrpNR));
      this.rsrqNRPercentage = this.calculateRSRQPercentage(parseFloat(this.rsrqNR));
      this.sinrNRPercentage = this.calculateSINRPercentage(parseFloat(this.sinrNR));
      this.rssiNRPercentage = 0;
      samples.push(this.calculateSignalPercentage(this.sinrNRPercentage, this.rsrpNRPercentage, this.rsrqNRPercentage));
    } else {
      this.rsrpNR = this.rsrqNR = this.sinrNR = this.rssiNR = "-";
      this.rsrpNRPercentage = this.rsrqNRPercentage = this.sinrNRPercentage = this.rssiNRPercentage = 0;
      this.eNBIDNR = "-";
    }
    if (samples.length) {
      this.signalPercentage = Math.round(samples.reduce((a, b) => a + b, 0) / samples.length);
      this.signalAssessment = this.signalQuality(this.signalPercentage);
    } else {
      this.signalPercentage = 0;
      this.signalAssessment = "No Signal";
    }
  },

  /** Modem identity, SIM, network and system status from system_bridge. */
  applySystemData(data) {
    const s = data.sys || {};
    const up = Math.floor(s.uptime_s || 0);
    this.applySysInfo({
      status: "ok",
      days: Math.floor(up / 86400), hours: Math.floor((up % 86400) / 3600), minutes: Math.floor((up % 3600) / 60),
      speed: s.eth && s.eth.speed, duplex: s.eth && s.eth.duplex,
      cpu_usage: s.cpu_pct, mem_used: s.mem_used_kb, mem_total: s.mem_total_kb, mem_percent: s.mem_pct,
    });

    const conn = data.conn || {};
    if (conn.status === "ok") this.internetConnectionStatus = "Connected";
    else if (conn.status === "warning") this.internetConnectionStatus = "Partial";
    else if (conn.status === "error") this.internetConnectionStatus = "Disconnected";

    const m = data.modem || {};
    const text = (v) => (typeof v === "string" && v.trim() ? v.trim() : "-");
    this.imei = text(m.imei);
    this.imsi = text(m.imsi);
    this.iccid = text(m.iccid);
    this.firmwareVersion = text(m.firmware);
    this.manufacturer = text(m.manufacturer);
    this.modelName = text(m.model);
    this.simStatus = m.sim && m.sim.state ? m.sim.state : "Unknown";
    this.activeSim = m.sim && m.sim.slot ? `SIM ${m.sim.slot}` : "No SIM";
    // "BetterRoaming BetterRoaming" style names are repeated by some networks.
    const words = text(m.operator).split(/\s+/);
    this.networkProvider = words.filter((w, i) => i === 0 || w !== words[i - 1]).join(" ");
    this.mccmnc = m.mcc ? `${m.mcc}${m.mnc}` : "Unknown";
    const t = m.temperature || {};
    this.temperature = typeof t.modem === "number" ? `${Math.round(t.modem)}C` : "0";
    this.paTemperature = typeof t.pa === "number" ? `${Math.round(t.pa)}C` : "Unknown";
    this.skinTemperature = typeof t.sys1 === "number" ? `${Math.round(t.sys1)}C` : "Unknown";

    const net = data.net || {};
    this.apn = text(net.apn);
    this.ipv4 = this.wwanIpv4 = text(net.wan_ip);
    this.checkSimUnlockPrompt();
  },

  /**
   * Converts a radio snapshot (diag_bridge JSON shape; QMI data is
   * converted to it) into the Advanced Signal Details entries, with the
   * DIAG-only fields (per-chain SINR, modulation, MCS, TX antennas,
   * throughput, NR beams) when present.
   *
   * @param {Object} data - {lte: [...], nr: [...], summary: {...}}
   */
  _applyDiagData(data) {
    if (!data || typeof data !== "object") {
      return;
    }
    // Serving cell first, then SCells by sCellIndex: the bridge flags
    // secondary cells explicitly.
    const lte = (Array.isArray(data.lte) ? data.lte : [])
      .slice()
      .sort(
        (a, b) =>
          (a.is_scell ? 1 : 0) - (b.is_scell ? 1 : 0) || (a.scell_idx || 0) - (b.scell_idx || 0)
      );
    const nr = Array.isArray(data.nr) ? data.nr : [];

    const popcount = (n) => {
      let count = 0;
      let value = n >>> 0;
      while (value) {
        count += value & 1;
        value >>>= 1;
      }
      return count;
    };
    const round1 = (v) =>
      typeof v === "number" && Number.isFinite(v) ? Math.round(v * 10) / 10 : null;
    const positive = (v) => (typeof v === "number" && v > 0 ? v : null);

    const bars = {
      rsrp: (v, tech) => this.calculateRSRPBar(v, tech),
      rsrq: (v, tech) => this.calculateRSRQBar(v, tech),
      rssi: (v, tech) => this.calculateRSSIBar(v, tech),
      sinr: (v, tech) => this.calculateSINRBar(v, tech),
    };
    const buildMetric = (key, label, raw, unit, tech, isCA = false) => {
      const value = round1(raw);
      if (value === null) {
        return { key, label, display: "N/A", percentage: 0, color: "#6c757d", value: null, isCA };
      }
      const bar = bars[key](value, tech);
      return { key, label, display: `${value} ${unit}`, percentage: bar.percentage, color: bar.color, value, isCA };
    };
    const buildChains = (values, unit, barFn, tech) =>
      (Array.isArray(values) ? values : [])
        .map((raw, index) => {
          const value = round1(raw);
          if (value === null) {
            return null;
          }
          const bar = barFn(value, tech);
          return {
            physicalAntenna: index,
            logicalIndex: index,
            value,
            percentage: bar.percentage,
            color: bar.color,
            display: `${value} ${unit}`,
          };
        })
        .filter(Boolean);

    const fixed = (v, digits) =>
      typeof v === "number" && Number.isFinite(v) ? v.toFixed(digits) : null;
    const pct = (v) =>
      typeof v === "number" && Number.isFinite(v) ? `${(v * 100).toFixed(v < 0.1 ? 1 : 0)}%` : null;
    // Rows of DIAG-only details; empty items and rows are dropped.
    const badgeRows = (rows) =>
      rows
        .map((row) => ({ title: row.title, items: row.items.filter((item) => item && item.text) }))
        .filter((row) => row.items.length > 0);
    const badge = (text, cls = "bg-secondary") => (text ? { text, cls } : null);
    // Band defaults are flagged by the bridge: say so instead of passing
    // them off as the configured bandwidth.
    const est = (cell) => (cell.bandwidth_estimated ? " (est.)" : "");

    const signals = [];

    lte.forEach((cell, index) => {
      const tech = "LTE";
      const isCA = Boolean(cell.is_scell);
      const caIndex = cell.scell_idx || index;
      const baseTitle = isCA ? `CA 4G #${caIndex}` : "Primary 4G";
      const bandwidthMhz = positive(cell.bandwidth_mhz);
      const prb = positive(cell.bandwidth_prb);
      signals.push({
        id: `lte-diag-${cell.earfcn}-${cell.pci}`,
        title: cell.band ? `${baseTitle} (Band ${cell.band})` : baseTitle,
        technology: tech,
        role: isCA ? "secondary" : "primary",
        caIndex: isCA ? caIndex : null,
        band: cell.band ? String(cell.band) : null,
        bandDisplay: cell.band ? `Band ${cell.band}` : "N/A",
        bandwidthDisplay: bandwidthMhz
          ? (prb ? `${bandwidthMhz} MHz (${prb} PRB)${est(cell)}` : `${bandwidthMhz} MHz${est(cell)}`)
          : "N/A",
        channelDisplay: cell.earfcn != null ? String(cell.earfcn) : "N/A",
        pciDisplay: cell.pci != null ? String(cell.pci) : "N/A",
        rxDiversityDisplay: cell.rx_diversity ? `${popcount(cell.rx_diversity)}R` : "",
        metrics: [
          buildMetric("rsrp", "RSRP", cell.rsrp, "dBm", tech),
          buildMetric("rsrq", "RSRQ", cell.rsrq, "dB", tech),
          buildMetric("rssi", "RSSI", cell.rssi, "dBm", tech),
          buildMetric("sinr", "SINR", cell.sinr, "dB", tech, isCA),
        ],
        antennas: buildChains(cell.rsrp_rx, "dBm", bars.rsrp, tech),
        sinrChains: buildChains(cell.sinr_rx, "dB", bars.sinr, tech),
        dlMbps: typeof cell.dl_mbps === "number" ? cell.dl_mbps : null,
        modulation: cell.modulation || null,
        mcs: typeof cell.mcs === "number" ? cell.mcs : null,
        txAntennas: cell.tx_antennas || null,
        ssb: null,
        numBeams: null,
        neighborCells: null,
        diagBadgeRows: badgeRows([
          {
            title: "Cell",
            items: [
              badge(cell.tx_antennas ? `TX antennas: ${cell.tx_antennas}` : null),
              badge(cell.cell_id != null ? `Cell ID: ${cell.cell_id}` : null),
              badge(cell.tac != null ? `TAC: ${cell.tac}` : null),
              badge(cell.mcc != null && cell.mnc != null ? `PLMN: ${cell.mcc}-${cell.mnc}` : null),
            ],
          },
          {
            title: "DL",
            items: [
              badge(cell.modulation || null),
              badge(typeof cell.mcs === "number" ? `MCS ${cell.mcs}` : null),
              badge(fixed(cell.dl_mbps, 1) ? `${fixed(cell.dl_mbps, 1)} Mbps` : null, "bg-info text-dark"),
              badge(pct(cell.dl_bler) ? `BLER ${pct(cell.dl_bler)}` : null),
            ],
          },
          {
            title: "UL",
            items: [
              badge(cell.ul_modulation || null),
              badge(fixed(cell.ul_rb, 1) ? `RB ${fixed(cell.ul_rb, 1)}` : null),
              badge(fixed(cell.ul_mbps, 2) ? `${fixed(cell.ul_mbps, 2)} Mbps` : null, "bg-info text-dark"),
            ],
          },
        ]),
      });
    });

    nr.forEach((cell, index) => {
      const tech = "NR";
      const isCA = index > 0;
      const baseTitle = isCA ? `CA 5G #${index}` : "Primary 5G";
      const bandwidthMhz = positive(cell.bandwidth_mhz);
      signals.push({
        id: `nr-diag-${cell.arfcn}-${cell.pci}`,
        title: cell.band ? `${baseTitle} (Band n${cell.band})` : baseTitle,
        technology: tech,
        role: isCA ? "secondary" : "primary",
        caIndex: isCA ? index : null,
        band: cell.band ? `n${cell.band}` : null,
        bandDisplay: cell.band ? `Band n${cell.band}` : "N/A",
        bandwidthDisplay: bandwidthMhz
          ? (positive(cell.ul_bandwidth_mhz)
            ? `${bandwidthMhz} MHz DL / ${cell.ul_bandwidth_mhz} MHz UL${est(cell)}`
            : `${bandwidthMhz} MHz${est(cell)}`)
          : "N/A",
        channelDisplay: cell.arfcn != null ? String(cell.arfcn) : "N/A",
        pciDisplay: cell.pci != null ? String(cell.pci) : "N/A",
        rxDiversityDisplay: cell.rx_diversity ? `${popcount(cell.rx_diversity)}R` : "",
        // NR SINR comes from QMI (system_bridge) or the last RRC
        // measurement report; there is no NR RSSI.
        metrics: [
          buildMetric("rsrp", "RSRP", cell.rsrp, "dBm", tech),
          buildMetric("rsrq", "RSRQ", cell.rsrq, "dB", tech),
          ...(typeof cell.sinr === "number" ? [buildMetric("sinr", "SINR", cell.sinr, "dB", tech)] : []),
        ],
        antennas: buildChains(cell.rsrp_rx, "dBm", bars.rsrp, tech),
        sinrChains: [],
        dlMbps: null,
        modulation: cell.modulation || null,
        mcs: null,
        txAntennas: null,
        ssb: typeof cell.ssb === "number" ? cell.ssb : null,
        numBeams: cell.num_beams || null,
        neighborCells: cell.neighbor_cells || null,
        diagBadgeRows: badgeRows([
          {
            title: "Cell",
            items: [
              badge(typeof cell.ssb === "number" ? `SSB ${cell.ssb}` : null),
              badge(cell.num_beams ? `Beams: ${cell.num_beams}` : null),
              badge(cell.neighbor_cells ? `Neighbours: ${cell.neighbor_cells}` : null),
              badge(cell.cell_id != null ? `Cell ID: ${cell.cell_id}` : null),
              badge(cell.tac != null ? `TAC: ${cell.tac}` : null),
              badge(cell.mcc != null && cell.mnc != null ? `PLMN: ${cell.mcc}-${cell.mnc}` : null),
            ],
          },
          {
            title: "DL",
            items: [
              badge(cell.modulation || null),
              badge(fixed(cell.dl_mbps, 1) ? `${fixed(cell.dl_mbps, 1)} Mbps` : null, "bg-info text-dark"),
              badge(pct(cell.dl_bler) ? `BLER ${pct(cell.dl_bler)}` : null),
            ],
          },
          {
            title: "UL",
            items: [
              badge(fixed(cell.ul_mcs, 1) ? `MCS ${fixed(cell.ul_mcs, 1)}` : null),
              badge(fixed(cell.ul_prb, 0) ? `PRB ${fixed(cell.ul_prb, 0)}` : null),
              badge(fixed(cell.ul_mbps, 2) ? `${fixed(cell.ul_mbps, 2)} Mbps` : null, "bg-info text-dark"),
              badge(fixed(cell.phr_db, 1) ? `PHR ${fixed(cell.phr_db, 1)} dB` : null),
              badge(fixed(cell.pcmax_dbm, 1) ? `Pcmax ${fixed(cell.pcmax_dbm, 1)} dBm` : null),
            ],
          },
        ]),
      });
    });

    this.diagSignals = signals;
    this.diagNetworkAnalysis = this.buildNetworkAnalysis(signals);
    this.diagSummary = data.summary && typeof data.summary === "object" ? data.summary : null;
    this.diagLastUpdate = new Date().toLocaleTimeString();
  },

  toggleSignalChart() {
    this.signalChartVisible = !this.signalChartVisible;
  },

  getSignalChartSeriesConfig() {
    return [
      {
        key: "lte-rssi",
        label: "Primary 4G RSSI",
        metric: "rssi",
        technology: "LTE",
        color: "#3dd5f3",
        dasharray: "",
      },
      {
        key: "lte-rsrp",
        label: "Primary 4G RSRP",
        metric: "rsrp",
        technology: "LTE",
        color: "#f7c948",
        dasharray: "",
      },
      {
        key: "lte-rsrq",
        label: "Primary 4G RSRQ",
        metric: "rsrq",
        technology: "LTE",
        color: "#f59f00",
        dasharray: "",
      },
      {
        key: "lte-sinr",
        label: "Primary 4G SINR",
        metric: "sinr",
        technology: "LTE",
        color: "#51cf66",
        dasharray: "",
      },
      {
        key: "nr-rssi",
        label: "Primary 5G RSSI",
        metric: "rssi",
        technology: "NR",
        color: "#74c0fc",
        dasharray: "6 4",
      },
      {
        key: "nr-rsrp",
        label: "Primary 5G RSRP",
        metric: "rsrp",
        technology: "NR",
        color: "#ffd43b",
        dasharray: "6 4",
      },
      {
        key: "nr-rsrq",
        label: "Primary 5G RSRQ",
        metric: "rsrq",
        technology: "NR",
        color: "#ffa94d",
        dasharray: "6 4",
      },
      {
        key: "nr-sinr",
        label: "Primary 5G SINR",
        metric: "sinr",
        technology: "NR",
        color: "#69db7c",
        dasharray: "6 4",
      },
    ];
  },

  getPrimarySignalEntry(technology) {
    if (!Array.isArray(this.detailedSignals)) {
      return null;
    }
    return this.detailedSignals.find(
      (entry) => entry.technology === technology && entry.role === "primary"
    );
  },

  getSignalMetricValue(entry, metricKey) {
    if (!entry || !Array.isArray(entry.metrics)) {
      return null;
    }
    const metric = entry.metrics.find((item) => item.key === metricKey);
    return typeof metric?.value === "number" ? metric.value : null;
  },

  updateSignalHistory() {
    const primaryLte = this.getPrimarySignalEntry("LTE");
    const primaryNr = this.getPrimarySignalEntry("NR");

    if (!primaryLte && !primaryNr) {
      return;
    }

    const now = Date.now();
    const point = {
      timestamp: now,
      lte: {
        rssi: this.getSignalMetricValue(primaryLte, "rssi"),
        rsrp: this.getSignalMetricValue(primaryLte, "rsrp"),
        rsrq: this.getSignalMetricValue(primaryLte, "rsrq"),
        sinr: this.getSignalMetricValue(primaryLte, "sinr"),
      },
      nr: {
        rssi: this.getSignalMetricValue(primaryNr, "rssi"),
        rsrp: this.getSignalMetricValue(primaryNr, "rsrp"),
        rsrq: this.getSignalMetricValue(primaryNr, "rsrq"),
        sinr: this.getSignalMetricValue(primaryNr, "sinr"),
      },
    };

    this.signalHistory = [...this.signalHistory, point];
    this.trimSignalHistory();
  },

  trimSignalHistory() {
    const cutoff = Date.now() - this.signalChartDurationMs;
    this.signalHistory = this.signalHistory.filter(
      (point) => point.timestamp >= cutoff
    );
  },

  getSignalChartScale() {
    const seriesConfig = this.getSignalChartSeriesConfig();
    const cutoff = Date.now() - this.signalChartDurationMs;
    const values = [];

    this.signalHistory
      .filter((point) => point.timestamp >= cutoff)
      .forEach((point) => {
        seriesConfig.forEach((series) => {
          if (!this.signalChartSeriesVisibility[series.key]) {
            return;
          }
          const source = series.technology === "LTE" ? point.lte : point.nr;
          const value = source ? source[series.metric] : null;
          if (typeof value === "number") {
            values.push(value);
          }
        });
      });

    if (values.length === 0) {
      return { hasData: false, min: 0, max: 1 };
    }

    let min = Math.min(...values);
    let max = Math.max(...values);
    if (min === max) {
      min -= 1;
      max += 1;
    }
    return { hasData: true, min, max };
  },

  getSignalChartSeries() {
    const seriesConfig = this.getSignalChartSeriesConfig();
    const now = Date.now();
    const start = now - this.signalChartDurationMs;
    const width = 1000;
    const height = 240;
    const paddingY = 20;
    const innerHeight = height - paddingY * 2;
    const scale = this.getSignalChartScale();
    const range = scale.max - scale.min || 1;
    const history = Array.isArray(this.signalHistory) ? this.signalHistory : [];
    const visibility = this.signalChartSeriesVisibility || {};

    return seriesConfig.reduce((acc, series) => {
      if (!visibility[series.key]) {
        return acc;
      }

      const points = history
        .filter((point) => point.timestamp >= start)
        .map((point) => {
          const source = series.technology === "LTE" ? point.lte : point.nr;
          const value = source ? source[series.metric] : null;
          if (typeof value !== "number") {
            return null;
          }
          const x = ((point.timestamp - start) / this.signalChartDurationMs) * width;
          const y = paddingY + ((scale.max - value) / range) * innerHeight;
          return {
            x: Math.max(0, Math.min(width, x)),
            y: Math.max(paddingY, Math.min(height - paddingY, y)),
          };
        })
        .filter((point) => point && typeof point.x === "number" && typeof point.y === "number");

      if (points.length === 0) {
        return acc;
      }

      if (points.length === 1) {
        const lonePoint = points[0];
        points.push({
          x: Math.min(width, lonePoint.x + 1),
          y: lonePoint.y,
        });
      }

      const pointsString = points
        .map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`)
        .join(" ");

      acc.push({
        ...series,
        points: pointsString,
      });

      return acc;
    }, []);
  },

  renderSignalChart(containerEl) {
    if (!containerEl) {
      return;
    }

    const svgNs = "http://www.w3.org/2000/svg";
    const seriesList = this.getSignalChartSeries();

    // Clear old polylines; this <g> is dedicated to the chart series.
    while (containerEl.firstChild) {
      containerEl.removeChild(containerEl.firstChild);
    }

    seriesList.forEach((series) => {
      const polyline = document.createElementNS(svgNs, "polyline");
      polyline.setAttribute("points", series.points);
      polyline.setAttribute("stroke", series.color);
      polyline.setAttribute("fill", "none");
      polyline.setAttribute("stroke-width", "3");
      polyline.setAttribute("stroke-linejoin", "round");
      polyline.setAttribute("stroke-linecap", "round");
      if (series.dasharray) {
        polyline.setAttribute("stroke-dasharray", series.dasharray);
      }
      containerEl.appendChild(polyline);
    });
  },

  formatSignalChartValue(value) {
    if (typeof value !== "number") {
      return "N/A";
    }
    return `${Math.round(value * 10) / 10}`;
  },

  init(skipLocalStorage = false) {
    // Clear any existing interval before creating a new one
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
    if (!skipLocalStorage) {
      const storedRefreshRate = localStorage.getItem("refreshRate");
      this.refreshRate = storedRefreshRate ? parseInt(storedRefreshRate) : 10;
    }
    // Everything on the dashboard is pushed by the two bridges; the only
    // request left is the LAN address, read once.
    this.bridgesSince = Date.now();
    this.connectBridge("diag");
    this.connectBridge("sys");
    this.fetchLanIpOnce();
    // Re-evaluates the radio source every 2 s: a diag_bridge that stops
    // pushing hands over to QMI even when nothing else arrives.
    this.intervalId = setInterval(() => {
      if (!document.hidden) this.refreshFromBridges();
    }, 2000);
    if (!this.visibilityHooked) {
      this.visibilityHooked = true;
      document.addEventListener("visibilitychange", () => {
        if (document.hidden) {
          this.disconnectBridge("diag");
          this.disconnectBridge("sys");
        } else {
          this.connectBridge("diag");
          this.connectBridge("sys");
        }
      });
    }
    console.log("Initialized");
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

  async confirmImeiChange() {
    if (!this.isImeiValid) {
      return;
    }
    const updated = await this.updateIMEI();
    if (updated) {
      this.showImeiInputModal = false;
      // Trigger global reboot modal
      const modal = document.getElementById('globalRebootModal');
      if (modal) {
        modal.style.display = 'flex';
      }
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
    if (!/^\d{15}$/.test(this.newImei)) {
      console.error("Invalid IMEI format. Must be exactly 15 digits.");
      return false;
    }

    const formatted = this.processImei(this.newImei);
    const byteCount = formatted.split(',').length;

    if (!formatted || byteCount !== 9) {
      console.error("Invalid IMEI formatting. Please re-enter and try again.");
      return false;
    }

    // Clear existing IMEI
    const clearCmd = `AT^NV=550,0`;
    const clearResult = await ATCommandService.execute(clearCmd, { retries: 1, timeout: 5000 });
    if (!clearResult.ok) {
      console.error("Failed to clear IMEI:", clearResult.error?.message || "Unknown error");
      return false;
    }

    await new Promise(resolve => setTimeout(resolve, 3000));

    // Set new IMEI
    const setCmd = `AT^NV=550,${byteCount},"${formatted}"`;
    const setResult = await ATCommandService.execute(setCmd, { retries: 1, timeout: 5000 });
    if (!setResult.ok) {
      console.error("Failed to set IMEI:", setResult.error?.message || "Unknown error");
      return false;
    }

    return true;
  },
};
}
