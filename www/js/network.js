function cellLocking() {
  return {
    isLoading: false,
    showModal: false,
    countdown: 0,
    lastErrorMessage: "",
    activeUtilityTab: "apn",
    networkModeCell: "-",
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
    scs: null,
    band: null,
    apn: "-",
    apnIP: "-",
    newApnIP: null,
    newApn: null,
    prefNetwork: "-",
    prefNetworkValue: null,
    nr5gMode: "Unknown",
    isUpdatingNr5gMode: false,
    preferredNetworkSelection: {
      threeG: false,
      fourG: false,
      fiveG: false,
    },
    isSavingPrefNetwork: false,
    cellNum: null,
    lte_bands: "",
    nsa_bands: "",
    sa_bands: "",
    locked_lte_bands: "",
    locked_nsa_bands: "",
    locked_sa_bands: "",
    currentNetworkMode: "LTE",
    updatedLockedBands: [],
    sim: "-",
    pendingSimSlot: null,
    isApplyingSimChange: false,
    cellLockStatus: "Unknown",
    bands: "Fetching Bands...",
    isGettingBands: false,
    rawdata: "",
    networkModeListenerAttached: false,
    providerBandsListenerAttached: false,
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
      return "Sconosciuta";
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

      if (typeof this.trackCheckboxChanges === "function") {
        this.trackCheckboxChanges();
      }
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
      // Function to populate checkboxes
      const showPopulateCheckboxes = async () => {
        try {
          await this.getSupportedBands();

          // Add event listeners to checkboxes after populating them
          addCheckboxListeners(this);

          if (typeof this.trackCheckboxChanges === "function") {
            this.trackCheckboxChanges();
          }
        } catch (error) {
          console.error(
            "Error while populating supported bands:",
            error
          );
        }
      };

      // Function to track checkbox changes
      this.trackCheckboxChanges = () => {
        const modeDropdown = document.getElementById("networkModeBand");
        const selectedMode = modeDropdown ? modeDropdown.value : null;
        const checkboxes = document.querySelectorAll(
          '#checkboxForm input[type="checkbox"]'
        );
        const newCheckedValues = [];

        checkboxes.forEach(function (checkbox) {
          if (checkbox.checked) {
            newCheckedValues.push(checkbox.value);
          }
        });

        // Update currentNetworkMode and updatedLockedBands
        this.currentNetworkMode = selectedMode || this.currentNetworkMode;
        this.updatedLockedBands = newCheckedValues;
      };

      // Function to add event listener to network mode dropdown
      const addNetworkModeListener = () => {
        if (this.networkModeListenerAttached) {
          return;
        }

        const dropdown = document.getElementById("networkModeBand");

        if (!dropdown) {
          console.warn("Network mode dropdown not found.");
          return;
        }

        dropdown.addEventListener("change", () => {
          showPopulateCheckboxes(); // Update checkboxes when network mode changes
        });

        this.networkModeListenerAttached = true;
      };

      const addProviderBandsListener = () => {
        if (this.providerBandsListenerAttached) {
          return;
        }

        const providerBands = document.getElementById("providerBands");

        if (!providerBands) {
          console.warn("Provider bands checkbox not found.");
          return;
        }

        providerBands.addEventListener("change", () => {
          showPopulateCheckboxes();
        });

        this.providerBandsListenerAttached = true;
      };

      // Execute necessary functions on initialization
      showPopulateCheckboxes();
      addNetworkModeListener();
      addProviderBandsListener();
    },
    async getCurrentSettings() {
      const atcmd =
        'AT^SWITCH_SLOT?;+CGCONTRDP=1;+CGDCONT?;^BAND_PREF_EXT?;^CA_INFO?;^SLMODE?;^LTE_LOCK?;^NR5G_LOCK?';

      const result = await this.sendATcommand(atcmd);

      if (!result.ok || !result.data) {
        console.warn("Unable to fetch current settings:", this.lastErrorMessage);
        return;
      }

      try {
        const settings = parseCurrentSettings(result.data);

        if (!settings) {
          throw new Error('Risposta inattesa dal modem.');
        }

        this.sim = settings.sim;
        this.pendingSimSlot = this.mapSimDisplayToCommandValue(
          settings.sim
        );
        this.apn = settings.apn;
        this.apnIP = settings.apnIP;
        this.cellLockStatus = settings.cellLockStatus;
        this.prefNetwork = settings.prefNetwork;
        this.prefNetworkValue = settings.prefNetworkValue;
        this.updatePreferredNetworkSelectionFromValue(
          settings.prefNetworkValue
        );
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
      } catch (error) {
        this.lastErrorMessage = error.message || 'Error while parsing the current settings.';
        console.error('Error while parsing the current settings:', error);
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
    uncheckAllBands() {
        document
            .querySelectorAll('#checkboxForm input[type="checkbox"]')
            .forEach(function (checkbox) {
            checkbox.checked = false;
            checkbox.dispatchEvent(new Event("change", { bubbles: true }));
        });
    },
    async lockSelectedBands() {
      // Get the updated this.currentNetworkMode = selectedMode; and this.updatedLockedBands = newCheckedValues;
      const selectedMode =
        this.currentNetworkMode ||
        (document.getElementById("networkModeBand") || {}).value ||
        null;
      const newCheckedValues = Array.isArray(this.updatedLockedBands)
        ? this.updatedLockedBands
        : [];
      let atcmd;

      // Check if both values are null then show the error message
      if (selectedMode === null || newCheckedValues.length === 0) {
        alert("Select at least one band to lock.");
      } else {
        if (selectedMode === "LTE") {
          let bandss = newCheckedValues
            .join(",")
            .replace(/,$/, "");
          atcmd = `AT^BAND_PREF=LTE,2,${bandss}`;
        } else if (selectedMode === "NSA") {
          let bandss = newCheckedValues
            .join(",")
            .replace(/,$/, "");
          atcmd = `AT^BAND_PREF=NR5G,2,${bandss}`;
        } else if (selectedMode === "SA") {
          let bandss = newCheckedValues
            .join(",")
            .replace(/,$/, "");
          atcmd = `AT^BAND_PREF=NR5G,2,${bandss}`;
        } else {
          alert("Invalid network mode selected");
          return;
        }

        // Do a 2 second countdown
        this.showModal = true;
        this.countdown = 2;

        const result = await this.sendATcommand(atcmd);

        if (!result.ok) {
          this.showModal = false;
          alert(
            this.lastErrorMessage ||
              "Unable to lock the selected bands. Please try again."
          );
          return;
        }

        const interval = setInterval(() => {
          this.countdown--;
          if (this.countdown === 0) {
            clearInterval(interval);
            this.showModal = false;

            // Refresh the page to show the updated bands
            this.init();
          }
        }, 1000);
      }
    },
    async resetBandLocking() {
      // Send the atcmd command to reset the locked bands
      const atcmd = 'AT^BAND_PREF_EXT';

      this.showModal = true;

      const result = await this.sendATcommand(atcmd);

      if (!result.ok) {
        this.showModal = false;
        alert(
          this.lastErrorMessage ||
            "Unable to restore the band lock."
        );
        return;
      }

      this.countdown = 5;
      const interval = setInterval(() => {
        this.countdown--;
        if (this.countdown === 0) {
          clearInterval(interval);
          this.showModal = false;

          // Refresh the page to show the updated bands
          this.init();
        }
      }, 1000);
    },
    async resetApnSettings() {
      const shouldReset = confirm(
        "Resetting will delete every configured APN and restart the modem. Continue?"
      );

      if (!shouldReset) {
        return;
      }

      this.showModal = true;

      const response = await this.sendATcommand('AT+CGDCONT?');

      if (!response.ok || !response.data) {
        this.showModal = false;
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
          this.showModal = false;
          alert(
            this.lastErrorMessage ||
              `Unable to remove APN profile ${ctx.cid}.`
          );
          return;
        }
      }

      const restartResult = await this.sendATcommand('AT+CFUN=1,1');

      if (!restartResult.ok) {
        this.showModal = false;
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

      this.countdown = 60;
      const interval = setInterval(() => {
        this.countdown--;
        if (this.countdown === 0) {
          clearInterval(interval);
          this.showModal = false;
          this.init();
        }
      }, 1000);
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

      this.isApplyingSimChange = true;
      this.showModal = true;

      const result = await this.sendATcommand(
        `AT^SWITCH_SLOT=${targetSlot}`
      );

      if (!result.ok) {
        this.isApplyingSimChange = false;
        this.showModal = false;
        alert(
            this.lastErrorMessage ||
              "Unable to change SIM. Please try again."
        );
        return;
      }

      this.countdown = 10;
      const interval = setInterval(() => {
        this.countdown--;
        if (this.countdown === 0) {
          clearInterval(interval);
          this.showModal = false;
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

      this.showModal = true;

      if (requiresBasebandRestart) {
        const cleanupResult = await this.ensurePrimaryApnProfile();

        if (!cleanupResult.ok) {
          this.showModal = false;
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
          this.showModal = false;
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
          this.showModal = false;
          alert(
            this.lastErrorMessage ||
              "Error while shutting down the baseband."
          );
          return;
        }

        const radioOn = await this.sendATcommand("AT+CFUN=1");

        if (!radioOn.ok) {
          this.showModal = false;
          alert(
            this.lastErrorMessage ||
              "Error while restarting the baseband."
          );
          return;
        }
      }

      this.countdown = requiresBasebandRestart ? 30 : 15;

      const interval = setInterval(() => {
        this.countdown--;
        if (this.countdown === 0) {
          clearInterval(interval);
          this.showModal = false;
          this.newApn = null;
          this.newApnIP = null;
          this.init();
        }
      }, 1000);
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

      // Mock data
      this.showModal = true;
      const result = await this.sendATcommand(atcmd);

      if (!result.ok) {
        this.showModal = false;
        alert(
          this.lastErrorMessage ||
            "Unable to apply the LTE lock."
        );
        return;
      }

      // Do a 15 second countdown
      this.countdown = 15;
      const interval = setInterval(() => {
        this.countdown--;
        if (this.countdown === 0) {
          clearInterval(interval);
          this.showModal = false;
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

      // Mock data
      this.showModal = true;
      const result = await this.sendATcommand(atcmd);

      if (!result.ok) {
        this.showModal = false;
        alert(
          this.lastErrorMessage ||
            "Unable to apply the NR5G lock."
        );
        return;
      }

      // Do a 15 second countdown
      this.countdown = 15;
      const interval = setInterval(() => {
        this.countdown--;
        if (this.countdown === 0) {
          clearInterval(interval);
          this.showModal = false;
        }
      }, 1000);
    },
    async cellLockDisableLTE() {
      // Send the atcmd command to reset the locked bands
      const atcmd = 'AT^LTE_LOCK';
      this.showModal = true;

      const result = await this.sendATcommand(atcmd);

      if (!result.ok) {
        this.showModal = false;
        alert(
          this.lastErrorMessage ||
            "Unable to remove the LTE lock."
        );
        return;
      }

      this.countdown = 15;
      const interval = setInterval(() => {
        this.countdown--;
        if (this.countdown === 0) {
          clearInterval(interval);
          this.showModal = false;
        }
      }, 1000);
    },
    async cellLockDisableNR() {
      // Send the atcmd command to reset the locked bands
      const atcmd = 'AT^NR5G_LOCK';

      this.showModal = true;

      const result = await this.sendATcommand(atcmd);

      if (!result.ok) {
        this.showModal = false;
        alert(
          this.lastErrorMessage ||
            "Unable to remove the NR5G lock."
        );
        return;
      }

      this.countdown = 15;
      const interval = setInterval(() => {
        this.countdown--;
        if (this.countdown === 0) {
          clearInterval(interval);
          this.showModal = false;
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
      } finally {
        this.isUpdatingNr5gMode = false;
      }
    },
    async resetNr5gMode() {
      this.isUpdatingNr5gMode = true;

      try {
        const resetResult = await this.sendATcommand('AT^NR5G_MODE=0');

        if (!resetResult.ok) {
          alert(this.lastErrorMessage || "Unable to reset NR5G mode.");
          return;
        }

        const slmodeResult = await this.sendATcommand('AT^SLMODE=1,7');

        if (!slmodeResult.ok) {
          alert(this.lastErrorMessage || "Unable to reset preferred network.");
          return;
        }

        this.nr5gMode = "Auto";
        this.prefNetwork = describePrefNetworkValue(7);
        this.prefNetworkValue = 7;
        if (typeof this.updatePreferredNetworkSelectionFromValue === "function") {
          this.updatePreferredNetworkSelectionFromValue(7);
        }
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

(function () {
  const uncheckButton = document.getElementById("uncheckAll");

  if (!uncheckButton) {
    console.warn('"Uncheck All" button not found.');
    return;
  }

  uncheckButton.addEventListener("click", function () {
    document
      .querySelectorAll('#checkboxForm input[type="checkbox"]')
      .forEach(function (checkbox) {
        checkbox.checked = false;
        checkbox.dispatchEvent(new Event("change", { bubbles: true }));
      });
  });
});
