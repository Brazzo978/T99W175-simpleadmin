function diagSignalDashboard() {
  const missingMetric = (candidates) => ({
    value: null,
    status: "not_decoded",
    source_candidates: candidates,
  });

  const defaultMissingMetrics = () => ({
    lte: {
      dl_mcs: missingMetric(["LTE PHY/DL grant logs"]),
      ul_mcs: missingMetric(["LTE PHY/UL grant logs"]),
      dl_modulation: missingMetric(["LTE PHY/DL grant logs"]),
      ul_modulation: missingMetric(["LTE PHY/UL grant logs"]),
      dl_rb_alloc: missingMetric(["LTE PHY/DL grant logs"]),
      ul_rb_alloc: missingMetric(["LTE PHY/UL grant logs"]),
      cqi: missingMetric(["LTE CQI/PUCCH/PUSCH logs"]),
      ri: missingMetric(["LTE rank indicator logs"]),
      pmi: missingMetric(["LTE PMI logs"]),
      bler: missingMetric(["LTE HARQ/PHY ACK logs"]),
      tx_power_dbm: missingMetric(["LTE Tx power logs"]),
    },
    nr: {
      dl_mcs: missingMetric(["NR MAC/PHY scheduling logs"]),
      ul_mcs: missingMetric(["NR MAC/PHY scheduling logs"]),
      dl_modulation: missingMetric(["NR MAC/PHY scheduling logs"]),
      ul_modulation: missingMetric(["NR MAC/PHY scheduling logs"]),
      dl_rb_alloc: missingMetric(["NR MAC/PHY scheduling logs"]),
      ul_rb_alloc: missingMetric(["NR MAC/PHY scheduling logs"]),
      ss_rsrp_dbm: missingMetric(["NR ML1 measurement/log version mapping"]),
      ss_rsrq_db: missingMetric(["NR ML1 measurement/log version mapping"]),
      ss_sinr_db: missingMetric(["NR ML1 measurement/log version mapping"]),
      per_rx_rsrp_dbm: missingMetric(["NR ML1 per-RX mapping"]),
      per_rx_sinr_db: missingMetric(["NR ML1 per-RX mapping"]),
      nr_mode: missingMetric(["NR RRC/serving mode logs"]),
      endc_anchor: missingMetric(["LTE/NR ENDC relation logs"]),
      rank_ri: missingMetric(["NR rank indicator logs"]),
      cqi: missingMetric(["NR CQI logs"]),
      tx_power_dbm: missingMetric(["NR Tx power logs"]),
    },
  });

  const emptyState = () => ({
    lte: {
      serving_cell_measurement: null,
      serving_cell_info: null,
      per_antenna: {},
      mac: {
        dl: null,
        ul: null,
      },
      phy: {
        pusch_tx_candidate: null,
        pdsch_stat_candidate: null,
      },
    },
    nr: {
      serving_cell_info: null,
      ml1_latest: null,
    },
    combos: {
      lte: null,
      nr: null,
    },
    missing_metrics: defaultMissingMetrics(),
    warnings: [],
    meta: {
      events_seen: 0,
      started_at: 0,
      updated_at: 0,
      source: "qdiagmon-dci",
      parser_version: "SimpleAdmin-1.0.6",
      stale_after_ms: 3000,
    },
  });

  return {
    state: emptyState(),
    runtime: {
      running: false,
      pid: "",
      binary: "",
      logPath: "",
      errPath: "",
      comboDir: "",
      lastError: "",
      lastPollError: "",
      lastPollAt: null,
      eventLimit: 500,
      snapshotIntervalMs: 10000,
      maxRuntimeSec: 10,
      sampleMinMs: 500,
      sampleMode: "oneshot",
      sampleExitCode: 0,
      require: "signal",
      logCounts: [],
    },
    refreshMs: 10000,
    showDebug: false,
    isBusy: false,
    pollTimer: null,
    stopOnExitSent: false,
    parsedEventKeys: new Set(),
    rawEventTail: [],

    signalPercentagePoints: {
      SINR: [[-30, 0], [3, 20], [10, 40], [15, 65], [22, 85], [50, 100]],
      RSRP: [[-140, 0], [-115, 20], [-105, 40], [-95, 65], [-85, 85], [-10, 100]],
      RSRQ: [[-40, 0], [-20, 20], [-15, 40], [-10, 65], [-6, 85], [20, 100]],
      RSSI: [[-130, 0], [-105, 20], [-95, 40], [-85, 65], [-75, 85], [0, 100]],
    },

    signalThresholds: {
      RSSI: {
        unit: "dBm",
        thresholds: {
          min: { value: -130, color: "#6c757d" },
          red: { value: -105, color: "#dc3545" },
          orange: { value: -95, color: "#fd7e14" },
          yellow: { value: -85, color: "#ffc107" },
          green: { value: -75, color: "#28a745" },
          green_dark: { value: 0, color: "#006400" },
        },
      },
      RSRP: {
        unit: "dBm",
        thresholds: {
          min: { value: -140, color: "#6c757d" },
          red: { value: -115, color: "#dc3545" },
          orange: { value: -105, color: "#fd7e14" },
          yellow: { value: -95, color: "#ffc107" },
          green: { value: -85, color: "#28a745" },
          green_dark: { value: -10, color: "#006400" },
        },
      },
      RSRQ: {
        unit: "dB",
        thresholds: {
          min: { value: -40, color: "#6c757d" },
          red: { value: -20, color: "#dc3545" },
          orange: { value: -15, color: "#fd7e14" },
          yellow: { value: -10, color: "#ffc107" },
          green: { value: -6, color: "#28a745" },
          green_dark: { value: 20, color: "#006400" },
        },
      },
      SINR: {
        unit: "dB",
        thresholds: {
          min: { value: -30, color: "#6c757d" },
          red: { value: 3, color: "#dc3545" },
          orange: { value: 10, color: "#fd7e14" },
          yellow: { value: 15, color: "#ffc107" },
          green: { value: 22, color: "#28a745" },
          green_dark: { value: 50, color: "#006400" },
        },
      },
    },

    init() {
      this.fetchState();
      this.pollTimer = setInterval(() => this.fetchState(), this.refreshMs);
    },

    destroy() {
      if (this.pollTimer) {
        clearInterval(this.pollTimer);
        this.pollTimer = null;
      }
      this.stopRuntimeOnExit();
    },

    async requestDiag(action) {
      const response = await fetch(`/cgi-bin/diag_signal?action=${encodeURIComponent(action)}`, {
        credentials: "include",
        cache: "no-store",
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload || payload.status === "error") {
        const message = payload && payload.message ? payload.message : `DIAG request failed (${response.status})`;
        throw new Error(message);
      }
      return payload;
    },

    async startRuntime() {
      this.stopOnExitSent = false;
      await this.fetchState();
    },

    async stopRuntime() {
      this.isBusy = true;
      try {
        const payload = await this.requestDiag("stop");
        this.applyPayload(payload);
      } catch (error) {
        this.runtime.lastPollError = error.message;
      } finally {
        this.isBusy = false;
      }
    },

    stopRuntimeOnExit() {
      if ((!this.runtime.running && !this.isBusy) || this.stopOnExitSent) {
        return;
      }

      this.stopOnExitSent = true;
      const url = "/cgi-bin/diag_signal?action=stop";
      if (navigator.sendBeacon) {
        try {
          if (navigator.sendBeacon(url)) {
            return;
          }
        } catch (error) {}
      }

      fetch(url, {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        keepalive: true,
      }).catch(() => {});
    },

    async fetchState() {
      if (this.isBusy) {
        return;
      }

      this.isBusy = true;
      try {
        const payload = await this.requestDiag("state");
        this.applyPayload(payload);
      } catch (error) {
        this.runtime.lastPollError = error.message;
      } finally {
        this.isBusy = false;
      }
    },

    applyPayload(payload) {
      const snapshot = payload.snapshot && typeof payload.snapshot === "object" ? payload.snapshot : payload;
      const snapshotRuntime = snapshot.runtime && typeof snapshot.runtime === "object" ? snapshot.runtime : {};
      const running = payload.running === true || snapshotRuntime.running === true;

      this.runtime.running = running;
      this.runtime.pid = payload.pid || "";
      this.runtime.binary = payload.binary || "";
      this.runtime.logPath = payload.snapshot_path || payload.log_path || "";
      this.runtime.errPath = payload.err_path || "";
      this.runtime.comboDir = payload.combo_dir || "";
      this.runtime.lastError = payload.last_error || snapshotRuntime.last_error || "";
      this.runtime.eventLimit = payload.event_limit || this.runtime.eventLimit;
      this.runtime.snapshotIntervalMs = Number(payload.snapshot_interval_ms) || this.runtime.snapshotIntervalMs;
      this.runtime.maxRuntimeSec = Number(payload.max_runtime_sec) || this.runtime.maxRuntimeSec;
      this.runtime.sampleMinMs = Number(payload.sample_min_ms) || this.runtime.sampleMinMs;
      this.runtime.sampleMode = payload.sample_mode || this.runtime.sampleMode;
      this.runtime.sampleExitCode = Number(payload.sample_exit_code) || 0;
      this.runtime.require = payload.require || this.runtime.require;
      this.runtime.logCounts = Array.isArray(snapshotRuntime.log_counts) ? snapshotRuntime.log_counts : [];
      this.runtime.lastPollError = "";
      this.runtime.lastPollAt = new Date();

      this.applySnapshot(snapshot, payload);

      if (payload.combos && this.state.combos) {
        this.state.combos.lte = payload.combos.lte || this.state.combos.lte;
        this.state.combos.nr = payload.combos.nr || this.state.combos.nr;
      }

      const rawEvents = Array.isArray(payload.raw_events) ? payload.raw_events : [];
      this.rawEventTail = rawEvents.length
        ? rawEvents.slice(-80)
        : [JSON.stringify(snapshot, null, 2)];
      rawEvents.forEach((line) => this.ingestRawEvent(line));
    },

    applySnapshot(snapshot, payload = {}) {
      const nextState = emptyState();
      const lte = snapshot.lte && typeof snapshot.lte === "object" ? snapshot.lte : {};
      const nr = snapshot.nr && typeof snapshot.nr === "object" ? snapshot.nr : {};
      const runtime = snapshot.runtime && typeof snapshot.runtime === "object" ? snapshot.runtime : {};

      const perAntenna = Array.isArray(lte.per_antenna) ? lte.per_antenna : [];
      perAntenna.forEach((entry) => {
        const key = [
          entry.earfcn ?? "earfcn",
          entry.pci ?? "pci",
          entry.cell_index ?? "cell",
        ].join("-");
        nextState.lte.per_antenna[key] = entry;
      });

      nextState.lte.serving_cell_measurement = this.hasObjectData(lte.serving_cell)
        ? lte.serving_cell
        : this.deriveLteServing(perAntenna);
      nextState.lte.serving_cell_info = this.hasObjectData(lte.serving_info) ? lte.serving_info : null;

      const lteMac = lte.mac && typeof lte.mac === "object" ? lte.mac : {};
      nextState.lte.mac.dl = this.withDirection(this.firstArrayItem(lteMac.dl_by_cc) || lteMac.dl || null, "DL");
      nextState.lte.mac.ul = this.withDirection(this.firstArrayItem(lteMac.ul_by_cc) || lteMac.ul || null, "UL");

      const ltePhy = lte.phy && typeof lte.phy === "object" ? lte.phy : {};
      nextState.lte.phy.pusch_tx_candidate = this.hasObjectData(ltePhy.pusch_tx_candidate)
        ? ltePhy.pusch_tx_candidate
        : null;
      nextState.lte.phy.pdsch_stat_candidate = this.hasObjectData(ltePhy.pdsch_stat_candidate)
        ? ltePhy.pdsch_stat_candidate
        : null;

      nextState.nr.serving_cell_info = this.hasObjectData(nr.serving_cell) ? nr.serving_cell : null;
      nextState.nr.ml1_latest = {
        event: "measurement_database_update",
        log_id: this.nrLogRows().length ? "0xB97F" : "",
        layers: Array.isArray(nr.layers) ? nr.layers : [],
      };

      nextState.combos.lte = this.hasObjectData(lte.ca) ? lte.ca : null;
      nextState.combos.nr = this.hasObjectData(nr.ca) ? nr.ca : null;
      if (snapshot.missing_metrics && typeof snapshot.missing_metrics === "object") {
        nextState.missing_metrics = snapshot.missing_metrics;
      }

      nextState.meta.events_seen = Number(runtime.events_seen || snapshot.events_seen) || 0;
      nextState.meta.started_at = Number(payload.started_at || snapshot.started_at) || 0;
      nextState.meta.updated_at = Number(snapshot.updated_at || payload.updated_at) || 0;
      nextState.meta.source = payload.source || snapshot.source || "qdiagmon-dci";
      nextState.meta.parser_version = payload.parser_version || snapshot.parser_version || "SimpleAdmin-1.0.6";
      nextState.meta.stale_after_ms = Number(snapshot.stale_after_ms || payload.stale_after_ms) || 30000;

      this.state = nextState;
    },

    hasObjectData(value) {
      return value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length > 0;
    },

    firstArrayItem(value) {
      return Array.isArray(value) && value.length > 0 ? value[0] : null;
    },

    withDirection(block, direction) {
      if (!block || typeof block !== "object") {
        return null;
      }
      return { direction, ...block };
    },

    deriveLteServing(perAntenna) {
      const entry = perAntenna.find((item) => item && item.is_serving_cell) || perAntenna[0] || null;
      if (!entry) {
        return null;
      }
      return {
        event: "serving_cell_measurement",
        log_id: "snapshot",
        earfcn: entry.earfcn,
        pci: entry.pci,
        rsrp_dbm: entry.combined_rsrp_dbm ?? this.average(entry.rsrp_dbm),
        avg_rsrp_dbm: entry.filtered_rsrp_dbm ?? this.average(entry.rsrp_dbm),
        rsrq_db: entry.combined_rsrq_db ?? this.average(entry.rsrq_db),
        avg_rsrq_db: entry.filtered_rsrq_db ?? this.average(entry.rsrq_db),
        rssi_dbm: entry.combined_rssi_dbm ?? this.average(entry.rssi_dbm),
      };
    },

    ingestRawEvent(line) {
      if (!line || typeof line !== "string") {
        return;
      }

      let event;
      try {
        event = JSON.parse(line);
      } catch (error) {
        return;
      }

      const eventKey = this.eventKey(event);
      if (eventKey && this.parsedEventKeys.has(eventKey)) {
        return;
      }
      if (eventKey) {
        this.parsedEventKeys.add(eventKey);
        if (this.parsedEventKeys.size > 3000) {
          this.parsedEventKeys = new Set(Array.from(this.parsedEventKeys).slice(-1500));
        }
      }

      this.ingestEvent(event);
    },

    eventKey(event) {
      const parts = [
        event.event,
        event.log_id,
        event.qxdm_ts || event.time || "",
        event.earfcn || event.nr_arfcn || "",
        event.pci || event.serving_pci || "",
        event.cell_index ?? "",
        event.direction || "",
        event.sfn ?? "",
        event.subframe ?? "",
        event.harq_id ?? "",
      ];
      return parts.join("|");
    },

    ingestEvent(event) {
      const name = event.event || "";
      const rat = String(event.rat || "").toUpperCase();

      if (name === "serving_cell_measurement") {
        this.state.lte.serving_cell_measurement = event;
        return;
      }

      if (name === "per_antenna_measurement") {
        const key = [
          event.earfcn ?? "earfcn",
          event.pci ?? "pci",
          event.cell_index ?? "cell",
        ].join("-");
        this.state.lte.per_antenna[key] = event;
        return;
      }

      if (name === "lte_mac_transport_block") {
        if (String(event.direction).toUpperCase() === "UL") {
          this.state.lte.mac.ul = event;
        } else {
          this.state.lte.mac.dl = event;
        }
        return;
      }

      if (name === "measurement_database_update") {
        this.state.nr.ml1_latest = event;
        return;
      }

      if (name === "serving_cell_info") {
        if (rat === "NR" || event.nr_arfcn !== undefined || event.serving_pci !== undefined) {
          this.state.nr.serving_cell_info = event;
        } else {
          this.state.lte.serving_cell_info = event;
        }
        return;
      }

      if (name === "supported_ca_combos_raw") {
        const format = String(event.format || "").toUpperCase();
        if (format === "QNR" || event.log_id === "0xB826") {
          this.state.combos.nr = event;
        } else {
          this.state.combos.lte = event;
        }
        return;
      }

      if (name === "parse_warning" || name === "diag_log_raw") {
        this.state.warnings.unshift(event);
        this.state.warnings = this.state.warnings.slice(0, 20);
      }
    },

    ltePerAntennaEntries() {
      return Object.values(this.state.lte.per_antenna)
        .sort((a, b) => {
          const aServing = a.is_serving_cell ? 0 : 1;
          const bServing = b.is_serving_cell ? 0 : 1;
          return aServing - bServing || Number(a.cell_index || 0) - Number(b.cell_index || 0);
        });
    },

    nrLayers() {
      const layers = this.state.nr.ml1_latest && Array.isArray(this.state.nr.ml1_latest.layers)
        ? this.state.nr.ml1_latest.layers
        : [];
      return layers;
    },

    nrLogRows() {
      return (this.runtime.logCounts || [])
        .filter((row) => {
          const id = String(row.log_id || "").toUpperCase();
          const name = String(row.name || "").toLowerCase();
          return name.includes("nr_") || id.startsWith("0xB8") || id.startsWith("0xB9");
        })
        .map((row) => ({
          log_id: row.log_id || "-",
          name: row.name || "nr_log",
          count: Number(row.count) || 0,
        }));
    },

    hasNrActivity() {
      return this.nrLogRows().length > 0 || this.hasObjectData(this.state.nr.serving_cell_info);
    },

    nrSummaryLabel() {
      const layerCount = this.nrLayers().length;
      if (layerCount > 0) {
        return `${layerCount} layers`;
      }
      const eventCount = this.nrLogRows().reduce((sum, row) => sum + row.count, 0);
      if (eventCount > 0) {
        return `${eventCount} NR events / decoder pending`;
      }
      return "0 layers";
    },

    nrStatusLabel() {
      if (this.nrLayers().length > 0) {
        return "0xB97F";
      }
      return this.hasNrActivity() ? "NR logs" : "Pending";
    },

    latestPerAntennaServing() {
      return this.ltePerAntennaEntries().find((entry) => entry.is_serving_cell) || this.ltePerAntennaEntries()[0] || null;
    },

    latestNrLayer() {
      return this.nrLayers()[0] || null;
    },

    nrLayerHeading(layer) {
      const arfcn = this.displayOrDash(layer && layer.nr_arfcn, "nr_arfcn");
      const pci = this.displayOrDash(layer && layer.serving_pci, "pci");
      return `NR-ARFCN ${arfcn} / PCI ${pci}`;
    },

    nrLayerSubheading(layer) {
      if (!layer) {
        return "CC - / SSB -";
      }
      const cc = this.displayOrDash(layer.cc_id, "cc_id");
      const ssb = this.displayOrDash(layer.serving_ssb, "ssb");
      const version = layer.version ? ` / v${layer.version}` : "";
      const cells = Array.isArray(layer.cells) ? ` / ${layer.cells.length} cells` : "";
      return `CC ${cc} / SSB ${ssb}${version}${cells}`;
    },

    headlineCards() {
      const lteServing = this.state.lte.serving_cell_measurement;
      const lteAntenna = this.latestPerAntennaServing();
      const nrLayer = this.latestNrLayer();
      const nrRsrp = this.firstNumber(nrLayer && nrLayer.serving_rsrp_dbm);

      return [
        {
          label: "LTE RSRP",
          value: this.formatValue(lteServing && lteServing.rsrp_dbm, "dBm"),
          sub: this.cellSummary(lteServing, "earfcn"),
          iconClass: "icon-container icon-signal signal-good",
          bar: this.metricBar("RSRP", lteServing && lteServing.rsrp_dbm, "RSRP", "LTE"),
        },
        {
          label: "LTE SINR",
          value: this.formatValue(this.average(lteAntenna && lteAntenna.snr_db), "dB"),
          sub: lteAntenna ? `RX mask ${lteAntenna.valid_rx ?? "-"}` : "Waiting",
          iconClass: "icon-container icon-cloud connection-connected",
          bar: this.metricBar("SINR", this.average(lteAntenna && lteAntenna.snr_db), "SINR", "LTE"),
        },
        {
          label: "NR RSRP",
          value: this.formatValue(nrRsrp, "dBm"),
          sub: nrLayer ? `ARFCN ${nrLayer.nr_arfcn ?? "-"} / PCI ${nrLayer.serving_pci ?? "-"}` : "Waiting",
          iconClass: "icon-container icon-sim",
          bar: this.metricBar("RSRP", nrRsrp, "RSRP", "NR"),
        },
        {
          label: "DIAG Events",
          value: String(this.state.meta.events_seen || 0),
          sub: this.runtime.running ? `PID ${this.runtime.pid || "-"}` : "Stopped",
          iconClass: this.runtime.running ? "icon-container icon-cloud connection-connected" : "icon-container icon-cloud connection-disconnected",
          bar: {
            percentage: this.runtime.running ? 100 : 0,
            color: this.runtime.running ? "#10b981" : "#dc3545",
            display: this.runtime.running ? "Live" : "Stopped",
          },
        },
      ];
    },

    lteServingMetrics() {
      const serving = this.state.lte.serving_cell_measurement || {};
      return [
        this.metricBar("RSRP", serving.rsrp_dbm, "RSRP", "LTE"),
        this.metricBar("Avg RSRP", serving.avg_rsrp_dbm, "RSRP", "LTE"),
        this.metricBar("RSRQ", serving.rsrq_db, "RSRQ", "LTE"),
        this.metricBar("Avg RSRQ", serving.avg_rsrq_db, "RSRQ", "LTE"),
        this.metricBar("RSSI", serving.rssi_dbm, "RSSI", "LTE"),
      ];
    },

    ltePerAntennaMetrics(entry) {
      return [
        this.metricBar("Combined RSRP", entry.combined_rsrp_dbm, "RSRP", "LTE"),
        this.metricBar("Combined RSRQ", entry.combined_rsrq_db, "RSRQ", "LTE"),
        this.metricBar("Combined RSSI", entry.combined_rssi_dbm, "RSSI", "LTE"),
        this.metricBar("Filtered RSRP", entry.filtered_rsrp_dbm, "RSRP", "LTE"),
        this.metricBar("Filtered RSRQ", entry.filtered_rsrq_db, "RSRQ", "LTE"),
        this.metricBar("Projected SIR", entry.projected_sir_db, "SINR", "LTE"),
        this.metricBar("Post IC RSRQ", entry.post_ic_rsrq_db, "RSRQ", "LTE"),
      ].filter((metric) => metric.available);
    },

    lteRxMetrics(entry) {
      const rxMap = Array.isArray(entry.rx_map) ? entry.rx_map : [];
      const rsrp = Array.isArray(entry.rsrp_dbm) ? entry.rsrp_dbm : [];
      const rsrq = Array.isArray(entry.rsrq_db) ? entry.rsrq_db : [];
      const rssi = Array.isArray(entry.rssi_dbm) ? entry.rssi_dbm : [];
      const snr = Array.isArray(entry.snr_db) ? entry.snr_db : [];
      const size = Math.max(rsrp.length, rsrq.length, rssi.length, snr.length);

      return Array.from({ length: size }).map((_, index) => ({
        label: `RX ${rxMap[index] ?? index}`,
        rsrp: this.metricBar("RSRP", rsrp[index], "RSRP", "LTE"),
        rsrq: this.metricBar("RSRQ", rsrq[index], "RSRQ", "LTE"),
        rssi: this.metricBar("RSSI", rssi[index], "RSSI", "LTE"),
        sinr: this.metricBar("SINR", snr[index], "SINR", "LTE"),
      }));
    },

    nrLayerMetrics(layer) {
      const beamRows = [];
      if (Array.isArray(layer.cells)) {
        layer.cells.forEach((cell, cellIndex) => {
          const beams = Array.isArray(cell.beams) ? cell.beams : [];
          if (beams.length === 0) {
            const rsrp = this.firstValidNrNumber([cell.rsrp_dbm]);
            if (Number.isFinite(rsrp)) {
              beamRows.push({
                label: `PCI ${this.displayOrDash(cell.pci, "pci")}`,
                rsrp: this.metricBar("RSRP", rsrp, "RSRP", "NR"),
                beam: null,
                detail: `Cell ${cell.index ?? cellIndex} / RSRQ ${this.formatValue(this.firstValidNrNumber([cell.rsrq_db]), "dB")}`,
              });
            }
          }
          beams.forEach((beam, beamIndex) => {
            const rsrp = this.firstValidNrNumber([
              beam.filtered_l2nr_rsrp_dbm,
              beam.filtered_nr2nr_rsrp_dbm,
              ...(Array.isArray(beam.rsrp_dbm) ? beam.rsrp_dbm : []),
              cell.rsrp_dbm,
            ]);
            if (!Number.isFinite(rsrp)) {
              return;
            }
            beamRows.push({
              label: `PCI ${this.displayOrDash(cell.pci, "pci")}`,
              rsrp: this.metricBar("RSRP", rsrp, "RSRP", "NR"),
              beam: this.cleanNrValue(beam.ssb_index, "ssb"),
              detail: `Cell ${cell.index ?? cellIndex} / Beam ${beam.index ?? beamIndex} / RSRQ ${this.formatValue(this.firstValidNrNumber([beam.filtered_l2nr_rsrq_db, beam.filtered_nr2nr_rsrq_db, cell.rsrq_db]), "dB")}`,
            });
          });
        });
      }
      if (beamRows.length > 0) {
        return beamRows;
      }

      if (Array.isArray(layer.rx)) {
        return layer.rx.map((rx, index) => ({
          label: `RX ${rx.index ?? index}`,
          rsrp: this.metricBar("RSRP", this.firstValidNrNumber([rx.rsrp_dbm, rx.ss_rsrp_dbm]), "RSRP", "NR"),
          beam: this.cleanNrValue(rx.beam ?? rx.beam_id, "beam"),
          detail: `RFIC ${this.displayOrDash(rx.rfic ?? rx.rfic_id, "rfic")} / Subarray ${this.displayOrDash(rx.subarray, "subarray")}`,
        })).filter((row) => row.rsrp.available);
      }

      const servingRsrp = Array.isArray(layer.serving_rsrp_dbm)
        ? layer.serving_rsrp_dbm
        : [];
      return servingRsrp.map((value, index) => ({
        label: `RX ${index}`,
        rsrp: this.metricBar("RSRP", this.firstValidNrNumber([value]), "RSRP", "NR"),
        beam: Array.isArray(layer.rx_beam) ? this.cleanNrValue(layer.rx_beam[index], "beam") : null,
        detail: `RFIC ${this.displayOrDash(layer.rfic_id, "rfic")} / Subarray ${this.displayOrDash(Array.isArray(layer.subarray) ? layer.subarray[index] : layer.subarray, "subarray")}`,
      })).filter((row) => row.rsrp.available);
    },

    nrCells(layer) {
      if (Array.isArray(layer.cells)) {
        return layer.cells;
      }
      if (Array.isArray(layer.beams)) {
        return layer.beams;
      }
      return [];
    },

    nrCellMetrics(cell) {
      const beam = Array.isArray(cell.beams) ? cell.beams[0] : null;
      return [
        this.metricBar("RSRP", this.firstValidNrNumber([cell.rsrp_dbm]), "RSRP", "NR"),
        this.metricBar("RSRQ", this.firstValidNrNumber([cell.rsrq_db]), "RSRQ", "NR"),
        this.metricBar("Beam RSRP", beam ? this.firstValidNrNumber([beam.filtered_l2nr_rsrp_dbm, beam.filtered_nr2nr_rsrp_dbm, ...(Array.isArray(beam.rsrp_dbm) ? beam.rsrp_dbm : [])]) : null, "RSRP", "NR"),
        this.metricBar("Beam RSRQ", beam ? this.firstValidNrNumber([beam.filtered_l2nr_rsrq_db, beam.filtered_nr2nr_rsrq_db]) : null, "RSRQ", "NR"),
      ].filter((metric) => metric.available);
    },

    macRows(block) {
      if (!block) {
        return [];
      }
      const common = [
        ["Direction", block.direction],
        ["SFN/Subframe", this.joinDefined([block.sfn, block.subframe], "/")],
        ["HARQ", block.harq_id],
        ["RNTI", block.rnti_type],
      ];
      const dl = [
        ["TBS", this.formatValue(block.tbs_bytes, "bytes", 0)],
        ["Padding", this.formatValue(block.padding_bytes, "bytes", 0)],
        ["CC", block.cc_id],
        ["SDU", block.num_sdu],
        ["LCID", block.num_lcid],
      ];
      const ul = [
        ["Grant", block.grant],
        ["RLC PDUs", block.rlc_pdus],
        ["Padding", this.formatValue(block.padding_bytes, "bytes", 0)],
        ["BSR Event", block.bsr_event],
        ["BSR Trigger", block.bsr_trigger],
      ];
      return common.concat(String(block.direction).toUpperCase() === "UL" ? ul : dl)
        .filter((row) => row[1] !== undefined && row[1] !== null && row[1] !== "");
    },

    ltePuschRows() {
      const pusch = this.state.lte.phy && this.state.lte.phy.pusch_tx_candidate;
      if (!pusch) {
        return [];
      }

      const rows = [
        { label: "UL Modulation", key: "pusch_modulation" },
        { label: "Mod Order", key: "pusch_mod_order", decimals: 0 },
        { label: "RB Start S0", key: "rb_start_slot0", decimals: 0 },
        { label: "RB Start S1", key: "rb_start_slot1", decimals: 0 },
        { label: "RB Count", key: "rb_count", decimals: 0 },
        { label: "TB Size", key: "tb_size", unit: "bytes", decimals: 0 },
        { label: "Coding Rate", key: "coding_rate", decimals: 3 },
        { label: "RV", key: "rv", decimals: 0 },
        { label: "Retx Index", key: "retx_index", decimals: 0 },
        { label: "Carrier ID", key: "carrier_id", decimals: 0 },
        { label: "CQI Flag", key: "cqi_flag", flag: true },
        { label: "RI Flag", key: "ri_flag", flag: true },
        { label: "Tx Power", key: "tx_power_dbm_candidate", unit: "dBm" },
      ];

      return rows
        .map((row) => [row.label, this.formatPuschValue(pusch[row.key], row)])
        .filter((row) => row[1] !== null);
    },

    formatPuschValue(value, row) {
      if (value === undefined || value === null || value === "") {
        return null;
      }
      if (row.flag) {
        const numeric = this.toNumber(value);
        if (Number.isFinite(numeric)) {
          return numeric ? "Yes" : "No";
        }
        return String(value);
      }
      if (row.unit || row.decimals !== undefined) {
        const numeric = this.toNumber(value);
        if (Number.isFinite(numeric)) {
          return this.formatValue(numeric, row.unit || "", row.decimals ?? 2);
        }
      }
      return String(value);
    },

    resolvedLteMissingKeys() {
      const pusch = this.state.lte.phy && this.state.lte.phy.pusch_tx_candidate;
      const resolved = new Set();
      if (!pusch) {
        return resolved;
      }
      if (pusch.pusch_modulation !== undefined && pusch.pusch_modulation !== null && pusch.pusch_modulation !== "") {
        resolved.add("ul_modulation");
      }
      if (pusch.rb_count !== undefined && pusch.rb_count !== null && pusch.rb_count !== "") {
        resolved.add("ul_rb_alloc");
      }
      if (pusch.tx_power_dbm_candidate !== undefined && pusch.tx_power_dbm_candidate !== null && pusch.tx_power_dbm_candidate !== "") {
        resolved.add("tx_power_dbm");
      }
      return resolved;
    },

    missingMetricRows(rat) {
      const resolved = rat === "lte" ? this.resolvedLteMissingKeys() : new Set();
      return Object.entries(this.state.missing_metrics[rat] || {})
        .filter(([key]) => !resolved.has(key))
        .map(([key, item]) => ({
          key,
          label: key.replace(/_/g, " ").toUpperCase(),
          status: item.status || "not_decoded",
          candidates: Array.isArray(item.source_candidates) ? item.source_candidates.join(", ") : "",
        }));
    },

    comboCards() {
      return [
        { label: "LTE CA Combos", data: this.state.combos.lte, format: "QLTE" },
        { label: "NR CA Combos", data: this.state.combos.nr, format: "QNR" },
      ];
    },

    metricBar(label, value, type, technology) {
      const numeric = this.toNumber(value);
      const available = Number.isFinite(numeric);
      if (!available) {
        return {
          label,
          value: null,
          display: "Pending",
          percentage: 0,
          color: "#6c757d",
          available: false,
        };
      }

      const percentage = Math.round(this.piecewisePercentage(numeric, this.signalPercentagePoints[type] || []));
      const color = this.getInterpolatedSignalColor(numeric, type, technology);
      return {
        label,
        value: numeric,
        display: this.formatValue(numeric, this.signalThresholds[type]?.unit || ""),
        percentage,
        color,
        available: true,
      };
    },

    piecewisePercentage(value, points) {
      if (!Number.isFinite(value) || !Array.isArray(points) || points.length === 0) {
        return 0;
      }

      const [firstX, firstY] = points[0];
      const [lastX, lastY] = points[points.length - 1];
      if (value <= firstX) {
        return firstY;
      }
      if (value >= lastX) {
        return lastY;
      }

      for (let index = 0; index < points.length - 1; index += 1) {
        const [x1, y1] = points[index];
        const [x2, y2] = points[index + 1];
        if (value >= x1 && value <= x2) {
          return y1 + ((value - x1) / (x2 - x1)) * (y2 - y1);
        }
      }
      return 0;
    },

    getInterpolatedSignalColor(value, type, technology) {
      const config = this.signalThresholds[type];
      if (!config || !Number.isFinite(value)) {
        return "#6c757d";
      }

      const thresholds = { ...config.thresholds };
      if (type === "SINR" && technology === "NR") {
        thresholds.min = { value: -50, color: thresholds.min.color };
      }

      const stops = Object.values(thresholds)
        .filter((threshold) => typeof threshold.value === "number")
        .sort((a, b) => a.value - b.value);

      if (value <= stops[0].value) {
        return stops[0].color;
      }
      if (value >= stops[stops.length - 1].value) {
        return stops[stops.length - 1].color;
      }

      for (let index = 0; index < stops.length - 1; index += 1) {
        const start = stops[index];
        const end = stops[index + 1];
        if (value >= start.value && value <= end.value) {
          const factor = (value - start.value) / (end.value - start.value || 1);
          return this.interpolateColor(start.color, end.color, factor);
        }
      }

      return "#6c757d";
    },

    interpolateColor(colorA, colorB, factor) {
      const a = this.hexToRgb(colorA);
      const b = this.hexToRgb(colorB);
      if (!a || !b) {
        return colorA || colorB || "#6c757d";
      }
      const clamped = Math.max(0, Math.min(1, factor));
      const mix = (left, right) => Math.round(left + (right - left) * clamped);
      return this.rgbToHex({
        r: mix(a.r, b.r),
        g: mix(a.g, b.g),
        b: mix(a.b, b.b),
      });
    },

    hexToRgb(hex) {
      const clean = String(hex || "").replace("#", "");
      if (!/^[0-9a-f]{6}$/i.test(clean)) {
        return null;
      }
      const value = parseInt(clean, 16);
      return {
        r: (value >> 16) & 255,
        g: (value >> 8) & 255,
        b: value & 255,
      };
    },

    rgbToHex({ r, g, b }) {
      const toHex = (value) => value.toString(16).padStart(2, "0");
      return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
    },

    average(values) {
      if (!Array.isArray(values)) {
        return null;
      }
      const numbers = values.map((value) => this.toNumber(value)).filter(Number.isFinite);
      if (numbers.length === 0) {
        return null;
      }
      return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
    },

    firstNumber(values) {
      if (!Array.isArray(values)) {
        return this.toNumber(values);
      }
      return values.map((value) => this.toNumber(value)).find(Number.isFinite);
    },

    firstValidNrNumber(values) {
      const list = Array.isArray(values) ? values : [values];
      return list
        .map((value) => this.cleanNrValue(value, "metric"))
        .find(Number.isFinite);
    },

    cleanNrValue(value, kind = "metric") {
      const numeric = this.toNumber(value);
      if (!Number.isFinite(numeric)) {
        return null;
      }
      if ((kind === "pci" || kind === "rfic" || kind === "subarray") && numeric === 65535) {
        return null;
      }
      if ((kind === "cell_index" || kind === "ssb" || kind === "beam") && numeric === 255) {
        return null;
      }
      if (kind === "metric" && numeric === 0) {
        return null;
      }
      return numeric;
    },

    displayOrDash(value, kind = "metric") {
      const cleaned = this.cleanNrValue(value, kind);
      return Number.isFinite(cleaned) ? cleaned : "-";
    },

    toNumber(value) {
      if (value === null || value === undefined || value === "") {
        return null;
      }
      const numeric = typeof value === "number" ? value : parseFloat(value);
      return Number.isFinite(numeric) ? numeric : null;
    },

    formatValue(value, unit = "", decimals = 2) {
      const numeric = this.toNumber(value);
      if (!Number.isFinite(numeric)) {
        return "Pending";
      }
      const fixed = Number.isInteger(numeric) || decimals === 0
        ? String(Math.round(numeric))
        : numeric.toFixed(decimals);
      return unit ? `${fixed} ${unit}` : fixed;
    },

    formatEpoch(seconds) {
      const numeric = Number(seconds);
      if (!Number.isFinite(numeric) || numeric <= 0) {
        return "Pending";
      }
      return new Date(numeric * 1000).toLocaleString();
    },

    ageSeconds() {
      const updated = Number(this.state.meta.updated_at || 0);
      if (!updated) {
        return null;
      }
      return Math.max(0, Math.round(Date.now() / 1000 - updated));
    },

    isStale() {
      const age = this.ageSeconds();
      if (age === null) {
        return true;
      }
      return age * 1000 > Number(this.state.meta.stale_after_ms || 3000);
    },

    statusBadgeClass() {
      if (this.isBusy || this.runtime.running) {
        return "text-bg-primary";
      }
      return this.isStale() ? "text-bg-warning" : "text-bg-success";
    },

    statusLabel() {
      if (this.isBusy || this.runtime.running) {
        return "Sampling";
      }
      return this.isStale() ? "Stale" : "Ready";
    },

    refreshSeconds() {
      return Math.max(1, Math.round(this.refreshMs / 1000));
    },

    runtimeLimitLabel() {
      const seconds = Number(this.runtime.maxRuntimeSec || 0);
      return seconds > 0 ? `${seconds}s` : "manual";
    },

    cellSummary(event, channelKey) {
      if (!event) {
        return "Waiting";
      }
      const channel = event[channelKey] ?? event.nr_arfcn ?? "-";
      const pci = event.pci ?? event.serving_pci ?? "-";
      return `Channel ${channel} / PCI ${pci}`;
    },

    joinDefined(values, separator) {
      const filtered = values.filter((value) => value !== undefined && value !== null && value !== "");
      return filtered.length ? filtered.join(separator) : "Pending";
    },

    copyToClipboard(value) {
      if (navigator.clipboard && value) {
        navigator.clipboard.writeText(String(value)).catch(() => {});
      }
    },
  };
}
