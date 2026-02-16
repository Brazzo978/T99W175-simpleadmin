/**
 * Device Info Module
 * Handles device information fetching and IMEI management
 */
function fetchDeviceInfo() {
  return {
    _initialized: false,
    _autoFetched: false,
    manufacturer: "-",
    modelName: "-",
    firmwareVersion: "-",
    imsi: "-",
    iccid: "-",
    imei: "-",
    newImei: "",
    lanIp: "-",
    wwanIpv4: "-",
    wwanIpv6: "-",
    phoneNumber: "Unknown",
    simpleAdminVersion: "-",
    atcmd: null,
    atCommandResponse: "",
    errorMessage: "",
    showError: false,
    showImeiWarningModal: false,
    showImeiInputModal: false,
    showRebootModal: false,
    isLoading: false,
    isRebooting: false,
    countdown: 3,
    imeiValidationError: "",
    isImeiValid: false,

    /**
     * Initializes device info behavior.
     *
     * If autoFetch is false, we wait for either:
     * - a custom event (simpleadmin:deviceinfo:autofetch), or
     * - the modal being opened (shown.bs.modal)
     * before fetching AT/LAN info. This prevents early AT-port contention.
     */
    init(autoFetch = true) {
      if (this._initialized) {
        return;
      }
      this._initialized = true;

      const doFetch = () => {
        if (this._autoFetched) {
          return;
        }
        this._autoFetched = true;
        this.fetchATCommand();
        this.fetchlanIp();
      };

      // Fetch immediately if requested (legacy behavior).
      if (autoFetch) {
        doFetch();
      }

      // Allow other pages/components to trigger this later.
      window.addEventListener("simpleadmin:deviceinfo:autofetch", () => {
        doFetch();
      });

      // Also fetch when user opens the modal (at most once).
      const modal = document.getElementById("deviceInfoModal");
      if (modal) {
        modal.addEventListener(
          "shown.bs.modal",
          () => {
            doFetch();
          },
          { once: true }
        );
      }
    },

    /**
     * Handle errors consistently
     * @param {string} message - Error message
     * @param {string} data - Response data
     */
    handleError(message, data = "") {
      this.errorMessage = message;
      this.showError = true;
      if (data) {
        this.atCommandResponse = data;
      }
      console.error("AT command error:", message);
    },

    /**
     * Execute custom AT command
     */
    async sendATCommand() {
      let result = null;
      if (!this.atcmd) {
        console.log("AT Command is empty, using ATI as default command: ");
      }

      this.isLoading = true;

      try {
        result = await ATCommandService.execute(this.atcmd, {
          retries: 3,
          timeout: 12000,
        });

        if (!result.ok) {
          const message = result.error
            ? result.error.message
            : "Unknown error while executing the command.";
          this.handleError(message, result.data);
          return result;
        }

        this.atCommandResponse = result.data;
        this.showError = false;
      } catch (error) {
        this.handleError(error.message || "Network error while executing the command.");
      } finally {
        this.isLoading = false;
      }

      return result;
    },

    /**
     * Fetch all device information
     */
    async fetchATCommand() {
      this.atcmd =
        'ATI;AT+CGMI;AT+CGMM;AT+CIMI;AT+ICCID;AT+CGSN;AT+CNUM;AT+CGCONTRDP=1';
      this.isLoading = true;

      try {
        const result = await ATCommandService.execute(this.atcmd, {
          retries: 3,
          timeout: 30000,
        });

        if (!result.ok) {
          const message = result.error
            ? result.error.message
            : "Unable to retrieve modem information.";
          this.handleError(message, result.data);
          if (result.data) {
            this.atCommandResponse = result.data;
            this.parseFetchedData();
          }
          return;
        }

        this.atCommandResponse = result.data;
        this.showError = false;
        this.parseFetchedData();
      } catch (error) {
        this.handleError(error.message || "Network error while retrieving modem information.");
      } finally {
        this.isLoading = false;
      }
    },

    /**
     * Fetch LAN IP from CGI
     */
    fetchlanIp() {
      fetch("/cgi-bin/get_lanip", {
        credentials: "include",
        cache: "no-store",
      })
        .then((res) => {
          if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
          }
          return res.json();
        })
        .then((data) => {
          this.lanIp = data && data.lanip ? data.lanip : "-";
        })
        .catch((error) => {
          console.error("Error fetching LAN IP:", error);
        });
    },

    /**
     * Parse fetched AT command data
     */
    parseFetchedData() {
      if (!this.atCommandResponse) {
        this.handleError("Empty AT response from the modem.");
        this.isLoading = false;
        return;
      }

      const lines = this.atCommandResponse
        .split(/\r?\n/)
        .map(l => l.trim())
        .filter(l => l && l !== "OK");

      console.log("AT Command Response:", lines);

      let ctx = null;
      let atiStage = 0;
      let manufacturer = this.manufacturer || "-";
      let modelName = this.modelName || "-";
      let firmwareVersion = this.firmwareVersion || "-";
      let imsi = this.imsi || "";
      let iccid = this.iccid || "";
      let imei = this.imei || "-";
      let phoneNumber = this.phoneNumber || "Unknown";
      let wwanIpv4 = this.wwanIpv4 || "-";
      let wwanIpv6 = this.wwanIpv6 || "-";

      try {
        for (const line of lines) {
          // Track context for multi-line responses
          if (line.startsWith("AT+") || line.startsWith("ATI")) {
            ctx = line;
            continue;
          }

          // Parse version info
          if (line.startsWith("^VERSION:")) {
            const afterColon = line.split(":")[1]?.trim() || line;
            firmwareVersion = afterColon;
            if (modelName === "-" || !modelName) {
              const m = afterColon.match(/^([A-Za-z0-9_-]+)/);
              if (m) modelName = m[1];
            }
            continue;
          }
          if (line.startsWith("Revision:")) {
            const revision = line.split(":")[1]?.trim();
            if (revision) {
              firmwareVersion = revision;
            }
            continue;
          }

          // Parse IP addresses
          if (line.startsWith("+CGCONTRDP:")) {
            const parts = line.split(",");
            wwanIpv4 = parts[3]?.replace(/"/g, "") || "-";
            wwanIpv6 = parts[4]?.replace(/"/g, "") || "-";
            continue;
          }

          // Parse ICCID
          if (line.startsWith("ICCID:")) {
            iccid = line.replace("ICCID:", "").trim();
            continue;
          }
          if (line.startsWith("+ICCID:")) {
            iccid = line.split(":")[1]?.replace(/"/g, "").trim() || iccid;
            continue;
          }

          // Parse IMSI (15 digits)
          if (ctx?.startsWith("AT+CIMI") && /^\d{15}$/.test(line)) {
            imsi = line;
            continue;
          }
          // Fallback IMSI detection
          if ((!imsi || imsi === "-") && /^\d{15}$/.test(line) && !line.startsWith("89") && line !== imei) {
            imsi = line;
            continue;
          }

          // Parse IMEI (15-17 digits)
          if (ctx?.startsWith("AT+CGSN")) {
            const m = line.match(/(\d{15,17})/);
            if (m) { imei = m[1].slice(0, 15); }
            continue;
          }
          if (line.startsWith("+CGSN:")) {
            const m = line.match(/(\d{15,17})/);
            if (m) { imei = m[1].slice(0, 15); }
            continue;
          }
          // Fallback IMEI detection
          if ((imei === "-" || !imei) && /^\d{15,17}$/.test(line) && !line.startsWith("89") && line !== imsi) {
            imei = line.slice(0, 15);
            continue;
          }

          // Parse phone number
          if (line.startsWith("+CNUM:")) {
            const seg = line.split(",");
            const num = seg[1]?.replace(/"/g, "").trim();
            if (num) phoneNumber = num;
            continue;
          }

          // Parse manufacturer
          if (ctx?.startsWith("AT+CGMI")) {
            manufacturer = line;
            ctx = null;
            continue;
          }
          if (ctx?.startsWith("ATI")) {
            if (line.startsWith("Revision:")) {
              const revision = line.split(":")[1]?.trim();
              if (revision) {
                firmwareVersion = revision;
              }
              continue;
            }
            if (!manufacturer || manufacturer === "-") {
              manufacturer = line;
              atiStage = Math.max(atiStage, 1);
              continue;
            }
            if ((!modelName || modelName === "-") && atiStage >= 1) {
              modelName = line;
              atiStage = Math.max(atiStage, 2);
              continue;
            }
          }
          // Parse model name
          if (ctx?.startsWith("AT+CGMM")) {
            modelName = line;
            ctx = null;
            continue;
          }

          // Fallback manufacturer detection
          if (manufacturer === "-" && /QUALCOMM|QUECTEL|HUAWEI|FIBOCOM|Sierra/i.test(line)) {
            manufacturer = line;
          }
          if ((modelName === "-" || !modelName) && manufacturer !== "-" && /^[A-Za-z0-9_.-]+$/.test(line)) {
            modelName = line;
          }
        }

        // Update state with parsed values
        this.manufacturer = manufacturer || "-";
        this.modelName = modelName || "-";
        this.firmwareVersion = firmwareVersion || "-";
        this.imsi = imsi || " ";
        this.iccid = iccid || " ";
        this.imei = imei || "-";
        this.phoneNumber = phoneNumber || "Unknown";
        this.wwanIpv4 = wwanIpv4 || "-";
        this.wwanIpv6 = wwanIpv6 || "-";
        this.showError = false;
      } catch (error) {
        console.error("Parsing error:", error);
        this.handleError("Unable to interpret the modem response.", this.atCommandResponse);
      } finally {
        this.isLoading = false;
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
        this.showRebootModal = true;
      }
    },

    closeRebootModal() {
      this.showRebootModal = false;
      this.newImei = "";
      this.imeiValidationError = "";
      this.isImeiValid = false;
    },

    executeReboot() {
      this.showRebootModal = false;
      this.rebootDevice();
    },

    /**
     * Update IMEI via AT commands
     */
    async updateIMEI() {
      if (!/^\d{15}$/.test(this.newImei)) {
        this.handleError("Invalid IMEI format. Must be exactly 15 digits.");
        return false;
      }

      this.atcmd = `AT+EGMR=1,7,"${this.newImei}"`;
      console.log("Sending IMEI update command:", this.atcmd);
      const setResult = await this.sendATCommand();
      if (!setResult?.ok) {
        return false;
      }

      return true;
    },

    /**
     * Reboot the modem
     */
    rebootDevice() {
      this.atcmd = "AT+CFUN=1,1";
      this.sendATCommand();

      this.isLoading = true;
      this.isRebooting = true;
      this.countdown = 59;

      const interval = setInterval(() => {
        this.countdown--;
        if (this.countdown === 0) {
          clearInterval(interval);
          this.isLoading = false;
          this.isRebooting = false;
        }
      }, 1000);
    },

    /**
     * Copy text to clipboard with visual feedback
     * @param {string} text - Text to copy
     */
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
     * Initialize module
     */
    init() {
      const modal = document.getElementById("deviceInfoModal");
      if (!modal) {
        return;
      }

      modal.addEventListener("show.bs.modal", () => {
        if (this.isLoading) {
          return;
        }
        this.fetchATCommand();
        this.fetchlanIp();
      });
    },
  };
}
