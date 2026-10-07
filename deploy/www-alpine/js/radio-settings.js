/**
 * Radio and cellular settings management for T99W175 modem.
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
      if (value === "1") {
        return "0";
      }
      if (value === "2") {
        return "1";
      }
      return null;
    },
    isValidSimCommandValue(value) {
      return value === "0" || value === "1";
    },
    canApplySimSelection() {
      if (!this.isValidSimCommandValue(this.pendingSimSlot)) {
        return false;
      }

      const current = this.mapSimDisplayToCommandValue(this.sim);

      if (current === null) {
        return true;
      }

      return current !== this.pendingSimSlot;
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

      const atcmd = 'AT^BAND_PREF_EXT?';
      this.isGettingBands = true;

      try {
        const result = await this.sendATcommand(atcmd);

        if (!result.ok || !result.data) {
          console.warn(
            "Unable to fetch supported bands:",
            this.lastErrorMessage
          );
          this.bands = "Bands not available";
          return;
        }

        this.rawdata = result.data;
        this.parseSupportedBands(result.data);

        await this.getLockedBands();
      } finally {
        this.isGettingBands = false;
      }
    },

    parseSupportedBands(rawdata) {
      const data = rawdata;
      const regex = /(WCDMA|LTE|NR5G_NSA|NR5G_SA),\s*(Enable|Disable) Bands\s*:(.*)/g;

      const bands = {
        lte_band: [],
        nsa_nr5g_band: [],
        nr5g_band: [],
      };

      let match;
      while ((match = regex.exec(data)) !== null) {
        const mode = match[1];
        const numbers = match[3]
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
          .map(Number)
          .filter((value) => !Number.isNaN(value));

        if (mode === "LTE") bands.lte_band.push(...numbers);
        if (mode === "NR5G_NSA") bands.nsa_nr5g_band.push(...numbers);
        if (mode === "NR5G_SA") bands.nr5g_band.push(...numbers);
      }

      const uniqSort = (arr) => [...new Set(arr)].sort((a, b) => a - b);

      this.lte_bands = uniqSort(bands.lte_band).join(":");
      this.nsa_bands = uniqSort(bands.nsa_nr5g_band).join(":");
      this.sa_bands = uniqSort(bands.nr5g_band).join(":");

      populateCheckboxes(
        this.lte_bands,
        this.nsa_bands,
        this.sa_bands,
        this.locked_lte_bands,
        this.locked_nsa_bands,
        this.locked_sa_bands,
        this
      );
    },

    async getLockedBands() {
      const atcmd =
        'AT^BAND_PREF_EXT?';

      const result = await this.sendATcommand(atcmd);

      if (!result.ok || !result.data) {
        console.warn(
          "Unable to retrieve locked bands:",
          this.lastErrorMessage
        );
        this.locked_lte_bands = "";
        this.locked_nsa_bands = "";
        this.locked_sa_bands = "";
        populateCheckboxes(
          this.lte_bands,
          this.nsa_bands,
          this.sa_bands,
          this.locked_lte_bands,
          this.locked_nsa_bands,
          this.locked_sa_bands,
          this
        );
        return;
      }

      this.rawdata = result.data;
      this.parseLockedBands(result.data);

      this.getCurrentSettings();
    },

    parseLockedBands(rawdata) {
      const data = rawdata;
      const regex = /(LTE|NR5G_NSA|NR5G_SA),\s*Enable Bands\s*:(.*)/g;

      const bands = {
        lte_band: [],
        nsa_nr5g_band: [],
        nr5g_band: [],
      };

      let match;
      while ((match = regex.exec(data)) !== null) {
        const mode = match[1];
        const numbers = match[2]
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
          .map(Number)
          .filter((value) => !Number.isNaN(value));

        switch (mode) {
          case "LTE":
            bands.lte_band = numbers;
            break;
          case "NR5G_NSA":
            bands.nsa_nr5g_band = numbers;
            break;
          case "NR5G_SA":
            bands.nr5g_band = numbers;
            break;
        }
      }

      this.locked_lte_bands = bands.lte_band.join(":");
      this.locked_nsa_bands = bands.nsa_nr5g_band.join(":");
      this.locked_sa_bands = bands.nr5g_band.join(":");

      populateCheckboxes(
        this.lte_bands,
        this.nsa_bands,
        this.sa_bands,
        this.locked_lte_bands,
        this.locked_nsa_bands,
        this.locked_sa_bands,
        this
      );
    },
    init() {
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

      showPopulateCheckboxes();
      addNetworkModeListener();
      addProviderBandsListener();
      console.log("=== init() completed ===");
    },

    async getCurrentSettings() {
      console.log("=== getCurrentSettings START ===");
       
      // Always get the slot info and network mode, regardless of SIM status
      const basicCmd = 'AT^SWITCH_SLOT?;^SLMODE?';
      const basicResult = await this.sendATcommand(basicCmd);

      if (basicResult.ok && basicResult.data) {       
        // Parse slot: "SIM1 ENABLE" or "SIM2 ENABLE"
        const slotMatch = basicResult.data.match(/SIM(\d+)\s+ENABLE/i);
        if (slotMatch) {
          this.sim = slotMatch[1];
          this.pendingSimSlot = this.mapSimDisplayToCommandValue(this.sim);
          // console.log("Parsed SIM slot:", this.sim, "Mapped to command value:", this.pendingSimSlot);
        }
        
        // Parse network mode: "^SLMODE:1,0"
        const slmodeMatch = basicResult.data.match(/\^SLMODE:\s*\d+\s*,\s*(\d+)/i);
        if (slmodeMatch) {
          const modeValue = parseInt(slmodeMatch[1], 10);
          this.prefNetworkValue = modeValue;
          this.prefNetwork = this.describePrefNetworkValue(modeValue);
          this.updatePreferredNetworkSelectionFromValue(modeValue);
          // console.log("Parsed network mode:", modeValue, "->", this.prefNetwork);
        }
      }   

      // Check if SIM is present
      const simCheckResult = await this.sendATcommand('AT+CPIN?');
      const simStatus = simCheckResult.data.trim();
      // console.log("SIM Check Result:", simStatus);   
      
      if (!simCheckResult.ok || !simCheckResult.data) {
        console.warn("Unable to check SIM status:", this.lastErrorMessage);
        this.apn = "Not Available";
        this.apnIP = "Not Available";
        this.prefNetwork = "Not Available";
        this.bands = "Not Available";
        this.cellLockStatus = "Not Available";
        await this.getEsimManagerStatus();
        return;
      }

      // If SIM is not ready, don't execute commands that require SIM
      if (!simStatus.includes('READY')) {
        console.warn("SIM not ready:", simStatus);
        this.apn = "Not Available";
        this.apnIP = "Not Available";
        this.prefNetwork = "Not Available";
        this.bands = "Not Available";
        this.cellLockStatus = "Not Available";
        
        await this.getEsimManagerStatus();
        console.log("=== getCurrentSettings END (No SIM) ===");
        return;
      }

      // SIM is ready, execute full command set
      const atcmd =
        'AT+CGCONTRDP=1;+CGDCONT?;^BAND_PREF_EXT?;^CA_INFO?;^SLMODE?;^LTE_LOCK?;^NR5G_LOCK?';

      const result = await this.sendATcommand(atcmd);

      if (!result.ok || !result.data) {
        console.warn("Unable to fetch current settings:", this.lastErrorMessage);
        return;
      }

      try {
        if (typeof parseCurrentSettings === "function") {
          const settings = parseCurrentSettings(result.data);

          if (!settings) {
            throw new Error('Wrong response from modem.');
          }

          // Don't override sim value - we already got it from SWITCH_SLOT
          this.apn = settings.apn;
          this.apnIP = settings.apnIP;
          this.cellLockStatus = settings.cellLockStatus;
          this.prefNetwork = settings.prefNetwork;
          this.prefNetworkValue = settings.prefNetworkValue;
          this.updatePreferredNetworkSelectionFromValue(settings.prefNetworkValue);
          this.bands = settings.bands;

          let nr5gModeValue = settings.nr5gModeValue;

          if (nr5gModeValue === null) {
            const nr5gResult = await this.sendATcommand('AT^NR5G_MODE?');

            if (nr5gResult.ok && nr5gResult.data) {
              const nr5gSettings = parseCurrentSettings(nr5gResult.data);
              nr5gModeValue = nr5gSettings?.nr5gModeValue ?? null;
            }
          }

          if (typeof describeNr5gMode === "function") {
            this.nr5gMode = describeNr5gMode(nr5gModeValue);
          }
        }
        
        await this.getEsimManagerStatus();

      } catch (error) {
        this.lastErrorMessage = error.message || 'Error while parsing the current settings.';
        console.error('Error while parsing the current settings:', error);
      }
      
      console.log("Final SIM value:", this.sim);
      console.log("Final pendingSimSlot:", this.pendingSimSlot);
      console.log("=== getCurrentSettings END ===");
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
        const esimNavItem = document.getElementById('esimNavItem');
        if (esimNavItem) {
          esimNavItem.style.display = targetState === 1 ? 'block' : 'none';
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
      if (!Number.isInteger(value) || value < 0) {
        return 'Unknown';
      }

      const labels = {
        0: 'Auto',
        1: '3G Only',
        2: '4G Only',
        3: '3G + 4G',
        4: '5G Only',
        5: '3G + 5G',
        6: '4G + 5G',
        7: '3G + 4G + 5G',
      };

      return labels[value] || 'Unknown';
    },
    updatePreferredNetworkSelectionFromValue(value) {
      const numericValue = Number.isInteger(value) ? value : null;

      this.preferredNetworkSelection.threeG = false;
      this.preferredNetworkSelection.fourG = false;
      this.preferredNetworkSelection.fiveG = false;

      if (numericValue === null) {
        return;
      }

      if (numericValue & 1) {
        this.preferredNetworkSelection.threeG = true;
      }
      if (numericValue & 2) {
        this.preferredNetworkSelection.fourG = true;
      }
      if (numericValue & 4) {
        this.preferredNetworkSelection.fiveG = true;
      }
    },
    computePreferredNetworkValueFromSelection() {
      if (!this.preferredNetworkSelection) {
        return null;
      }

      let value = 0;

      if (this.preferredNetworkSelection.threeG) {
        value |= 1;
      }
      if (this.preferredNetworkSelection.fourG) {
        value |= 2;
      }
      if (this.preferredNetworkSelection.fiveG) {
        value |= 4;
      }

      return value;
    },
    async savePreferredNetwork() {
      if (this.isSavingPrefNetwork) {
        return;
      }

      if (this.prefNetworkValue === null) {
        alert('Preferred network information is still loading.');
        return;
      }

      const targetValue = this.computePreferredNetworkValueFromSelection();

      if (targetValue === null) {
        alert('Unable to determine the preferred network selection.');
        return;
      }

      if (targetValue === this.prefNetworkValue) {
        alert('No changes made');
        return;
      }

      this.isSavingPrefNetwork = true;

      const result = await this.sendATcommand(
        `AT^SLMODE=1,${targetValue}`
      );

      this.isSavingPrefNetwork = false;

      if (!result.ok) {
        alert(
          this.lastErrorMessage ||
            'Unable to save the preferred network. Please try again.'
        );
        return;
      }

      this.prefNetworkValue = targetValue;
      this.prefNetwork = this.describePrefNetworkValue(targetValue);
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
      const bands = newCheckedValues.join(":");
      const atcmd = `AT^BAND_PREF_EXT=${atCommandPrefix},2,${bands}`;

      console.log(`Sending enable command with ${newCheckedValues.length} bands:`, atcmd);

      const result = await this.sendATcommand(atcmd);

      if (!result.ok) {
        console.error("FAILED to enable bands:", this.lastErrorMessage);
        alert(`Failed to update bands: ${this.lastErrorMessage}`);
        return;
      }

      console.log("Bands enabled successfully");

      // Update previous state
      this.previousLockedBands = [...newCheckedValues];

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

      // Save current SLMODE value to restore it after slot switch
      const savedSlModeValue = this.prefNetworkValue;

      // Initialize countdown BEFORE showing modal to avoid flash
      this.countdown = 5;
      this.isApplyingSimChange = true;
      this.showModalSim = true;

      const result = await this.sendATcommand(
        `AT^SWITCH_SLOT=${targetSlot}`
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

          // Restore SLMODE to the value it had before slot switch
          if (savedSlModeValue !== null) {
            this.sendATcommand(`AT^SLMODE=1,${savedSlModeValue}`);
          }

          this.showModalSim = false;
          this.isApplyingSimChange = false;
          this.getCurrentSettings();
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
      let atcmd = `AT^LTE_LOCK=${validPairs
        .map((pair) => `${pair.pci},${pair.earfcn}`)
        .join(",")}`;

      // Initialize countdown BEFORE showing modal to avoid flash
      this.countdown = 5;
      this.showModalCellLock = true;
      const result = await this.sendATcommand(atcmd);

      // Workaround for Auto mode, when enable LTE lock, modem will go only in 4G mode
      atcmd = `AT^SLMODE=1,0`
      this.sendATcommand(atcmd);

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
      let atcmd = `AT^NR5G_LOCK=${band},${scs},${earfcn},${pci}`;

      // Initialize countdown BEFORE showing modal to avoid flash
      this.countdown = 5;
      this.showModalCellLock = true;
      const result = await this.sendATcommand(atcmd);

      // Workaround for Auto mode, when enable NR lock, modem will go only in 5G mode
      atcmd = `AT^SLMODE=1,0`
      this.sendATcommand(atcmd);

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
      const atcmd = 'AT^LTE_LOCK';

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
      const atcmd = 'AT^NR5G_LOCK';

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
      const atcmd = 'AT^BAND_PREF_EXT';

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
