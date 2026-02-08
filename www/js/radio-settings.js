/**
 * Radio and cellular settings management for the modem web UI.
 *
 * Provides Alpine.js component for managing radio/cellular settings:
 * - Band selection and locking (LTE/NSA/SA)
 * - Cell locking via EARFCN/PCI
 * - APN configuration
 * - Network mode selection (3G/4G/5G)
 * - SIM slot management
 * - eSIM management integration
 *
 * @module radio-settings
 * @requires Alpine.js
 * @requires atcommand-utils.js
 * @requires populate-checkbox.js
 * @requires generate-freq-box.js
 */

/**
 * Alpine.js component for radio/cellular settings functionality.
 *
 * Manages cellular radio configuration including band locking, cell locking,
 * APN settings, network mode preferences, and SIM selection.
 *
 * @returns {Object} Alpine.js component data object
 */
const QNWPREFCFG_AVAILABLE_BANDS = {
  LTE: [
    1, 2, 3, 4, 5, 7, 8, 12, 13, 14, 18, 19, 20, 25, 26, 28, 29, 30, 32,
    34, 38, 39, 40, 41, 42, 43, 46, 48, 66, 71,
  ],
  NSA: [
    1, 2, 3, 5, 7, 8, 12, 20, 25, 28, 38, 40, 41, 48, 66, 71, 77, 78, 79,
  ],
  SA: [
    1, 2, 3, 5, 7, 8, 12, 20, 25, 28, 38, 40, 41, 48, 66, 71, 77, 78, 79,
  ],
};

function cellLocking() {
  return {
    // Loading state for radio operations
    isLoading: false,
    // Cell lock modal visibility
    showModalCellLock: false,
    // Band lock modal visibility
    showModalBand: false,
    // SIM slot modal visibility
    showModalSim: false,
    // APN configuration modal visibility
    showModalAPN: false,
    // Countdown timer for modals
    countdown: 5,
    // Toast notification visibility and message
    showToast: false,
    toastMessage: "",
    toastType: "info",
    waitingForBandSelection: false,
    // Last error message string
    lastErrorMessage: "",
    // Active utility tab (apn/cell-lock/band-lock)
    activeUtilityTab: "apn",
    // Current network mode display
    networkModeCell: "-",
    // EARFCN/PCI pairs for up to 10 cells
    earfcn1: null,
    pci1: null,
    earfcn2: null,
    pci2: null,
    earfcn3: null,
    pci3: null,
    earfcn4: null,
    pci4: null,
    earfcn5: null,
    pci5: null,
    earfcn6: null,
    pci6: null,
    earfcn7: null,
    pci7: null,
    earfcn8: null,
    pci8: null,
    earfcn9: null,
    pci9: null,
    earfcn10: null,
    pci10: null,
    // Subcarrier spacing value
    scs: null,
    // Current band
    band: null,
    // Current APN
    apn: "-",
    // Current APN IP address
    apnIP: "-",
    // New APN IP to set
    newApnIP: null,
    // New APN to set
    newApn: null,
    // Preferred network mode
    prefNetwork: "-",
    // Preferred network mode value
    prefNetworkValue: null,
    // RAT acquisition order (Quectel)
    ratAcqOrder: ["NR5G", "LTE", "WCDMA"],
    // Which RAT toggles should be shown/enabled in the UI
    prefNetworkSupports: {
      threeG: true,
      fourG: true,
      fiveG: true,
    },
    // 5G NR mode display
    nr5gMode: "Unknown",
    // 5G mode update in progress
    isUpdatingNr5gMode: false,
    // Preferred network selection checkboxes
    preferredNetworkSelection: {
      threeG: false,
      fourG: false,
      fiveG: false,
    },
    // Saving preferred network flag
    isSavingPrefNetwork: false,
    // Cell lock number
    cellNum: null,
    // LTE bands string
    lte_bands: "",
    // NSA bands string
    nsa_bands: "",
    // SA bands string
    sa_bands: "",
    // Locked LTE bands string
    locked_lte_bands: "",
    // Locked NSA bands string
    locked_nsa_bands: "",
    // Locked SA bands string
    locked_sa_bands: "",
    // Current network mode (LTE/NSA/SA)
    currentNetworkMode: "LTE",
    // Updated locked bands array
    updatedLockedBands: [],
    // Current SIM slot display
    sim: "-",
    // Pending SIM slot change
    pendingSimSlot: null,
    // SIM change in progress
    isApplyingSimChange: false,
    // Cell lock status display
    cellLockStatus: "Unknown",
    // Bands display string
    bands: "Fetching Bands...",
    // Number of selected bands
    selectedBandsCount: 0,
    // Band lock timeout timer
    bandLockTimeout: null,
    // Previous locked bands for comparison
    previousLockedBands: [],
    // Band lock backend (qnwprefcfg only on this modem)
    bandLockBackend: "qnwprefcfg",
    // Read-only mode for band lock (no writes yet)
    bandLockReadOnly: true,
    // All available bands by mode
    allAvailableBands: {
      LTE: [],
      NSA: [],
      SA: []
    },
    // Get bands operation in progress
    isGettingBands: false,
    // Raw AT command response data
    rawdata: "",
    // Network mode listener attached flag
    networkModeListenerAttached: false,
    // Provider bands listener attached flag
    providerBandsListenerAttached: false,
    // eSIM manager enabled flag
    esimManagerEnabled: false,
    // eSIM toggle operation in progress
    isTogglingEsim: false,

    /**
     * Parses APN contexts from AT+CGDCONT response.
     *
     * Extracts CID, type, and APN from CGDCONT response lines.
     *
     * @param {string} rawData - Raw AT+CGDCONT response
     * @returns {Array<Object>} Array of APN context objects {cid, type, apn}
     */
    parseApnContexts(rawData) {
      if (typeof rawData !== "string") {
        return [];
      }

      return rawData
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.startsWith("+CGDCONT:"))
        .map((line) => {
          const match = line.match(
            /\+CGDCONT:\s*(\d+),\"([^\"]*)\",\"([^\"]*)\"/i
          );

          if (!match) {
            return null;
          }

          return {
            cid: parseInt(match[1], 10),
            type: match[2],
            apn: match[3],
          };
        })
        .filter(Boolean)
        .sort((a, b) => a.cid - b.cid);
    },
    async ensurePrimaryApnProfile() {
      const response = await this.sendATcommand('AT+CGDCONT?');

      if (!response.ok || !response.data) {
        return {
          ok: false,
          message:
            this.lastErrorMessage ||
            "Unable to read current APN profiles.",
        };
      }

      const contexts = this.parseApnContexts(response.data);

      const contextsToDelete = contexts.filter((ctx) => ctx.cid !== 1);

      for (const ctx of contextsToDelete) {
        const deleteResult = await this.sendATcommand(
          `AT+CGDCONT=${ctx.cid}`
        );

        if (!deleteResult.ok) {
          return {
            ok: false,
            message:
              this.lastErrorMessage ||
              `Unable to remove APN profile ${ctx.cid}.`,
          };
        }
      }

      return { ok: true };
    },
    sanitizeApn(apn) {
      if (typeof apn !== "string") {
        return "";
      }
      return apn.trim();
    },
    isValidApn(apn) {
      return /^[a-zA-Z0-9._-]{1,63}$/.test(apn);
    },
    mapApnTypeLabelToValue(label) {
      const normalized = (label || "")
        .toString()
        .trim()
        .toUpperCase();
      const mapping = {
        IPV4: "1",
        IPV6: "2",
        IPV4V6: "3",
        PPP: "4",
      };
      return mapping[normalized] || null;
    },
    mapApnTypeValueToCommand(value) {
      const mapping = {
        "1": "IP",
        "2": "IPV6",
        "3": "IPV4V6",
        "4": "PPP",
      };
      return mapping[value] || null;
    },
    mapSimDisplayToCommandValue(value) {
      if (value === "1" || value === 1) {
        return "1";
      }
      if (value === "2" || value === 2) {
        return "2";
      }
      return null;
    },
    isValidSimCommandValue(value) {
      return value === "1" || value === "2";
    },
    canApplySimSelection() {
      if (!this.isValidSimCommandValue(this.pendingSimSlot)) {
        return false;
      }

      return this.sim !== this.pendingSimSlot;
    },
    formatActiveSimLabel() {
      if (this.sim === "1") {
        return "SIM 1";
      }
      if (this.sim === "2") {
        return "SIM 2 / eSIM";
      }
      return "Unknown";
    },

    async getSupportedBands() {
      // Load the checkbox state from localStorage
      const isChecked =
        localStorage.getItem("providerBandsChecked") === "true";
      const providerBands = document.getElementById("providerBands");

      if (providerBands) {
        providerBands.checked = isChecked;
      }

      this.isGettingBands = true;

      try {
        const quectelCmd = 'AT+QNWPREFCFG="lte_band";AT+QNWPREFCFG="nsa_nr5g_band";AT+QNWPREFCFG="nr5g_band"';
        const quectelResult = await this.sendATcommand(quectelCmd);

        if (!quectelResult.ok || !quectelResult.data) {
          console.warn(
            "Unable to fetch supported bands:",
            this.lastErrorMessage
          );
          this.bands = "Bands not available";
          return;
        }

        this.bandLockBackend = "qnwprefcfg";
        this.bandLockReadOnly = false;

        this.rawdata = quectelResult.data;
        const parsed = this.parseQnwprefcfgBands(quectelResult.data);
        if (!parsed) {
          console.warn("Unable to parse QNWPREFCFG bands.");
          this.bands = "Bands not available";
          return;
        }

        const availableLte = [...QNWPREFCFG_AVAILABLE_BANDS.LTE];
        const availableNsa = [...QNWPREFCFG_AVAILABLE_BANDS.NSA];
        const availableSa = [...QNWPREFCFG_AVAILABLE_BANDS.SA];

        const filterActive = (list, available) =>
          list.filter((band) => available.includes(band));

        this.lte_bands = availableLte.join(":");
        this.nsa_bands = availableNsa.join(":");
        this.sa_bands = availableSa.join(":");

        this.locked_lte_bands = filterActive(parsed.lte, availableLte).join(":");
        this.locked_nsa_bands = filterActive(parsed.nsa, availableNsa).join(":");
        this.locked_sa_bands = filterActive(parsed.sa, availableSa).join(":");

        this.allAvailableBands.LTE = availableLte;
        this.allAvailableBands.NSA = availableNsa;
        this.allAvailableBands.SA = availableSa;

        populateCheckboxes(
          this.lte_bands,
          this.nsa_bands,
          this.sa_bands,
          this.locked_lte_bands,
          this.locked_nsa_bands,
          this.locked_sa_bands,
          this
        );

      } finally {
        this.isGettingBands = false;
      }
    },

    parseQnwprefcfgBands(rawdata) {
      const lines = String(rawdata || "")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line);

      const bands = {
        lte: [],
        nsa: [],
        sa: [],
      };

      for (const line of lines) {
        const match = line.match(/\+QNWPREFCFG:\s*\"(lte_band|nsa_nr5g_band|nr5g_band)\"\s*,\s*(.*)$/i);
        if (!match) {
          continue;
        }
        const type = match[1].toLowerCase();
        const listRaw = (match[2] || "").replace(/"/g, "").trim();
        const numbers = listRaw
          ? listRaw.split(":")
            .map((s) => s.trim())
            .filter(Boolean)
            .map(Number)
            .filter((value) => !Number.isNaN(value))
          : [];

        if (type === "lte_band") {
          bands.lte = numbers;
        }
        if (type === "nsa_nr5g_band") {
          bands.nsa = numbers;
        }
        if (type === "nr5g_band") {
          bands.sa = numbers;
        }
      }

      if (bands.lte.length === 0 && bands.nsa.length === 0 && bands.sa.length === 0) {
        return null;
      }

      const uniqSort = (arr) => [...new Set(arr)].sort((a, b) => a - b);

      return {
        lte: uniqSort(bands.lte),
        nsa: uniqSort(bands.nsa),
        sa: uniqSort(bands.sa),
      };
    },

    async init() {
      console.log("=== init() called ===");
      const self = this;

      const showPopulateCheckboxes = async () => {
        console.log("--- showPopulateCheckboxes START ---");
        const currentMode = document.getElementById("networkModeBand")?.value;
        console.log("Current dropdown mode:", currentMode);
        
        try {
          await self.getSupportedBands();
          console.log("After getSupportedBands:");
          console.log("  lte_bands:", self.lte_bands);
          console.log("  nsa_bands:", self.nsa_bands);
          console.log("  sa_bands:", self.sa_bands);
          console.log("  locked_lte_bands:", self.locked_lte_bands);
          console.log("  locked_nsa_bands:", self.locked_nsa_bands);
          console.log("  locked_sa_bands:", self.locked_sa_bands);

          // Store all available bands for each technology
          self.allAvailableBands.LTE = self.lte_bands.split(':').filter(Boolean);
          self.allAvailableBands.NSA = self.nsa_bands.split(':').filter(Boolean);
          self.allAvailableBands.SA = self.sa_bands.split(':').filter(Boolean);
          
          console.log("All available bands stored:");
          console.log("  LTE:", self.allAvailableBands.LTE);
          console.log("  NSA:", self.allAvailableBands.NSA);
          console.log("  SA:", self.allAvailableBands.SA);

          addCheckboxListeners(self);

          const checkboxes = document.querySelectorAll(
            '#checkboxForm input[type="checkbox"]'
          );
          
          console.log("Total checkboxes found:", checkboxes.length);
          
          const checkedValues = [];
          const allValues = [];

          checkboxes.forEach(function (checkbox) {
            allValues.push(checkbox.value);
            if (checkbox.checked) {
              checkedValues.push(checkbox.value);
            }
          });

          console.log("All checkbox values:", allValues);
          console.log("Checked checkbox values:", checkedValues);

          // Update state
          self.updatedLockedBands = checkedValues;
          self.previousLockedBands = [...checkedValues];
          self.selectedBandsCount = checkedValues.length;
          self.currentNetworkMode = currentMode;
          
          console.log("State updated:");
          console.log("  updatedLockedBands:", self.updatedLockedBands);
          console.log("  previousLockedBands:", self.previousLockedBands);
          console.log("  selectedBandsCount:", self.selectedBandsCount);
          console.log("  currentNetworkMode:", self.currentNetworkMode);
          console.log("--- showPopulateCheckboxes END ---");

        } catch (error) {
          console.error("ERROR in showPopulateCheckboxes:", error);
        }
      };

      this.trackCheckboxChanges = (event) => {
        console.log(">>> trackCheckboxChanges triggered <<<");
        if (self.bandLockReadOnly && self.bandLockBackend !== "qnwprefcfg") {
          console.log("Band locking is read-only; ignoring changes");
          self.showToastNotification(
            "Band locking is read-only on this modem.",
            "info",
            true
          );
          populateCheckboxes(
            self.lte_bands,
            self.nsa_bands,
            self.sa_bands,
            self.locked_lte_bands,
            self.locked_nsa_bands,
            self.locked_sa_bands,
            self
          );
          return;
        }

        const modeDropdown = document.getElementById("networkModeBand");
        const selectedMode = modeDropdown ? modeDropdown.value : null;
        console.log("Selected mode:", selectedMode);

        const checkboxes = document.querySelectorAll(
          '#checkboxForm input[type="checkbox"]'
        );
        const newCheckedValues = [];

        checkboxes.forEach(function (checkbox) {
          if (checkbox.checked) {
            newCheckedValues.push(checkbox.value);
          }
        });

        console.log("New checked values:", newCheckedValues);
        console.log("Count:", newCheckedValues.length);

        // Validation: At least one band must be selected
        if (newCheckedValues.length === 0) {
          console.warn("VALIDATION: No bands selected, reverting last change");
          const lastChanged = event?.target;
          if (lastChanged && lastChanged.type === 'checkbox') {
            lastChanged.checked = true;
            alert("At least one band must be selected.\nUse 'Reset' to restore all available bands.");
          }
          return;
        }

        // Hide banner if user selected a band after using "Uncheck All"
        if (self.waitingForBandSelection) {
          console.log("User selected a band, hiding notification banner");
          self.waitingForBandSelection = false;
          self.showToast = false;
        }

        console.log("Updating state:");
        console.log("  OLD updatedLockedBands:", self.updatedLockedBands);
        console.log("  NEW updatedLockedBands:", newCheckedValues);
        
        self.currentNetworkMode = selectedMode || self.currentNetworkMode;
        self.updatedLockedBands = newCheckedValues;
        self.selectedBandsCount = newCheckedValues.length;
        
        clearTimeout(self.bandLockTimeout);
        console.log("Setting timeout for lockSelectedBandsAuto (1500ms)...");
        self.bandLockTimeout = setTimeout(() => {
          self.lockSelectedBandsAuto();
        }, 1500);
        console.log(">>> trackCheckboxChanges END <<<");
      };

      const addNetworkModeListener = () => {
        if (self.networkModeListenerAttached) {
          console.log("Network mode listener already attached");
          return;
        }

        const dropdown = document.getElementById("networkModeBand");

        if (!dropdown) {
          console.warn("Network mode dropdown not found.");
          return;
        }

        dropdown.addEventListener("change", () => {
          console.log("!!! NETWORK MODE DROPDOWN CHANGED !!!");
          console.log("New value:", dropdown.value);
          
          clearTimeout(self.bandLockTimeout);
          console.log("Cleared pending timeout");
          
          showPopulateCheckboxes();
        });

        self.networkModeListenerAttached = true;
        console.log("Network mode listener attached");
      };

      const addProviderBandsListener = () => {
        if (self.providerBandsListenerAttached) {
          console.log("Provider bands listener already attached");
          return;
        }

        const providerBands = document.getElementById("providerBands");

        if (!providerBands) {
          console.warn("Provider bands checkbox not found.");
          return;
        }

        providerBands.addEventListener("change", () => {
          console.log("Provider bands checkbox changed");
          clearTimeout(self.bandLockTimeout);
          showPopulateCheckboxes();
        });

        self.providerBandsListenerAttached = true;
        console.log("Provider bands listener attached");
      };

      addNetworkModeListener();
      addProviderBandsListener();
      // Load in a user-visible order to reduce perceived latency.
      // AT command access is serialized server-side; parallel calls just queue and feel slow.
      try {
        await this.refreshSimSlot();
        const simReady = await this.isSimReady();

        // 1) APN
        if (simReady) {
          await this.fetchApnInfo();
        }

        // 2) Bands
        await showPopulateCheckboxes();

        // 3) Preferred network (RAT enable/disable)
        await this.loadPreferredNetwork();

        // 4) Cell lock status
        if (simReady) {
          await this.fetchCellLockStatus();
        } else {
          this.cellLockStatus = "Not Available";
        }

        // 5) Device info (deferred; triggered after radio settings are loaded)
        setTimeout(() => {
          try {
            window.dispatchEvent(new Event("simpleadmin:deviceinfo:autofetch"));
          } catch (error) {
            console.debug("Unable to dispatch deviceinfo autofetch event", error);
          }
        }, 0);
      } catch (error) {
        console.warn("Radio settings init sequence failed:", error);
      }
      console.log("=== init() completed ===");
    },

    async refreshSimSlot() {
      const basicResult = await this.sendATcommand("AT+QUIMSLOT?");
      if (basicResult.ok && basicResult.data) {
        const slotMatch = basicResult.data.match(/\+QUIMSLOT:\s*(\d+)/i);
        if (slotMatch) {
          this.sim = slotMatch[1];
          this.pendingSimSlot = this.sim;
        }
      }
    },

    async isSimReady() {
      const simCheckResult = await this.sendATcommand("AT+CPIN?");
      if (!simCheckResult.ok || !simCheckResult.data) {
        return false;
      }
      return String(simCheckResult.data).toUpperCase().includes("READY");
    },

    parseQnwprefcfgValue(lines, key) {
      const wanted = String(key || "").toLowerCase();
      if (!wanted) {
        return null;
      }

      const line = (lines || []).find((entry) =>
        entry.toLowerCase().includes(`+qnwprefcfg: "${wanted}"`)
      );
      if (!line) {
        return null;
      }

      const parts = line.split(",");
      if (parts.length < 2) {
        return null;
      }

      return parts
        .slice(1)
        .join(",")
        .replace(/"/g, "")
        .trim();
    },

    describePrefNetworkMode(modePref) {
      const value = (modePref || "").toString().trim();
      if (!value) {
        return "Unknown";
      }
      if (value.toUpperCase() === "AUTO") {
        return "Auto";
      }

      const map = { WCDMA: "3G", LTE: "4G", NR5G: "5G" };
      const tokens = value
        .split(":")
        .map((t) => t.trim().toUpperCase())
        .filter(Boolean);

      const labels = [];
      if (tokens.includes("WCDMA")) labels.push(map.WCDMA);
      if (tokens.includes("LTE")) labels.push(map.LTE);
      if (tokens.includes("NR5G")) labels.push(map.NR5G);

      return labels.length ? labels.join(" + ") : value;
    },

    updatePreferredNetworkSelectionFromModePref(modePref) {
      this.preferredNetworkSelection.threeG = false;
      this.preferredNetworkSelection.fourG = false;
      this.preferredNetworkSelection.fiveG = false;

      const value = (modePref || "").toString().trim();
      if (!value) {
        return;
      }

      // In the UI, "all unchecked" represents AUTO.
      if (value.toUpperCase() === "AUTO") {
        return;
      }

      const tokens = value
        .split(":")
        .map((t) => t.trim().toUpperCase())
        .filter(Boolean);

      this.preferredNetworkSelection.threeG = tokens.includes("WCDMA");
      this.preferredNetworkSelection.fourG = tokens.includes("LTE");
      this.preferredNetworkSelection.fiveG = tokens.includes("NR5G");
    },

    computePreferredNetworkModeFromSelection() {
      const selected = [];
      if (this.preferredNetworkSelection.threeG) selected.push("WCDMA");
      if (this.preferredNetworkSelection.fourG) selected.push("LTE");
      if (this.preferredNetworkSelection.fiveG) selected.push("NR5G");

      if (selected.length === 0) {
        return "AUTO";
      }

      // If all supported toggles are enabled, keep AUTO for stability.
      if (
        this.prefNetworkSupports.threeG &&
        this.prefNetworkSupports.fourG &&
        this.prefNetworkSupports.fiveG &&
        selected.length === 3
      ) {
        return "AUTO";
      }

      const order = Array.isArray(this.ratAcqOrder) && this.ratAcqOrder.length
        ? this.ratAcqOrder
        : ["NR5G", "LTE", "WCDMA"];

      return order.filter((rat) => selected.includes(rat)).join(":");
    },

    async loadPreferredNetwork() {
      // Read-only fetch of Quectel RAT config.
      const result = await this.sendATcommand(
        'AT+QNWPREFCFG="mode_pref";AT+QNWPREFCFG="rat_acq_order"'
      );

      if (!result.ok || !result.data) {
        console.warn("Unable to fetch preferred network:", this.lastErrorMessage);
        this.prefNetworkValue = null;
        this.prefNetwork = "Not Available";
        return;
      }

      const lines = String(result.data || "")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0);

      const ratOrderRaw = this.parseQnwprefcfgValue(lines, "rat_acq_order");
      if (ratOrderRaw) {
        const order = ratOrderRaw
          .split(":")
          .map((t) => t.trim().toUpperCase())
          .filter(Boolean);
        if (order.length) {
          this.ratAcqOrder = order;
        }
      }

      // Toggle visibility based on supported RATs.
      const supported = new Set((this.ratAcqOrder || []).map((v) => v.toUpperCase()));
      this.prefNetworkSupports.threeG = supported.has("WCDMA");
      this.prefNetworkSupports.fourG = supported.has("LTE");
      this.prefNetworkSupports.fiveG = supported.has("NR5G");

      const modePref = this.parseQnwprefcfgValue(lines, "mode_pref");
      if (!modePref) {
        this.prefNetworkValue = null;
        this.prefNetwork = "Not Available";
        return;
      }

      this.prefNetworkValue = modePref.toUpperCase();
      this.prefNetwork = this.describePrefNetworkMode(this.prefNetworkValue);
      this.updatePreferredNetworkSelectionFromModePref(this.prefNetworkValue);
    },

    async fetchCellLockStatus() {
      const result = await this.sendATcommand(
        'AT+QNWLOCK="common/4g";AT+QNWLOCK="common/5g"'
      );

      if (!result.ok || !result.data) {
        console.warn("Unable to fetch cell lock status:", this.lastErrorMessage);
        this.cellLockStatus = "Unknown";
        return;
      }

      const lines = String(result.data || "")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0);

      const qnw4g = lines.find((line) => line.includes('+QNWLOCK: "common/4g"')) || "";
      const qnw5g = lines.find((line) => line.includes('+QNWLOCK: "common/5g"')) || "";

      const lteLocks =
        typeof parseQnwLock4g === "function" ? parseQnwLock4g(qnw4g) : [];
      const nrLocks =
        typeof parseQnwLock5g === "function" ? parseQnwLock5g(qnw5g) : [];

      const statusParts = [];
      if (typeof describeLteLock === "function") {
        const desc = describeLteLock(lteLocks);
        if (desc) statusParts.push(desc);
      } else if (lteLocks.length > 0) {
        statusParts.push(`LTE (${lteLocks.length})`);
      }

      if (typeof describeNrLock === "function") {
        const desc = describeNrLock(nrLocks);
        if (desc) statusParts.push(desc);
      } else if (nrLocks.length > 0) {
        statusParts.push(`NR5G-SA (${nrLocks.length})`);
      }

      this.cellLockStatus = statusParts.length > 0 ? statusParts.join(" | ") : "Not Locked";
      this.networkModeCell = "Cell Lock: " + this.cellLockStatus;
    },

    parseApnInfo(rawdata) {
      if (typeof rawdata !== "string") {
        return { apn: null, apnIP: null };
      }

      const lines = rawdata
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0);

      const findPrimaryLine = (prefix) => {
        const upperPrefix = `+${prefix.toUpperCase()}`;
        const primary = lines.find((line) =>
          line.toUpperCase().startsWith(`${upperPrefix}: 1`)
        );
        return primary || lines.find((line) =>
          line.toUpperCase().startsWith(`${upperPrefix}:`)
        );
      };

      let apn = null;
      const apnContrdpLine = findPrimaryLine("CGCONTRDP");
      if (apnContrdpLine) {
        const parts = apnContrdpLine.split(",");
        if (parts.length >= 3) {
          apn = parts[2].replace(/"/g, "").trim();
        }
      }

      let apnIP = null;
      const apnCgdcontLine = findPrimaryLine("CGDCONT");
      if (apnCgdcontLine) {
        const parts = apnCgdcontLine.split(",");
        if (parts.length >= 2) {
          apnIP = parts[1].replace(/"/g, "").trim();
        }
        if (!apn && parts.length >= 3) {
          apn = parts[2].replace(/"/g, "").trim();
        }
      }

      return { apn, apnIP };
    },

    async fetchApnInfo() {
      const apnResult = await this.sendATcommand(
        "AT+CGDCONT?;AT+CGCONTRDP=1"
      );

      if (!apnResult.data) {
        console.warn("Unable to fetch APN info:", this.lastErrorMessage);
        return;
      }

      const apnInfo = this.parseApnInfo(apnResult.data);
      if (apnInfo.apn) {
        this.apn = apnInfo.apn;
      }
      if (apnInfo.apnIP) {
        this.apnIP = apnInfo.apnIP;
      }
    },

    async getCurrentSettings() {
      console.log("=== getCurrentSettings START ===");

      try {
        await this.refreshSimSlot();
        const simReady = await this.isSimReady();

        if (simReady) {
          await this.fetchApnInfo();
        } else {
          this.apn = "Not Available";
          this.apnIP = "Not Available";
        }

        await this.loadPreferredNetwork();

        if (simReady) {
          await this.fetchCellLockStatus();
        } else {
          this.cellLockStatus = "Not Available";
          this.networkModeCell = "Cell Lock: " + this.cellLockStatus;
        }

        await this.getEsimManagerStatus();
      } catch (error) {
        console.warn("getCurrentSettings failed:", error);
      } finally {
        console.log("Final SIM value:", this.sim);
        console.log("Final pendingSimSlot:", this.pendingSimSlot);
        console.log("=== getCurrentSettings END ===");
      }
    },
    
    async getEsimManagerStatus() {
      try {
        const response = await fetch('/config/simpleadmin.conf');
        const text = await response.text();
        const match = text.match(/SIMPLEADMIN_ENABLE_ESIM=([01])/);
        if (match) {
          this.esimManagerEnabled = match[1] === '1';
        }
      } catch (error) {
        console.error('Failed to get eSIM manager status:', error);
      }
    },

    async toggleEsimManager(event) {
      if (this.isTogglingEsim) {
        event?.preventDefault();
        return;
      }
      
      const targetState = this.esimManagerEnabled ? 1 : 0;
      const actionText = targetState === 1 ? 'enable' : 'disable';
      
      if (!confirm(`Are you sure you want to ${actionText} the eSIM manager?`)) {
        // Revert the checkbox
        this.esimManagerEnabled = !this.esimManagerEnabled;
        return;
      }
      
      this.isTogglingEsim = true;
      
      try {
        const response = await fetch('/cgi-bin/toggle_esim', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            enabled: targetState
          })
        });
        
        console.log('Response status:', response.status);
        const responseText = await response.text();
        console.log('Response text:', responseText);
        
        let result;
        try {
          result = JSON.parse(responseText);
        } catch (parseError) {
          console.error('Failed to parse JSON response:', responseText);
          throw new Error('Invalid response from server: ' + responseText);
        }
        
        if (!result.ok) {
          throw new Error(result.message || 'Failed to toggle eSIM manager');
        }
        
        alert(result.message || `eSIM manager ${actionText}d successfully`);
        
        // Update eSIM nav item visibility
        const esimMenuItem = document.getElementById('esimMenuItem');
        if (esimMenuItem) {
          esimMenuItem.style.display = targetState === 1 ? 'list-item' : 'none';
        }
        if (typeof updateConfigMenuDivider === "function") {
          updateConfigMenuDivider();
        }
        
      } catch (error) {
        console.error('Error toggling eSIM manager:', error);
        alert(`Failed to ${actionText} eSIM manager: ${error.message}`);
        // Revert the checkbox on error
        this.esimManagerEnabled = !this.esimManagerEnabled;
      } finally {
        this.isTogglingEsim = false;
      }
    },  
    formatPreferredNetworkLabel() {
      if (this.prefNetworkValue === null) {
        return 'Fetching...';
      }

      return this.prefNetwork || 'Unknown';
    },
    describePrefNetworkValue(value) {
      // Backward-compatible wrapper (older code used numeric SLMODE).
      return this.describePrefNetworkMode(value);
    },
    updatePreferredNetworkSelectionFromValue(value) {
      // Backward-compatible wrapper (older code used numeric SLMODE).
      this.updatePreferredNetworkSelectionFromModePref(value);
    },
    computePreferredNetworkValueFromSelection() {
      return this.computePreferredNetworkModeFromSelection();
    },
    async savePreferredNetwork() {
      if (this.isSavingPrefNetwork) {
        return;
      }

      if (this.prefNetworkValue === null) {
        alert('Preferred network information is still loading.');
        return;
      }

      const targetMode = this.computePreferredNetworkModeFromSelection();
      if (!targetMode) {
        alert('Unable to determine the preferred network selection.');
        return;
      }

      const normalizedTarget = targetMode.toString().trim().toUpperCase();
      if (normalizedTarget === this.prefNetworkValue) {
        alert('No changes made');
        return;
      }

      this.isSavingPrefNetwork = true;

      const result = await this.sendATcommand(
        `AT+QNWPREFCFG="mode_pref",${normalizedTarget}`
      );

      this.isSavingPrefNetwork = false;

      if (!result.ok) {
        alert(
          this.lastErrorMessage ||
            'Unable to save the preferred network. Please try again.'
        );
        return;
      }

      this.prefNetworkValue = normalizedTarget;
      this.prefNetwork = this.describePrefNetworkMode(this.prefNetworkValue);
      this.updatePreferredNetworkSelectionFromModePref(this.prefNetworkValue);
    },
    showToastNotification(message, type = "info", autoHide = true) {
      this.toastMessage = message;
      this.toastType = type;
      this.showToast = true;

      // Only auto-hide if not waiting for band selection
      if (autoHide && !this.waitingForBandSelection) {
        setTimeout(() => {
          this.showToast = false;
        }, 4000);
      }
    },
    uncheckAllBands() {
      console.log("=== uncheckAllBands called ===");
      if (this.bandLockReadOnly) {
        this.showToastNotification(
          "Band locking is read-only on this modem.",
          "info",
          true
        );
        return;
      }

      const checkboxes = document.querySelectorAll('#checkboxForm input[type="checkbox"]');
      const checkedCount = Array.from(checkboxes).filter(cb => cb.checked).length;

      console.log(`Current selected bands: ${checkedCount}`);

      // Prevent unchecking if 1 or fewer bands are selected
      if (checkedCount <= 1) {
        this.showToastNotification(
          "Select at least 2 bands before using Uncheck All.",
          "warning",
          true
        );
        console.log("ABORT: Less than 2 bands selected");
        return;
      }

      // Clear any pending timeout to prevent command execution after uncheck
      if (this.bandLockTimeout) {
        clearTimeout(this.bandLockTimeout);
        console.log("Cleared pending band lock timeout");
      }

      // Uncheck all checkboxes
      checkboxes.forEach(function (checkbox) {
        checkbox.checked = false;
      });

      // Set flag to keep banner visible until user selects a band
      this.waitingForBandSelection = true;

      // Show info message to user via toast (won't auto-hide)
      this.showToastNotification(
        "All bands unchecked. Please select at least one band to apply changes.",
        "info",
        false
      );

      console.log("All checkboxes unchecked, waiting for user selection");
      console.log("=== uncheckAllBands completed ===");
    },
    async lockSelectedBandsAuto() {
      console.log("=== lockSelectedBandsAuto called ===");
      if (this.bandLockReadOnly) {
        this.showToastNotification(
          "Band locking is read-only on this modem.",
          "info",
          true
        );
        return;
      }
      console.log("currentNetworkMode:", this.currentNetworkMode);
      console.log("updatedLockedBands:", this.updatedLockedBands);

      const selectedMode = this.currentNetworkMode;
      const newCheckedValues = Array.isArray(this.updatedLockedBands)
        ? this.updatedLockedBands
        : [];

      if (selectedMode === null || newCheckedValues.length === 0) {
        console.warn("ABORT: Invalid mode or no bands");
        return;
      }

      // Get all available bands for current technology
      const allBands = this.allAvailableBands[selectedMode] || [];
      console.log(`All available bands for ${selectedMode}:`, allBands);
      console.log(`Selected bands: ${newCheckedValues.length}/${allBands.length}`);

      const selectedBands = newCheckedValues
        .map((value) => Number.parseInt(value, 10))
        .filter((value) => Number.isInteger(value))
        .sort((a, b) => a - b);

      if (selectedBands.length === 0) {
        console.warn("ABORT: No valid bands selected");
        return;
      }

      let atcmd = "";

      if (this.bandLockBackend === "qnwprefcfg") {
        let bandKey = "";

        if (selectedMode === "LTE") {
          bandKey = "lte_band";
        } else if (selectedMode === "NSA") {
          bandKey = "nsa_nr5g_band";
        } else if (selectedMode === "SA") {
          bandKey = "nr5g_band";
        } else {
          console.warn("ABORT: Invalid network mode:", selectedMode);
          return;
        }

        const bands = selectedBands.join(":");
        atcmd = `AT+QNWPREFCFG="${bandKey}",${bands}`;
      } else {
        // Map selectedMode to the correct AT command network type
        let atCommandPrefix;

        if (selectedMode === "LTE") {
          atCommandPrefix = "LTE";
        } else if (selectedMode === "NSA") {
          atCommandPrefix = "NR5G_NSA";
        } else if (selectedMode === "SA") {
          atCommandPrefix = "NR5G_SA";
        } else {
          console.warn("ABORT: Invalid network mode:", selectedMode);
          return;
        }

        // Always send the complete band list, even if all bands are selected
        // Only use empty AT^BAND_PREF_EXT for explicit "Reset to Defaults" button
        const bands = selectedBands.join(":");
        atcmd = `AT^BAND_PREF_EXT=${atCommandPrefix},2,${bands}`;
      }

      console.log(`Sending enable command with ${selectedBands.length} bands:`, atcmd);

      const result = await this.sendATcommand(atcmd);

      if (!result.ok) {
        console.error("FAILED to enable bands:", this.lastErrorMessage);
        alert(`Failed to update bands: ${this.lastErrorMessage}`);
        return;
      }

      console.log("Bands enabled successfully");

      // Update previous state
      this.previousLockedBands = selectedBands.map((value) => String(value));
      if (selectedMode === "LTE") {
        this.locked_lte_bands = selectedBands.join(":");
      } else if (selectedMode === "NSA") {
        this.locked_nsa_bands = selectedBands.join(":");
      } else if (selectedMode === "SA") {
        this.locked_sa_bands = selectedBands.join(":");
      }

      console.log("=== lockSelectedBandsAuto completed ===");
    },
    async applySimSelection() {
      if (this.isApplyingSimChange) {
        return;
      }

      const targetSlot = this.pendingSimSlot;

      if (!this.isValidSimCommandValue(targetSlot)) {
        alert("Select a valid SIM before continuing.");
        return;
      }

      let currentSlot = this.mapSimDisplayToCommandValue(this.sim);

      if (currentSlot === null) {
        await this.getCurrentSettings();
        currentSlot = this.mapSimDisplayToCommandValue(this.sim);
      }

      if (currentSlot !== null && currentSlot === targetSlot) {
        alert("The selected SIM is already active.");
        return;
      }

      // Initialize countdown BEFORE showing modal to avoid flash
      this.countdown = 5;
      this.isApplyingSimChange = true;
      this.showModalSim = true;

      const result = await this.sendATcommand(
        `AT+QUIMSLOT=${targetSlot}`
      );

      if (!result.ok) {
        this.isApplyingSimChange = false;
        this.showModalSim = false;
        alert(
            this.lastErrorMessage ||
              "Unable to change SIM. Please try again."
        );
        return;
      }

      const interval = setInterval(() => {
        this.countdown--;
        if (this.countdown === 0) {
          clearInterval(interval);

          this.showModalSim = false;
          this.isApplyingSimChange = false;
          this.init();
        }
      }, 1000);
    },
    async saveChanges() {
      const commandsToRun = [];
      const hasApnInput = typeof this.newApn === "string";
      const sanitizedNewApn = hasApnInput
        ? this.sanitizeApn(this.newApn)
        : "";

      if (hasApnInput) {
        this.newApn = sanitizedNewApn;
      }

      const selectedApnTypeRaw = this.newApnIP;
      const selectedApnType =
        selectedApnTypeRaw === null ||
        selectedApnTypeRaw === undefined ||
        selectedApnTypeRaw === ""
          ? null
          : selectedApnTypeRaw;

      const currentApnSanitized = this.sanitizeApn(this.apn);
      const hasCurrentApn =
        currentApnSanitized.length > 0 &&
        this.apn !== "-" &&
        this.apn !== "Failed fetching APN";

      let targetApn = null;
      let targetApnType = null;

      if (hasApnInput) {
        if (sanitizedNewApn.length === 0) {
          alert("APN cannot be empty.");
          return;
        }

        if (!this.isValidApn(sanitizedNewApn)) {
          alert(
            "The APN can include only letters, numbers, periods, hyphens, and underscores (max 63 characters)."
          );
          return;
        }

        targetApn = sanitizedNewApn;
      }

      if (selectedApnType !== null) {
        if (["1", "3"].includes(selectedApnType)) {
          targetApnType = selectedApnType;
        } else {
          alert("Select a valid PDP type.");
          return;
        }
      }

      if (targetApn !== null && targetApnType === null) {
        const currentType = this.mapApnTypeLabelToValue(this.apnIP);
        targetApnType = currentType || "3";
      }

      if (targetApn === null && targetApnType !== null) {
        if (!hasCurrentApn) {
          alert(
            "Unable to change the PDP type because the current APN is unavailable."
          );
          return;
        }

        if (!this.isValidApn(currentApnSanitized)) {
          alert(
            "Unable to change the PDP type because the current APN is invalid."
          );
          return;
        }

        targetApn = currentApnSanitized;
      }

      if (targetApn !== null) {
        if (targetApnType === null) {
          const currentType = this.mapApnTypeLabelToValue(this.apnIP);

          if (!currentType) {
            alert(
              "Unable to determine the current PDP type. Please select a new value."
            );
            return;
          }

          targetApnType = currentType;
        }

        const typeLabel = this.mapApnTypeValueToCommand(targetApnType);

        if (!typeLabel) {
          alert(
            "Unable to build the APN command because the PDP type is invalid."
          );
          return;
        }

        commandsToRun.push({
          command: `AT+CGDCONT=1,"${typeLabel}","${targetApn}"`,
          errorMessage: "Unable to configure the APN.",
        });
      }


      if (commandsToRun.length === 0) {
        alert("No changes made");
        return;
      }

      const requiresBasebandRestart = commandsToRun.some((step) =>
        step.command.startsWith("AT+CGDCONT=1")
      );

      // Initialize countdown BEFORE showing modal to avoid flash
      this.countdown = 10;
      this.showModalAPN = true;

      // Start countdown interval immediately
      const interval = setInterval(() => {
        this.countdown--;
        if (this.countdown === 0) {
          clearInterval(interval);
          this.showModalAPN = false;
          this.newApn = null;
          this.newApnIP = null;
          this.init();
        }
      }, 1000);

      if (requiresBasebandRestart) {
        const cleanupResult = await this.ensurePrimaryApnProfile();

        if (!cleanupResult.ok) {
          clearInterval(interval);
          this.showModalAPN = false;
          alert(
            cleanupResult.message ||
              "Unable to prepare the APN profiles."
          );
          return;
        }
      }

      for (const step of commandsToRun) {
        const result = await this.sendATcommand(step.command);

        if (!result.ok) {
          clearInterval(interval);
          this.showModalAPN = false;
          alert(
            this.lastErrorMessage ||
              step.errorMessage ||
              "Unable to execute the requested command."
          );
          return;
        }
      }

      if (requiresBasebandRestart) {
        const radioOff = await this.sendATcommand("AT+CFUN=0");

        if (!radioOff.ok) {
          clearInterval(interval);
          this.showModalAPN = false;
          alert(
            this.lastErrorMessage ||
              "Error while shutting down the baseband."
          );
          return;
        }

        const radioOn = await this.sendATcommand("AT+CFUN=1");

        if (!radioOn.ok) {
          clearInterval(interval);
          this.showModalAPN = false;
          alert(
            this.lastErrorMessage ||
              "Error while restarting the baseband."
          );
          return;
        }
      }
    },
    async cellLockEnableLTE() {
      const cellNum = this.cellNum;

      if (cellNum === null) {
        alert("Please enter the number of cells to lock");
        return; // Exit the function early if cellNum is null
      }

      // Create an array to hold earfcn and pci pairs
      const earfcnPciPairs = [
        { earfcn: this.earfcn1, pci: this.pci1 },
        { earfcn: this.earfcn2, pci: this.pci2 },
        { earfcn: this.earfcn3, pci: this.pci3 },
        { earfcn: this.earfcn4, pci: this.pci4 },
        { earfcn: this.earfcn5, pci: this.pci5 },
        { earfcn: this.earfcn6, pci: this.pci6 },
        { earfcn: this.earfcn7, pci: this.pci7 },
        { earfcn: this.earfcn8, pci: this.pci8 },
        { earfcn: this.earfcn9, pci: this.pci9 },
        { earfcn: this.earfcn10, pci: this.pci10 },
      ];

      // Filter out pairs where either earfcn or pci is null
      const validPairs = earfcnPciPairs.filter(
        (pair) => pair.earfcn !== null && pair.pci !== null
      );

      if (validPairs.length === 0) {
        alert("Please enter at least one valid earfcn and pci pair");
        return; // Exit the function early if no valid pairs are found
      }

      // Construct the AT command using the valid pairs
      const atcmd = `AT+QNWLOCK="common/4g",${validPairs.length},${validPairs
        .map((pair) => `${pair.earfcn},${pair.pci}`)
        .join(",")}`;

      // Initialize countdown BEFORE showing modal to avoid flash
      this.countdown = 5;
      this.showModalCellLock = true;
      const result = await this.sendATcommand(atcmd);

      if (!result.ok) {
        this.showModalCellLock = false;
        alert(
          this.lastErrorMessage ||
            "Unable to apply the LTE lock."
        );
        return;
      }

      const interval = setInterval(() => {
        this.countdown--;
        if (this.countdown === 0) {
          clearInterval(interval);
          this.showModalCellLock = false;
          this.getCurrentSettings();
          this.networkModeCell = 'Cell Lock: ' + this.cellLockStatus;
        }
      }, 1000);
    },
    async cellLockEnableNR() {
      const earfcn = this.earfcn1;
      const pci = this.pci1;
      const scs = this.scs;
      const band = this.band;

      if (
        earfcn === null ||
        pci === null ||
        scs === null ||
        band === null
      ) {
        alert("Please enter all the required fields");
        return; // Exit the function early if any of the fields are null
      }

      // Construct the AT command using the valid pairs
      const scsValue = Number.parseInt(scs, 10);
      const scsKhzMap = {
        0: 15,
        1: 30,
        2: 60,
        3: 120,
        4: 240,
      };
      const scsKhz =
        scsKhzMap[scsValue] || (Number.isInteger(scsValue) ? scsValue : null);

      if (!scsKhz) {
        alert("Please select a valid SCS value.");
        return;
      }

      const atcmd = `AT+QNWLOCK="common/5g",${pci},${earfcn},${scsKhz},${band}`;

      // Initialize countdown BEFORE showing modal to avoid flash
      this.countdown = 5;
      this.showModalCellLock = true;
      const result = await this.sendATcommand(atcmd);

      if (!result.ok) {
        this.showModalCellLock = false;
        alert(
          this.lastErrorMessage ||
            "Unable to apply the NR5G lock."
        );
        return;
      }

      const interval = setInterval(() => {
        this.countdown--;
        if (this.countdown === 0) {
          clearInterval(interval);
          this.showModalCellLock = false;
          this.getCurrentSettings();
          this.networkModeCell = 'Cell Lock: ' + this.cellLockStatus;
        }
      }, 1000);
    },
    async cellLockDisableLTE() {
      // Send the atcmd command to reset the locked bands
      const atcmd = 'AT+QNWLOCK="common/4g",0';

      // Initialize countdown BEFORE showing modal to avoid flash
      this.countdown = 5;
      this.showModalCellLock = true;

      const result = await this.sendATcommand(atcmd);

      if (!result.ok) {
        this.showModalCellLock = false;
        alert(
          this.lastErrorMessage ||
            "Unable to remove the LTE lock."
        );
        return;
      }

      const interval = setInterval(() => {
        this.countdown--;
        if (this.countdown === 0) {
          clearInterval(interval);
          this.showModalCellLock = false;
          this.getCurrentSettings();
        }
      }, 1000);
    },
    async cellLockDisableNR() {
      // Send the atcmd command to reset the locked bands
      const atcmd = 'AT+QNWLOCK="common/5g",0';

      // Initialize countdown BEFORE showing modal to avoid flash
      this.countdown = 5;
      this.showModalCellLock = true;

      const result = await this.sendATcommand(atcmd);

      if (!result.ok) {
        this.showModalCellLock = false;
        alert(
          this.lastErrorMessage ||
            "Unable to remove the NR5G lock."
        );
        return;
      }

      const interval = setInterval(() => {
        this.countdown--;
        if (this.countdown === 0) {
          clearInterval(interval);
          this.showModalCellLock = false;
          this.getCurrentSettings();
        }
      }, 1000);
    },
    async setNr5gMode(mode) {
      const modes = {
        NSA: 1,
        SA: 2,
      };

      const value = modes[mode];

      if (!value) {
        alert("Invalid NR5G mode selected.");
        return;
      }

      this.isUpdatingNr5gMode = true;

      try {
        const result = await this.sendATcommand(`AT^NR5G_MODE=${value}`);

        if (!result.ok) {
          alert(this.lastErrorMessage || "Unable to set NR5G mode.");
          return;
        }

        this.nr5gMode = mode;
        await this.getCurrentSettings();        
      } finally {
        this.isUpdatingNr5gMode = false;
      }
    },
    async resetApnSettings() {
      const shouldReset = confirm(
        "Resetting will delete every configured APN and restart the modem. Continue?"
      );

      if (!shouldReset) {
        return;
      }

      // Initialize countdown BEFORE showing modal to avoid flash
      this.countdown = 60;
      this.showModalAPN = true;

      const response = await this.sendATcommand('AT+CGDCONT?');

      if (!response.ok || !response.data) {
        this.showModalAPN = false;
        alert(
          this.lastErrorMessage ||
            "Unable to read current APN profiles."
        );
        return;
      }

      const contexts = this.parseApnContexts(response.data);

      for (const ctx of contexts) {
        const deleteResult = await this.sendATcommand(
          `AT+CGDCONT=${ctx.cid}`
        );

        if (!deleteResult.ok) {
          this.showModalAPN = false;
          alert(
            this.lastErrorMessage ||
              `Unable to remove APN profile ${ctx.cid}.`
          );
          return;
        }
      }

      const restartResult = await this.sendATcommand('AT+CFUN=1,1');

      if (!restartResult.ok) {
        this.showModalAPN = false;
        alert(
          this.lastErrorMessage ||
            "Unable to restart the modem."
        );
        return;
      }

      this.apn = "-";
      this.apnIP = "-";
      this.newApn = null;
      this.newApnIP = null;

      const interval = setInterval(() => {
        this.countdown--;
        if (this.countdown === 0) {
          clearInterval(interval);
          this.showModalAPN = false;
          this.init();
        }
      }, 1000);
    },    
    async resetBandLocking() {
      console.log("=== resetBandLocking called ===");
      if (this.bandLockBackend !== "qnwprefcfg") {
        alert("Band reset is not supported on this modem.");
        return;
      }

      const availableLte =
        this.allAvailableBands.LTE && this.allAvailableBands.LTE.length
          ? this.allAvailableBands.LTE
          : QNWPREFCFG_AVAILABLE_BANDS.LTE;
      const availableNsa =
        this.allAvailableBands.NSA && this.allAvailableBands.NSA.length
          ? this.allAvailableBands.NSA
          : QNWPREFCFG_AVAILABLE_BANDS.NSA;
      const availableSa =
        this.allAvailableBands.SA && this.allAvailableBands.SA.length
          ? this.allAvailableBands.SA
          : QNWPREFCFG_AVAILABLE_BANDS.SA;

      const commands = [];
      if (availableLte.length) {
        commands.push(
          `AT+QNWPREFCFG="lte_band",${availableLte.join(":")}`
        );
      }
      if (availableNsa.length) {
        commands.push(
          `AT+QNWPREFCFG="nsa_nr5g_band",${availableNsa.join(":")}`
        );
      }
      if (availableSa.length) {
        commands.push(
          `AT+QNWPREFCFG="nr5g_band",${availableSa.join(":")}`
        );
      }

      if (commands.length === 0) {
        alert("No available bands to reset.");
        return;
      }

      const atcmd = commands.join(";");

      // Initialize countdown BEFORE showing modal to avoid flash
      this.countdown = 3;
      this.showModalBand = true;

      const result = await this.sendATcommand(atcmd);

      if (!result.ok) {
        this.showModalBand = false;
        alert(this.lastErrorMessage || "Unable to restore band lock.");
        return;
      }

      const interval = setInterval(() => {
        this.countdown--;
        if (this.countdown === 0) {
          clearInterval(interval);
          this.showModalBand = false;
          this.init();
        }
      }, 1000);
      console.log("=== resetBandLocking completed ===");
    },    
    async resetNr5gMode() {
      this.isUpdatingNr5gMode = true;

      try {
        const resetResult = await this.sendATcommand('AT^NR5G_MODE=0');

        if (!resetResult.ok) {
          alert(this.lastErrorMessage || "Unable to reset NR5G mode.");
          return;
        }

        this.nr5gMode = "Auto";
        this.prefNetwork = describePrefNetworkValue(0);
        this.prefNetworkValue = 0;
        if (typeof this.updatePreferredNetworkSelectionFromValue === "function") {
          this.updatePreferredNetworkSelectionFromValue(0);
        }
        await this.getCurrentSettings();
      } finally {
        this.isUpdatingNr5gMode = false;
      }
    },
    async sendATcommand(atcmd) {
      if (!atcmd || typeof atcmd !== "string") {
        const error = new Error("Invalid AT command.");
        this.lastErrorMessage = error.message;
        console.error("AT command validation error:", error);
        return { ok: false, data: "", error };
      }

      const executeCommand = () =>
        ATCommandService.execute(atcmd, {
          retries: 3,
          timeout: 15000,
        });

      const logFailure = (result) => {
        const message = result.error
          ? result.error.message
          : "Unknown error while executing the command.";
        this.lastErrorMessage = message;
        console.warn("AT command failed:", message);
        return message;
      };

      try {
        const result = await executeCommand();

        if (result.ok) {
          this.lastErrorMessage = "";
          return result;
        }

        const initialMessage = logFailure(result);

        await new Promise((resolve) => setTimeout(resolve, 300));

        const modemCheck = await ATCommandService.execute("ATI", {
          retries: 1,
          timeout: 5000,
        });

        if (!modemCheck.ok) {
          this.lastErrorMessage =
            initialMessage ||
            "Unable to verify modem status after failed AT command.";
          console.warn("Modem check failed after AT error.", modemCheck);
          return result;
        }

        const retryResult = await executeCommand();

        if (retryResult.ok) {
          this.lastErrorMessage = "";
          return retryResult;
        }

        logFailure(retryResult);
        return retryResult;
      } catch (error) {
        const message = error.message || "Unexpected error during the AT command.";
        this.lastErrorMessage = message;
        console.error("AT command execution error:", error);
        return { ok: false, data: "", error };
      }
    },
  };
}

function addCheckboxListeners(cellLock) {
  const checkboxes = document.querySelectorAll(
    '#checkboxForm input[type="checkbox"]'
  );

  // Remove existing event listeners
  checkboxes.forEach(function (checkbox) {
    checkbox.removeEventListener(
      "change",
      cellLock.trackCheckboxChanges
    );
  });

  // Add new event listeners
  checkboxes.forEach(function (checkbox) {
    checkbox.addEventListener("change", cellLock.trackCheckboxChanges);
  });
}
