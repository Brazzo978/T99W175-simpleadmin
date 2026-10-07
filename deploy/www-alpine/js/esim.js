/**
 * eSIM profile management for T99W175 modem.
 *
 * Provides Alpine.js component for managing eSIM profiles via LPA server:
 * - Profile discovery and listing
 * - Profile enable/disable operations
 * - QR code scanning for profile downloads
 * - Notification handling for pending operations
 * - Server health and connectivity checks
 *
 * Requires euicc-client LPA server running on the modem or local network.
 *
 * @module esim
 * @requires Alpine.js
 * @requires esim-config.js
 * @requires jsQR (for QR code scanning)
 */

/**
 * Alpine.js component for eSIM management functionality.
 *
 * Manages eSIM profile lifecycle including discovery, download,
 * enable/disable, and deletion operations. Integrates with external
 * LPA (Local Profile Assistant) server via REST API.
 *
 * @returns {Object} Alpine.js component data object
 */
function esimManager() {
  return {
    // Initial loading state
    isLoading: true,
    // eSIM feature enabled flag
    enabled: false,
    // LPA server base URL
    baseUrl: "",
    // Fallback URL for localhost detection
    fallbackBaseUrl: "",
    // eSIM identifier (EID)
    eid: null,
    // Array of eSIM profiles
    profiles: [],
    // Array of pending notifications
    notifications: [],
    // LPA server health status
    serverHealthy: null,
    // Internet connectivity status
    internetConnected: null,
    // Alert message object {type, message}
    alert: { type: "", message: "" },
    // Profile download loading state
    downloadLoading: false,
    // Download form data
    downloadForm: {
      smdp: "",
      matching_id: "",
      confirmation_code: "",
      auto_confirm: true,
    },
    // Nickname edit modal data
    nicknameModal: {
      iccid: "",
      nickname: "",
      currentNickname: "",
    },
    // LPA server configuration
    serverConfig: {
      imei: "",
      slot: 2,
      refresh: true,
    },
    // Server config save in progress
    isSavingServerConfig: false,

    /**
     * Initializes eSIM manager component.
     *
     * Starts the bootstrap process to load configuration and connect to LPA server.
     */
    init() {
      this.bootstrap();
    },

    /**
     * Bootstraps the eSIM manager.
     *
     * Loads configuration, checks eSIM feature enablement, validates LPA server
     * health, and loads initial profiles and notifications. Handles localhost
     * URL detection for fallback access.
     *
     * @async
     * @returns {Promise<void>}
     */
    async bootstrap() {
      if (this._bootstrapped) {
        console.debug("[eSIM] Bootstrap already executed, skipping.");
        return;
      }
      this._bootstrapped = true;

      this.isLoading = true;
      this.clearAlert();
      console.debug("[eSIM] Starting eSIM management bootstrap...");

      const config = await EsimConfig.loadConfig();
      this.enabled = config.enabled === 1 || config.enabled === "1" || config.enabled === true;

      const configBaseUrl = (config.base_url || "").replace(/\/+$/, "");
      this.fallbackBaseUrl = this.computeFallbackBaseUrl(configBaseUrl);

      try {
        const url = new URL(configBaseUrl);
        if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
          console.debug("[eSIM] Localhost detected, using fallback directly");
          this.baseUrl = this.fallbackBaseUrl;
        } else {
          this.baseUrl = configBaseUrl;
        }
      } catch (error) {
        this.baseUrl = configBaseUrl;
      }

      console.debug("[eSIM] Configuration loaded", {
        enabled: this.enabled,
        baseUrl: this.baseUrl,
        fallbackBaseUrl: this.fallbackBaseUrl,
      });

      if (!this.enabled) {
        this.setAlert(
          "warning",
          "eSIM management is disabled. Enable it in config/simpleadmin.conf to proceed."
        );
        this.isLoading = false;
        return;
      }

      await this.loadServerConfig();
      await this.checkHealth();
      await this.checkInternetConnectivity();
      await this.refreshAll();
      this.isLoading = false;
    },

    /**
     * Checks internet connectivity by pinging an external server.
     *
     * Uses the get_ping CGI endpoint to verify network connectivity.
     * Sets internetConnected flag based on response.
     *
     * @async
     * @returns {Promise<void>}
     */
    async checkInternetConnectivity() {
      try {
        console.debug("[eSIM] Checking internet connectivity...");
        const response = await fetch('/cgi-bin/get_ping', {
          cache: 'no-store',
          signal: AbortSignal.timeout(5000) // 5 second timeout
        });

        const data = await response.json();
        console.debug("[eSIM] Ping response:", data);

        if (data.connected === true || data.status === 'ok') {
          this.internetConnected = true;
          console.debug("[eSIM] Internet connectivity: OK");
        } else {
          this.internetConnected = false;
          console.debug("[eSIM] Internet connectivity: FAILED -", data.message || data.status);
        }
      } catch (error) {
        console.error("[eSIM] Error checking internet connectivity:", error);
        this.internetConnected = false;
      }
    },

    /**
     * Sets an alert message with optional auto-dismiss.
     *
     * Displays alert in UI. Success, info, and warnings auto-dismiss after 5 seconds.
     * Danger/errors persist until manually cleared.
     *
     * @param {string} type - Alert type (success, danger, warning, info)
     * @param {string} message - Alert message text
     * @param {boolean} [autoDismiss=true] - Whether to auto-dismiss non-danger alerts
     */
    setAlert(type, message, autoDismiss = true) {
      this.alert.type = type;
      this.alert.message = message;

      // Auto-dismiss after 5s only for success, info, warning (not for danger/error)
      if (autoDismiss && type !== 'danger') {
        if (this._alertTimeout) {
          clearTimeout(this._alertTimeout);
        }
        this._alertTimeout = setTimeout(() => {
          this.clearAlert();
        }, 5000);
      }
    },

    /**
     * Clears the current alert message.
     *
     * Resets alert state and cancels any pending auto-dismiss timeout.
     */
    clearAlert() {
      this.alert.type = "";
      this.alert.message = "";
      if (this._alertTimeout) {
        clearTimeout(this._alertTimeout);
        this._alertTimeout = null;
      }
    },

    /**
     * Returns default headers for API requests.
     *
     * @returns {Object} Headers object with Content-Type set to application/json
     */
    apiHeaders() {
      return {
        "Content-Type": "application/json",
      };
    },

    /**
     * Computes fallback base URL for localhost detection.
     *
     * If the configured URL uses localhost, replaces hostname with current
     * window location hostname for network access from the browser.
     *
     * @param {string} baseUrl - Original base URL from configuration
     * @returns {string} Fallback URL or empty string
     */
    computeFallbackBaseUrl(baseUrl) {
      try {
        const url = new URL(baseUrl);
        if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
          url.hostname = window.location.hostname;
          console.debug("[eSIM] Using fallback base URL", url.toString());
          return url.toString().replace(/\/+$/, "");
        }
      } catch (error) {
        console.debug("[eSIM] Unable to compute fallback base URL", error);
      }
      return "";
    },

    /**
     * Performs authenticated API request to LPA server.
     *
     * Tries primary baseUrl, then fallbackBaseUrl if primary fails.
     * Automatically switches to fallback on success. Throws on error.
     *
     * @async
     * @param {string} path - API endpoint path
     * @param {Object} [options={}] - Fetch options (method, body, etc.)
     * @returns {Promise<Object>} JSON response from API
     * @throws {Error} If request fails on all base URLs
     */
    async apiFetch(path, options = {}) {
      if (!this.enabled) {
        throw new Error("eSIM disabled");
      }

      const baseUrlsToTry = [this.baseUrl];
      if (this.fallbackBaseUrl && this.fallbackBaseUrl !== this.baseUrl) {
        baseUrlsToTry.push(this.fallbackBaseUrl);
      }

      let lastError;
      for (const baseUrl of baseUrlsToTry) {
        try {
          console.debug(`[eSIM] API request`, { baseUrl, path });
          const response = await fetch(`${baseUrl}${path}`, {
            ...options,
            headers: {
              ...this.apiHeaders(),
              ...(options.headers || {}),
            },
          });

          if (!response.ok) {
            const text = await response.text();
            throw new Error(text || `Request failed (${response.status})`);
          }

          if (baseUrl !== this.baseUrl) {
            console.debug("[eSIM] Switching to fallback base URL", baseUrl);
            this.baseUrl = baseUrl;
          }

          return response.json();
        } catch (error) {
          console.error(`[eSIM] Error during request to ${baseUrl}${path}`, error);
          lastError = error;
        }
      }

      throw lastError || new Error("Unable to complete eSIM request.");
    },

    /**
     * Checks LPA server health and retrieves EID.
     *
     * Queries /eid endpoint to verify server is online and eSIM is available.
     * Sets serverHealthy flag and displays appropriate alert messages.
     *
     * @async
     * @returns {Promise<void>}
     */
    async checkHealth() {
      try {
        const payload = await this.apiFetch("/eid", { cache: "no-store" });
        const eid = payload?.data?.eid;

        if (eid) {
          this.serverHealthy = true;
          this.eid = eid;
          console.debug("[eSIM] Server online - eSIM OK", eid);
        } else {
          this.serverHealthy = false;
          this.setAlert(
            "warning",
            "Server online but eSIM not available. Check the eSIM module.",
            false
          );
          console.debug("[eSIM] Server online - eSIM ERROR");
        }
      } catch (error) {
        console.error(error);
        this.serverHealthy = false;
        this.setAlert(
          "danger",
          "Server offline. Verify that euicc-client is running.",
          false
        );
        console.debug("[eSIM] Server OFFLINE");
      }
    },

    /**
     * Refreshes all eSIM data from LPA server.
     *
     * Reloads profiles, notifications, and connectivity status with delays
     * between requests to avoid overwhelming the server.
     *
     * @async
     * @returns {Promise<void>}
     */
    async refreshAll() {
      try {
        await this.loadProfiles();
        await this.sleep(500);
        await this.loadNotifications();
        await this.checkInternetConnectivity();
      } catch (error) {
        console.error(error);
        this.setAlert("danger", "Error while refreshing eSIM data.", false);
      }
    },

    /**
     * Promise-based sleep utility.
     *
     * @param {number} ms - Milliseconds to sleep
     * @returns {Promise<void>} Resolves after timeout
     */
    sleep(ms) {
      return new Promise(resolve => setTimeout(resolve, ms));
    },

    /**
     * Loads eSIM EID from LPA server.
     *
     * @async
     * @returns {Promise<void>}
     */
    async loadEid() {
      const payload = await this.apiFetch("/eid", { cache: "no-store" });
      this.eid = payload?.data?.eid || null;
    },

    /**
     * Loads all eSIM profiles from LPA server.
     *
     * @async
     * @returns {Promise<void>}
     */
    async loadProfiles() {
      const payload = await this.apiFetch("/profiles", { cache: "no-store" });
      this.profiles = payload?.data?.profiles || [];
    },

    /**
     * Loads pending notifications from LPA server.
     *
     * @async
     * @returns {Promise<void>}
     */
    async loadNotifications() {
      const payload = await this.apiFetch("/notifications", { cache: "no-store" });
      this.notifications = payload?.data?.notifications || [];
    },

    /**
     * Returns human-readable profile state label.
     *
     * @param {number} value - Profile state value (0=unknown, 1=enabled, 2=disabled)
     * @returns {string} Human-readable state label
     */
    profileStateLabel(value) {
      const labels = {
        0: "Unknown/Disabled",
        1: "Enabled",
        2: "Disabled",
      };
      return labels[value] || "Unknown";
    },

    /**
     * Returns human-readable profile class label.
     *
     * @param {number} value - Profile class value (0=unknown, 1=test, 2=operational)
     * @returns {string} Human-readable class label
     */
    profileClassLabel(value) {
      const labels = {
        0: "Unknown",
        1: "Test",
        2: "Operational",
      };
      return labels[value] || "Unknown";
    },

    /**
     * Returns sorted array of unique ICCIDs from notifications.
     *
     * @returns {string[]} Sorted ICCID strings
     */
    getUniqueNotificationIccids() {
      const iccids = new Set();
      this.notifications.forEach(notification => {
        if (notification.iccid) {
          iccids.add(notification.iccid);
        }
      });
      return Array.from(iccids).sort();
    },

    /**
     * Returns Bootstrap badge color class for notification operation.
     *
     * Maps operation type to appropriate badge color for UI display.
     *
     * @param {string} operationName - Operation name from notification
     * @returns {string} Bootstrap text-bg-* color class
     */
    notificationOperationBadge(operationName) {
      const op = (operationName || '').toLowerCase();

      if (op.includes('enable')) {
        return 'text-bg-success';
      } else if (op.includes('disable')) {
        return 'text-bg-danger';
      } else if (op.includes('delete')) {
        return 'text-bg-warning';
      } else if (op.includes('install') || op.includes('download')) {
        return 'text-bg-primary';
      } else {
        return 'text-bg-secondary';
      }
    },

    /**
     * Parses LPA QR code token string.
     *
     * Extracts SMDP server, matching ID, and optional confirmation code
     * from LPA:1$ formatted QR code.
     *
     * @param {string} qrText - QR code text content
     * @returns {Object} Parsed data {smdp, matching_id, confirmation_code}
     * @throws {Error} If QR code format is invalid
     */
    parseLpaQrCode(qrText) {
      const lpaRegex = /^LPA:1\$([^$]+)\$([^$]+)(?:\$([^$]+))?$/;
      const match = qrText.match(lpaRegex);

      if (!match) {
        throw new Error("Invalid QR code format. Expected: LPA:1$server$id[$code]");
      }

      return {
        smdp: match[1],
        matching_id: match[2],
        confirmation_code: match[3] || ""
      };
    },

    /**
     * Handles QR code image upload for eSIM download.
     *
     * Validates file type, uses jsQR library to decode QR code,
     * parses LPA token, and auto-fills download form fields.
     *
     * @async
     * @param {Event} event - File input change event
     * @returns {Promise<void>}
     */
    async handleQrUpload(event) {
      const file = event.target.files[0];
      if (!file) return;

      if (!file.type.startsWith('image/')) {
        this.setAlert("warning", "Please upload a valid image file.");
        event.target.value = '';
        return;
      }

      if (typeof jsQR === 'undefined') {
        this.setAlert("danger", "jsQR library not loaded. Reload the page and try again.", false);
        event.target.value = '';
        return;
      }

      try {
        const imageData = await this.readImageFile(file);
        const qrCode = jsQR(imageData.data, imageData.width, imageData.height);

        if (!qrCode) {
          this.setAlert("danger", "No QR code found in the image.", false);
          event.target.value = '';
          return;
        }

        console.debug("[eSIM] Decoded QR code:", qrCode.data);

        const lpaData = this.parseLpaQrCode(qrCode.data);

        this.downloadForm = {
          ...this.downloadForm,
          smdp: lpaData.smdp,
          matching_id: lpaData.matching_id,
          confirmation_code: lpaData.confirmation_code
        };

        this.setAlert("success", "QR code read successfully! Fields auto-filled.");

        console.debug("[eSIM] Updated fields:", this.downloadForm);

        event.target.value = '';
      } catch (error) {
        console.error("[eSIM] QR code read error:", error);
        this.setAlert("danger", `Error: ${error.message}`, false);
        event.target.value = '';
      }
    },

    /**
     * Reads image file and returns ImageData.
     *
     * Loads image, draws to canvas, and extracts pixel data for QR processing.
     *
     * @param {File} file - Image file to read
     * @returns {Promise<ImageData>} Image pixel data
     */
    readImageFile(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = (e) => {
          const img = new Image();

          img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');

            canvas.width = img.width;
            canvas.height = img.height;
            ctx.drawImage(img, 0, 0);

            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            resolve(imageData);
          };

          img.onerror = () => reject(new Error("Unable to load image"));
          img.src = e.target.result;
        };

        reader.onerror = () => reject(new Error("Unable to read file"));
        reader.readAsDataURL(file);
      });
    },

    /**
     * Enables an eSIM profile by ICCID.
     *
     * Sends enable request to LPA server, waits for activation, and refreshes
     * profile list and notifications. Uses longer sleep for profile activation.
     *
     * @async
     * @param {string} iccid - ICCID of profile to enable
     * @returns {Promise<void>}
     */
    async enableProfile(iccid) {
      try {
        await this.apiFetch("/profile/enable", {
          method: "POST",
          body: JSON.stringify({ iccid }),
        });
        this.setAlert("success", `Profile ${iccid} enabled successfully.`);
        await this.sleep(3000);
        await this.loadProfiles();
        await this.sleep(500);
        await this.loadNotifications();
      } catch (error) {
        console.error(error);
        this.setAlert("danger", `Error enabling profile: ${error.message}`, false);
      }
    },

    /**
     * Disables an eSIM profile by ICCID.
     *
     * Sends disable request to LPA server and refreshes profile list.
     *
     * @async
     * @param {string} iccid - ICCID of profile to disable
     * @returns {Promise<void>}
     */
    async disableProfile(iccid) {
      try {
        await this.apiFetch("/profile/disable", {
          method: "POST",
          body: JSON.stringify({ iccid }),
        });
        this.setAlert("success", `Profile ${iccid} disabled successfully.`);
        await this.sleep(500);
        await this.loadProfiles();
        await this.sleep(500);
        await this.loadNotifications();
      } catch (error) {
        console.error(error);
        this.setAlert("danger", `Error disabling profile: ${error.message}`, false);
      }
    },

    /**
     * Deletes an eSIM profile by ICCID with user confirmation.
     *
     * Shows confirmation dialog, then sends delete request to LPA server.
     * Refreshes all data after successful deletion.
     *
     * @async
     * @param {string} iccid - ICCID of profile to delete
     * @returns {Promise<void>}
     */
    async deleteProfile(iccid) {
      if (!confirm(`Confirm deletion of profile ${iccid}?`)) {
        return;
      }
      try {
        await this.apiFetch("/profile/delete", {
          method: "POST",
          body: JSON.stringify({ iccid }),
        });
        this.setAlert("success", `Profile ${iccid} deleted.`);
        await this.refreshAll();
      } catch (error) {
        console.error(error);
        this.setAlert("danger", `Error during deletion: ${error.message}`, false);
      }
    },

    /**
     * Sets nickname for an eSIM profile.
     *
     * Updates profile nickname via LPA server and refreshes profile list.
     *
     * @async
     * @returns {Promise<void>}
     */
    async setNickname() {
      if (!this.nicknameForm.iccid) {
        this.setAlert("warning", "Select an ICCID to set the nickname.");
        return;
      }
      try {
        await this.apiFetch("/profile/nickname", {
          method: "POST",
          body: JSON.stringify({
            iccid: this.nicknameForm.iccid,
            nickname: this.nicknameForm.nickname || "",
          }),
        });
        this.setAlert("success", "Nickname updated.");
        this.nicknameForm.nickname = "";
        await this.loadProfiles();
      } catch (error) {
        console.error(error);
        this.setAlert("danger", `Error saving nickname: ${error.message}`, false);
      }
    },

    /**
     * Opens nickname edit modal for a profile.
     *
     * Populates modal with current profile data and displays Bootstrap modal.
     *
     * @param {Object} profile - Profile object containing iccid and profile_nickname
     */
    openNicknameModal(profile) {
      this.nicknameModal.iccid = profile.iccid;
      this.nicknameModal.nickname = profile.profile_nickname || "";
      this.nicknameModal.currentNickname = profile.profile_nickname || "";

      const modalEl = document.getElementById('nicknameModal');
      const modal = new bootstrap.Modal(modalEl);
      modal.show();
    },

    /**
     * Saves profile nickname from modal input.
     *
     * Sends nickname update to LPA server, closes modal, and refreshes profiles.
     *
     * @async
     * @returns {Promise<void>}
     */
    async saveNicknameFromModal() {
      if (!this.nicknameModal.iccid) {
        this.setAlert("warning", "Invalid ICCID ");
        return;
      }

      try {
        await this.apiFetch("/profile/nickname", {
          method: "POST",
          body: JSON.stringify({
            iccid: this.nicknameModal.iccid,
            nickname: this.nicknameModal.nickname || "",
          }),
        });

        this.setAlert("success", "Nickname successful updated");

        const modalEl = document.getElementById('nicknameModal');
        const modal = bootstrap.Modal.getInstance(modalEl);
        if (modal) modal.hide();

        await this.loadProfiles();

        // Reset del form
        this.nicknameModal.iccid = "";
        this.nicknameModal.nickname = "";
        this.nicknameModal.currentNickname = "";
      } catch (error) {
        console.error(error);
        this.setAlert("danger", `Error saving nickname: ${error.message}`, false);
      }
    },
    async downloadProfile() {
      if (!this.downloadForm.smdp || !this.downloadForm.matching_id) {
        this.setAlert("warning", "Fill in SMDP and Matching ID to download the profile.");
        return;
      }
      
      const body = { ...this.downloadForm };
      if (!body.confirmation_code) {
        delete body.confirmation_code;
      }
      
      this.downloadLoading = true;
      this.clearAlert();
      
      try {
        this.setAlert("info", "Profile download in progress...", false);
        
        await this.apiFetch("/download", {
          method: "POST",
          body: JSON.stringify(body),
        });
        
        this.setAlert("success", "Profile download completed!");
        this.downloadForm.confirmation_code = "";
        
        await this.refreshAll();
      } catch (error) {
        console.error(error);
        this.setAlert("danger", `Error during download: ${error.message}`, false);
      } finally {
        this.downloadLoading = false;
      }
    },
    async processSingleNotification(iccid, sequenceNumber) {
      try {
        await this.apiFetch("/notifications/process", {
          method: "POST",
          body: JSON.stringify({
            iccid: iccid,
            sequence_number: sequenceNumber,
            process_all: false
          }),
        });
        this.setAlert("success", `Notification #${sequenceNumber} processed.`);
        await this.loadNotifications();
      } catch (error) {
        console.error(error);
        this.setAlert("danger", `Error during processing: ${error.message}`, false);
      }
    },
    async removeSingleNotification(iccid, sequenceNumber) {
      try {
        await this.apiFetch("/notifications/remove", {
          method: "POST",
          body: JSON.stringify({
            iccid: iccid,
            sequence_number: sequenceNumber
          }),
        });
        this.setAlert("success", `Notification #${sequenceNumber} removed.`);
        await this.loadNotifications();
      } catch (error) {
        console.error(error);
        this.setAlert("danger", `Error during removal: ${error.message}`, false);
      }
    },
    async processAndRemoveNotification(iccid, sequenceNumber) {
      try {
        await this.apiFetch("/notifications/process", {
          method: "POST",
          body: JSON.stringify({
            iccid: iccid,
            sequence_number: sequenceNumber,
            process_all: false
          }),
        });
        await this.apiFetch("/notifications/remove", {
          method: "POST",
          body: JSON.stringify({
            iccid: iccid,
            sequence_number: sequenceNumber
          }),
        });
        this.setAlert("success", `Notification #${sequenceNumber} processed and removed.`);
        await this.loadNotifications();
      } catch (error) {
        console.error(error);
        this.setAlert("danger", `Error: ${error.message}`, false);
      }
    },
    async processAllNotifications() {
      if (!confirm('Confirm processing of ALL notifications?')) {
        return;
      }
      try {
        const iccids = this.getUniqueNotificationIccids();
        let totalProcessed = 0;
    
        for (const iccid of iccids) {
          const response = await this.apiFetch("/notifications/process", {
            method: "POST",
            body: JSON.stringify({
              iccid: iccid,
              process_all: true
            }),
          });
          totalProcessed += response?.processed_count ?? 0;
        }
        this.setAlert("success", `All notifications processed: ${totalProcessed}.`);
        await this.loadNotifications();
      } catch (error) {
        console.error(error);
        this.setAlert("danger", `Error during processing: ${error.message}`, false);
      }
    },
    async removeAllNotifications() {
      if (!confirm('Confirm removal of ALL notifications?')) {
        return;
      }
    
      try {
        const response = await this.apiFetch("/notifications/remove", {
          method: "POST",
          body: JSON.stringify({
            remove_all: true
          }),
        });
        const removedCount = response?.removed_count ?? 0;
        this.setAlert("success", `All notifications removed: ${removedCount}.`);
        await this.loadNotifications();
      } catch (error) {
        console.error(error);
        this.setAlert("danger", `Error during removal: ${error.message}`, false);
      }
    },

    async loadServerConfig() {
      try {
        const response = await fetch('/cgi-bin/get_esim_server_config', {
          cache: 'no-store'
        });
        
        const result = await response.json();
        
        if (!result.ok) {
          console.warn('Failed to load server config:', result.message);
          return;
        }
        
        this.serverConfig = {
          imei: result.data.imei || "",
          slot: parseInt(result.data.slot) || 2,
          refresh: result.data.refresh === true || result.data.refresh === 'true',
        };
        
        console.debug('[eSIM] Server config loaded:', this.serverConfig);
      } catch (error) {
        console.error('[eSIM] Error loading server config:', error);
      }
    },
    async openServerConfigModal() {
      await this.loadServerConfig();
    },
    async saveServerConfig() {
      if (this.isSavingServerConfig) {
        return;
      }
      
      // Validate IMEI
      if (!/^[0-9]{15}$/.test(this.serverConfig.imei)) {
        this.setAlert('danger', 'Invalid IMEI format. Must be 15 digits.', false);
        return;
      }
      
      // Validate slot
      if (this.serverConfig.slot !== 1 && this.serverConfig.slot !== 2) {
        this.setAlert('danger', 'Invalid slot. Must be 1 or 2.', false);
        return;
      }
      
      if (!confirm('This will restart the euicc-client service. Continue?')) {
        return;
      }
      
      this.isSavingServerConfig = true;
      this.clearAlert();
      
      try {
        const response = await fetch('/cgi-bin/esim_server_config', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            imei: this.serverConfig.imei,
            slot: this.serverConfig.slot,
            refresh: this.serverConfig.refresh
          })
        });
        
        const result = await response.json();
        
        if (!result.ok) {
          throw new Error(result.message || 'Failed to update server configuration');
        }
        
        this.setAlert('success', result.message || 'Server configuration updated successfully');
        
        // Close modal
        const modalEl = document.getElementById('serverConfigModal');
        const modal = bootstrap.Modal.getInstance(modalEl);
        if (modal) {
          modal.hide();
        }
        
        // Wait a bit for the service to restart
        await this.sleep(2000);
        
        // Refresh everything
        await this.bootstrap();
        
      } catch (error) {
        console.error('[eSIM] Error saving server config:', error);
        this.setAlert('danger', `Failed to update configuration: ${error.message}`, false);
      } finally {
        this.isSavingServerConfig = false;
      }
    },    
  };
}

if (typeof window !== "undefined") {
  window.esimManager = esimManager;
}

const registerEsimManager = () => {
  if (window.Alpine) {
    window.Alpine.data("esimManager", esimManager);
  }
};

if (window.Alpine) {
  registerEsimManager();
} else {
  document.addEventListener("alpine:init", registerEsimManager, { once: true });
}