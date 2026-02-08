/**
 * Network settings configuration for T99W175 modem.
 *
 * Provides Alpine.js component for managing modem network settings:
 * - LAN IP address and subnet mask configuration
 * - DHCP server settings (range, lease time)
 * - DMZ (Demilitarized Zone) configuration
 * - IPv6 and bridge mode settings
 * - TTL override configuration
 * - Scheduled reboot management
 * - Connection monitoring configuration
 * - ARP table management
 *
 * @module settings
 * @requires Alpine.js
 * @requires atcommand-utils.js
 */

/**
 * Registers the networkSettings Alpine.js component.
 *
 * Supports both dynamic loading and normal page load scenarios.
 * Returns Alpine data definition function.
 *
 * @returns {Function} Alpine.data registration function
 */
// Support both dynamic loading and normal page load
function registerNetworkSettings() {
  /**
   * Alpine.js component factory for network settings.
   *
   * Manages network configuration including LAN IP, DHCP, DMZ,
   * bridge mode, TTL override, reboot scheduling, and monitoring.
   *
   * @returns {Object} Alpine.js component data object
   */
  Alpine.data("networkSettings", () => ({
    // Loading state for configuration operations
    isLoading: false,
    // Saving state for network configuration
    isSaving: false,
    // Error message from loading configuration
    loadError: "",
    // Success message for configuration changes
    successMessage: "",
    // Restart notification message
    restartMessage: "",
    // CSS class for restart status alert
    restartStatusClass: "alert-info",
    // Array of validation error messages
    validationErrors: [],
    // Flag indicating DHCP range was manually edited
    dhcpRangeEdited: false,
    // Original configuration data for comparison
    originalData: null,
    // Bridge mode confirmation modals
    showBridgeEnableModal: false,
    showBridgeDisableModal: false,
    // TTL save in progress flag
    ttlSaving: false,
    // TTL save success message
    ttlSuccessMessage: "",
    // TTL save error message
    ttlErrorMessage: "",
    // TTL configuration form data
    ttlForm: {
      enabled: false,
      value: 64
    },
    // Reboot configuration save in progress
    rebootSaving: false,
    // Reboot save success message
    rebootSuccessMessage: "",
    // Reboot save error message
    rebootErrorMessage: "",
    // Current reboot schedule string
    rebootSchedule: "",
    // Reboot configuration form data
    rebootForm: {
      enabled: false,
      mode: "interval",
      intervalHours: 24,
      frequency: "daily",
      dayOfWeek: "3",
      dayOfMonth: 1,
      time: "00:00",
    },
    // Current TTL settings from server
    currentTtlSettings: {
      enabled: false,
      value: 0,
    },
    // Subnet mask dropdown options
    maskOptions: [
      { value: "255.255.255.0", label: "/24 (255.255.255.0)" },
      { value: "255.255.255.128", label: "/25 (255.255.255.128)" },
      { value: "255.255.255.192", label: "/26 (255.255.255.192)" },
      { value: "255.255.255.224", label: "/27 (255.255.255.224)" },
      { value: "255.255.255.240", label: "/28 (255.255.255.240)" },
      { value: "255.255.255.248", label: "/29 (255.255.255.248)" },
      { value: "255.255.255.252", label: "/30 (255.255.255.252)" },
    ],
    // Main network configuration form data
    form: {
      ipAddress: "",
      subnetMask: "255.255.255.0",
      dhcpEnabled: true,
      dhcpStart: "",
      dhcpEnd: "",
      dhcpLease: "",
      dmzEnabled: false,
      dmzIp: "",
      ipv6Enabled: true,
      bridgeEnabled: false,
      bridgeMac: "",
      autoConnect: true,
      roamingEnabled: false,
    },
    // IP address validation error flags
    ipErrors: {
      ipAddress: false,
      dhcpStart: false,
      dhcpEnd: false,
      dmzIp: false,
      dhcpLease: false,
    },
    // ARP table entries array
    arpEntries: [],
    // Flag showing if there are pending changes that require restart
    pendingRestartWarning: false,
    // Save confirmation modal visibility
    showSaveConfirmModal: false,
    // Reboot progress modal visibility
    showRebootModal: false,
    // Flag indicating if restart is required
    requiresRestart: false,
    // Reboot countdown timer
    rebootCountdown: 60,
    // Reboot countdown interval
    rebootInterval: null,

    /**
     * Initializes network settings component.
     *
     * Loads current configuration, TTL settings, reboot schedule,
     * connection config, and ARP entries on component mount.
     *
     * @async
     * @returns {Promise<void>}
     */
    async init() {
      await this.fetchConfiguration();
      await this.fetchTtlSettings();
      await this.loadRebootSchedule();
      await this.fetchArpEntries();

      // Watch for changes to form fields that require restart
      this.$watch('form', () => this.checkPendingRestart(), { deep: true });
    },

    /**
     * Checks if any reboot-requiring settings have changed
     */
    checkPendingRestart() {
      if (!this.originalData) {
        this.pendingRestartWarning = false;
        return;
      }

      const networkChanged =
        this.form.ipAddress !== this.originalData.ipAddress ||
        this.form.subnetMask !== this.originalData.subnetMask ||
        this.form.dhcpEnabled !== this.originalData.dhcpEnabled ||
        this.form.dhcpStart !== this.originalData.dhcpStart ||
        this.form.dhcpEnd !== this.originalData.dhcpEnd ||
        this.form.dhcpLease !== this.originalData.dhcpLease ||
        this.form.dmzEnabled !== this.originalData.dmzEnabled ||
        this.form.dmzIp !== this.originalData.dmzIp ||
        this.form.ipv6Enabled !== this.originalData.ipv6Enabled ||
        this.form.bridgeEnabled !== this.originalData.bridgeEnabled ||
        this.form.bridgeMac !== this.originalData.bridgeMac;

      const wanConnectionChanged =
        this.form.autoConnect !== this.originalData.autoConnect ||
        this.form.roamingEnabled !== this.originalData.roamingEnabled;

      this.pendingRestartWarning = networkChanged || wanConnectionChanged;
    },

    /**
     * Resets all status messages.
     *
     * Clears success, error, and restart notification messages.
     */
    resetMessages() {
      this.successMessage = "";
      this.restartMessage = "";
      this.loadError = "";
    },
    setFormData(data) {
      this.form.ipAddress = data.ipAddress || "";
      const fallbackMask = this.maskOptions[0].value;
      const mask = data.subnetMask || fallbackMask;
      this.form.subnetMask = this.maskOptions.some(
        (option) => option.value === mask
      )
        ? mask
        : fallbackMask;
      this.form.dhcpEnabled = Boolean(data.dhcpEnabled);
      this.form.dhcpStart = data.dhcpStart || "";
      this.form.dhcpEnd = data.dhcpEnd || "";
      this.form.dhcpLease = data.dhcpLease || "";
      this.form.dmzEnabled = Boolean(data.dmzEnabled);
      this.form.dmzIp = data.dmzIp || "";
      this.form.ipv6Enabled = Boolean(data.ipv6Enabled);
      this.form.bridgeEnabled = Boolean(data.bridgeEnabled);
      this.form.bridgeMac = data.bridgeMac || "";
      this.form.autoConnect = data.autoConnect !== undefined ? Boolean(data.autoConnect) : true;
      this.form.roamingEnabled = data.roamingEnabled !== undefined ? Boolean(data.roamingEnabled) : false;
      this.originalData = JSON.parse(JSON.stringify(this.form));
      this.dhcpRangeEdited = false;
    },
    handleIpChange() {
      if (this.dhcpRangeEdited) {
        return;
      }

      if (!this.isValidIp(this.form.ipAddress)) {
        return;
      }

      const octets = this.form.ipAddress.split(".");
      if (octets.length !== 4) {
        return;
      }

      const networkPrefix = `${octets[0]}.${octets[1]}.${octets[2]}`;
      this.form.dhcpStart = `${networkPrefix}.20`;
      this.form.dhcpEnd = `${networkPrefix}.60`;
    },
    handleMaskChange() {
      if (this.dhcpRangeEdited) {
        return;
      }

      if (!this.isValidIp(this.form.ipAddress)) {
        return;
      }

      if (!this.isValidNetmask(this.form.subnetMask)) {
        return;
      }

      // Calculate network address and broadcast based on IP and subnet mask
      const ipOctets = this.form.ipAddress.split(".").map(Number);
      const maskOctets = this.form.subnetMask.split(".").map(Number);

      // Calculate network address
      const networkOctets = ipOctets.map((ip, i) => ip & maskOctets[i]);

      // Calculate wildcard (inverse of mask)
      const wildcardOctets = maskOctets.map(m => 255 - m);

      // Calculate broadcast address
      const broadcastOctets = networkOctets.map((net, i) => net | wildcardOctets[i]);

      // Calculate max hosts
      const maxHosts = broadcastOctets[3] - networkOctets[3] - 1;

      // Network prefix
      const networkPrefix = `${networkOctets[0]}.${networkOctets[1]}.${networkOctets[2]}`;

      // Calculate safe DHCP range (use middle portion of available range)
      // Skip first few IPs (usually gateway) and last IPs (broadcast)
      const startOffset = Math.min(10, Math.floor(maxHosts / 4));
      const endOffset = Math.min(60, Math.floor(maxHosts / 2));

      const dhcpStart = networkOctets[3] + startOffset;
      const dhcpEnd = Math.min(networkOctets[3] + endOffset, broadcastOctets[3] - 1);

      this.form.dhcpStart = `${networkPrefix}.${dhcpStart}`;
      this.form.dhcpEnd = `${networkPrefix}.${dhcpEnd}`;
    },
    validateIpField(field, value) {
      this.ipErrors[field] = value !== "" && !this.isValidIp(value);
    },
    validateDhcpLease(value) {
      const lease = Number(value);
      this.ipErrors.dhcpLease = value !== "" && (!Number.isInteger(lease) || lease <= 0);
    },
    clearDmzError() {
      if (!this.form.dmzEnabled) {
        this.form.dmzIp = "";
        this.ipErrors.dmzIp = false;
      }
    },
    clearBridgeError() {
      // When toggling bridge mode, show appropriate confirmation modal

      // Case 1: Disabling bridge mode with a MAC set
      if (!this.form.bridgeEnabled && this.form.bridgeMac) {
        // Revert for now - wait for user confirmation
        this.form.bridgeEnabled = true;

        // Show disable confirmation modal
        this.$nextTick(() => {
          const modalElement = document.getElementById('bridgeDisableModal');
          if (modalElement) {
            const modal = new bootstrap.Modal(modalElement);
            modal.show();
          }
        });
      }
      // Case 2: No MAC set while disabling - clear it
      else if (!this.form.bridgeEnabled) {
        this.form.bridgeMac = "";
      }
      // Case 3: Enabling bridge mode - show enable confirmation
      else if (this.form.bridgeEnabled && !this.showBridgeDisableModal) {
        // Don't show modal if we're coming back from disabling
        this.form.bridgeEnabled = false; // Revert for now

        this.$nextTick(() => {
          const modalElement = document.getElementById('bridgeEnableModal');
          if (modalElement) {
            const modal = new bootstrap.Modal(modalElement);
            modal.show();
          }
        });
      }
    },

    confirmBridgeEnable() {
      // User confirmed - enable bridge mode
      this.form.bridgeEnabled = true;

      // Ensure DHCP is enabled
      if (!this.form.dhcpEnabled) {
        this.form.dhcpEnabled = true;
      }

      // Hide the modal
      const modalElement = document.getElementById('bridgeEnableModal');
      if (modalElement) {
        const modal = bootstrap.Modal.getInstance(modalElement);
        if (modal) {
          modal.hide();
        }
      }
    },

    cancelBridgeEnable() {
      // User cancelled - modal will be hidden by data-bs-dismiss
      // Keep bridge mode disabled (already reverted)
    },

    async confirmBridgeDisable() {
      // User confirmed - disable bridge mode and clear MAC
      this.form.bridgeEnabled = false;
      this.form.bridgeMac = "";

      // Save immediately without restart
      await this.saveBridgeDisable();
    },

    async saveBridgeDisable() {
      this.isSaving = true;
      this.successMessage = "";
      this.restartMessage = "";
      this.validationErrors = [];

      const params = new URLSearchParams();
      params.set("action", "update");
      params.set("ip_address", this.form.ipAddress.trim());
      params.set("subnet_mask", this.form.subnetMask.trim());
      params.set("dhcp_enabled", this.form.dhcpEnabled ? "1" : "0");
      if (this.form.dhcpEnabled) {
        params.set("dhcp_start", this.form.dhcpStart.trim());
        params.set("dhcp_end", this.form.dhcpEnd.trim());
        params.set("dhcp_lease", this.form.dhcpLease.trim());
      }
      params.set("dmz_enabled", this.form.dmzEnabled ? "1" : "0");
      const dmzIpValue = this.form.dmzEnabled ? this.form.dmzIp.trim() : "0.0.0.0";
      params.set("dmz_ip", dmzIpValue);
      params.set("ipv6_enabled", this.form.ipv6Enabled ? "1" : "0");
      params.set("bridge_enabled", "0"); // Disabled
      params.set("bridge_mac", "0"); // Cleared
      params.set("auto_connect", this.form.autoConnect ? "1" : "0");
      params.set("roaming_enabled", this.form.roamingEnabled ? "1" : "0");

      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), 15000);

      try {
        const response = await fetch("/cgi-bin/network_settings", {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Accept: "application/json",
          },
          body: params.toString(),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const payload = await response.json();
        if (!payload.success) {
          const details = Array.isArray(payload.errors) && payload.errors.length
            ? `: ${payload.errors.join(" ")}`
            : "";
          throw new Error(payload.message + details);
        }

        // Update original data to reflect the saved state
        this.originalData = {
          ...this.form,
          bridgeEnabled: false,
          bridgeMac: ""
        };

        this.successMessage = "Bridge mode disabled successfully.";

        // Auto-hide success message after 5 seconds
        setTimeout(() => {
          this.successMessage = "";
        }, 5000);

        // Hide the modal
        const modalElement = document.getElementById('bridgeDisableModal');
        if (modalElement) {
          const modal = bootstrap.Modal.getInstance(modalElement);
          if (modal) {
            modal.hide();
          }
        }

      } catch (error) {
        console.error("Unable to disable bridge mode", error);
        if (error && error.name === "AbortError") {
          this.validationErrors.push(
            "Disabling bridge mode timed out. Please verify the connection and try again."
          );
        } else {
          this.validationErrors.push(
            error && error.message ? error.message : "Unable to disable bridge mode."
          );
        }
      } finally {
        window.clearTimeout(timeoutId);
        this.isSaving = false;
      }
    },

    cancelBridgeDisable() {
      // User cancelled - keep bridge mode enabled (already reverted)
      // Modal will be hidden by data-bs-dismiss
    },

    async applyTTL() {
      this.ttlSaving = true
      this.ttlSuccessMessage = ""
      this.ttlErrorMessage = ""

      if (this.ttlForm.value < 1 || this.ttlForm.value > 255) {
        this.ttlErrorMessage = "TTL value must be between 1 and 255."
        this.ttlSaving = false
        return
      }

      try {
        const response = await fetch(
          "/cgi-bin/set_ttl?" +
            new URLSearchParams({ ttlvalue: this.ttlForm.value })
        )

        if (!response.ok) {
          throw new Error("Failed to save TTL settings")
        }

        this.currentTtlSettings.enabled = true
        this.currentTtlSettings.value = this.ttlForm.value

        this.ttlSuccessMessage =
          `Custom TTL enabled with value ${this.ttlForm.value}. Applied immediately.`
        
        // Auto-hide success message after 5 seconds
        setTimeout(() => {
          this.ttlSuccessMessage = ""
        }, 5000)
      } catch (e) {
        this.ttlErrorMessage = "Failed to apply TTL settings."
      } finally {
        this.ttlSaving = false
      }
    },
    async disableTTL() {
      this.ttlSaving = true
      this.ttlSuccessMessage = ""
      this.ttlErrorMessage = ""

      try {
        await fetch(
          "/cgi-bin/set_ttl?" +
            new URLSearchParams({ ttlvalue: 0 })
        )

        this.currentTtlSettings.enabled = false
        this.currentTtlSettings.value = 0
        this.ttlForm.value = 64

        this.ttlSuccessMessage =
          "Custom TTL disabled. Applied immediately."
        
        // Auto-hide success message after 5 seconds
        setTimeout(() => {
          this.ttlSuccessMessage = ""
        }, 5000)
      } catch (e) {
        this.ttlErrorMessage = "Failed to disable TTL."
        this.ttlForm.enabled = true // rollback UI
      } finally {
        this.ttlSaving = false
      }
    },
    async onTTLToggle() {
      if (!this.ttlForm.enabled) {
        // Disable TTL without confirmation
        await this.disableTTL()
        return
      }

      // Enable TTL
      if (!this.ttlForm.value) {
        this.ttlForm.value = this.currentTtlSettings.value || 64
      }

      await this.applyTTL()
    },    
    async fetchTtlSettings() {
      try {
        const response = await fetch("/cgi-bin/get_ttl_status");
        if (!response.ok) {
          throw new Error("Failed to fetch TTL settings");
        }
        
        const data = await response.json();
        this.currentTtlSettings.enabled = data.isEnabled || false;
        this.currentTtlSettings.value = data.ttl || 0;
        
        this.ttlForm.enabled = this.currentTtlSettings.enabled;
        this.ttlForm.value = this.currentTtlSettings.enabled ? this.currentTtlSettings.value : 64;
      } catch (error) {
        console.error("Error loading TTL settings:", error);
        this.currentTtlSettings.enabled = false;
        this.currentTtlSettings.value = 0;
        this.ttlForm.enabled = false;
        this.ttlForm.value = 64;
      }
    },    
    resetForm() {
      if (this.originalData) {
        this.form = JSON.parse(JSON.stringify(this.originalData));
        this.validationErrors = [];
        this.successMessage = "";
        this.restartMessage = "";
        this.dhcpRangeEdited = false;
        this.ttlSuccessMessage = "";
        this.ttlErrorMessage = "";
      }
    },
    async loadRebootSchedule() {
      this.rebootErrorMessage = "";

      try {
        const response = await fetch("/cgi-bin/reboot_schedule", {
          headers: { Accept: "application/json" },
        });

        if (!response.ok) {
          throw new Error("Failed to load reboot schedule");
        }

        const payload = await response.json();
        const savedSchedule = payload.schedule || "";
        this.rebootSchedule = savedSchedule;
        if (savedSchedule) {
          this.rebootForm.enabled = true;  
          this.applyScheduleToForm(savedSchedule);
        } else {
          this.rebootForm.enabled = false; 
          this.resetRebootForm();
        }
      } catch (error) {
        console.error("Error loading reboot schedule", error);
        this.rebootErrorMessage = "Unable to read the reboot schedule.";
      }
    },
    resetRebootForm() {
      this.rebootForm.enabled = false;
      this.rebootForm.mode = "interval";
      this.rebootForm.intervalHours = 24;
      this.rebootForm.frequency = "daily";
      this.rebootForm.dayOfWeek = "3";
      this.rebootForm.dayOfMonth = 1;
      this.rebootForm.time = "00:00";
    },
    async applyRebootImmediately() {
      this.rebootSuccessMessage = "";
      this.rebootErrorMessage = "";

      if (!this.rebootForm.enabled) {
        const confirmed = window.confirm(
          "Are you sure you want to disable automatic reboot?"
        );
        if (!confirmed) {
          this.rebootForm.enabled = true;
          return;
        }
        
        await this.clearRebootSchedule();
        return;
      }

      const validationError = this.validateRebootForm();
      if (validationError) {
        this.rebootErrorMessage = validationError;
        return;
      }

      const cronExpression = this.buildCronExpression();
      this.rebootSaving = true;

      try {
        const response = await fetch("/cgi-bin/reboot_schedule", {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({ schedule: cronExpression }),
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const payload = await response.json();
        this.rebootSchedule = payload.schedule || cronExpression;
        this.rebootSuccessMessage = "Schedule saved and applied immediately.";
        
        setTimeout(() => {
          this.rebootSuccessMessage = "";
        }, 5000);
      } catch (error) {
        console.error("Error while saving the schedule", error);
        this.rebootErrorMessage = "Unable to save the schedule. Please try again.";
      } finally {
        this.rebootSaving = false;
      }
    },    
    applyScheduleToForm(schedule) {
      if (!schedule || typeof schedule !== "string") {
        return;
      }

      const parts = schedule.trim().split(/\s+/);
      if (parts.length < 6) {
        return;
      }

      const [minute, hour, dayOfMonth, , dayOfWeek] = parts;

      const timeValue = this.formatTimeValue(hour, minute);

      if (
        minute === "0" &&
        hour === "0" &&
        dayOfMonth === "*" &&
        dayOfWeek === "*"
      ) {
        this.rebootForm.mode = "interval";
        this.rebootForm.intervalHours = 24;
        return;
      }      

      if (
        minute === "0" &&
        hour.startsWith("*/") &&
        dayOfMonth === "*" &&
        dayOfWeek === "*"
      ) {
        const everyHours = parseInt(hour.replace("*/", ""), 10);
        if (!Number.isNaN(everyHours)) {
          this.rebootForm.mode = "interval";
          this.rebootForm.intervalHours = everyHours;
        }
        return;
      }

      this.rebootForm.mode = "schedule";
      this.rebootForm.time = timeValue;

      if (dayOfMonth === "*" && dayOfWeek === "*") {
        this.rebootForm.frequency = "daily";
      } else if (dayOfMonth === "*" && dayOfWeek !== "*") {
        this.rebootForm.frequency = "weekly";
        this.rebootForm.dayOfWeek = dayOfWeek;
      } else if (dayOfMonth !== "*" && dayOfWeek === "*") {
        const day = parseInt(dayOfMonth, 10);
        if (!Number.isNaN(day)) {
          this.rebootForm.frequency = "monthly";
          this.rebootForm.dayOfMonth = day;
        }
      }
    },
    formatTimeValue(hour, minute) {
      const paddedHour = String(hour || "0").padStart(2, "0");
      const paddedMinute = String(minute || "0").padStart(2, "0");
      return `${paddedHour}:${paddedMinute}`;
    },
    validateRebootForm() {
      if (this.rebootForm.mode === "interval") {
        if (!this.rebootForm.intervalHours || this.rebootForm.intervalHours < 1) {
          return "Enter an interval in hours greater than zero.";
        }

        return "";
      }

      if (!this.rebootForm.time) {
        return "Select a time for the reboot.";
      }

      const [hour, minute] = this.rebootForm.time.split(":").map(Number);
      if (
        Number.isNaN(hour) ||
        Number.isNaN(minute) ||
        hour < 0 ||
        hour > 23 ||
        minute < 0 ||
        minute > 59
      ) {
        return "Invalid time.";
      }

      if (this.rebootForm.frequency === "weekly") {
        if (this.rebootForm.dayOfWeek === "" || this.rebootForm.dayOfWeek === null) {
          return "Choose a day of the week.";
        }
      }

      if (this.rebootForm.frequency === "monthly") {
        if (
          !this.rebootForm.dayOfMonth ||
          this.rebootForm.dayOfMonth < 1 ||
          this.rebootForm.dayOfMonth > 31
        ) {
          return "Choose a day of the month between 1 and 31.";
        }
      }

      return "";
    },
    buildCronExpression() {
      if (this.rebootForm.mode === "interval") {
        const hours = Math.max(1, parseInt(this.rebootForm.intervalHours, 10));
        if (hours === 24) {
          return `0 0 * * * reboot`;
        }
        return `0 */${hours} * * * reboot`;
      }

      const [hour, minute] = this.rebootForm.time.split(":").map(Number);
      let dayOfMonth = "*";
      let dayOfWeek = "*";

      if (this.rebootForm.frequency === "weekly") {
        dayOfWeek = this.rebootForm.dayOfWeek || "0";
      }

      if (this.rebootForm.frequency === "monthly") {
        dayOfMonth = this.rebootForm.dayOfMonth || 1;
      }

      return `${minute} ${hour} ${dayOfMonth} * ${dayOfWeek} reboot`;
    },
    async clearRebootSchedule() {
      this.rebootSuccessMessage = "";
      this.rebootErrorMessage = "";
      this.rebootSaving = true;

      try {
        const response = await fetch("/cgi-bin/reboot_schedule", {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({ action: "delete" }),
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        this.rebootSchedule = "";
        this.rebootForm.enabled = false;
        this.resetRebootForm();
        this.rebootSuccessMessage = "Schedule removed.";

        // Auto-hide message after 5 seconds
        setTimeout(() => {
          this.rebootSuccessMessage = "";
        }, 5000);
      } catch (error) {
        console.error("Error while deleting the schedule", error);
        this.rebootErrorMessage =
          "Unable to remove the schedule. Please try again.";
      } finally {
        this.rebootSaving = false;
      }
    },
    async fetchConfiguration(shouldResetMessages = true) {
      this.isLoading = true;
      if (shouldResetMessages) {
        this.resetMessages();
      }
      this.validationErrors = [];

      try {
        const response = await fetch("/cgi-bin/network_settings?action=get", {
          headers: {
            "Accept": "application/json",
          },
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const payload = await response.json();
        if (!payload.success) {
          throw new Error(payload.message || "Unable to read the configuration.");
        }

        this.setFormData(payload.data || {});
      } catch (error) {
        console.error("Failed to load configuration", error);
        this.loadError =
          error && error.message
            ? `Unable to load the current configuration: ${error.message}`
            : "Unable to load the current configuration.";
      } finally {
        this.isLoading = false;
      }
    },
    validateForm() {
      const errors = [];

      if (!this.isValidIp(this.form.ipAddress)) {
        errors.push("Enter a valid LAN IP address (e.g. 192.168.1.1).");
      }

      if (!this.isValidNetmask(this.form.subnetMask)) {
        errors.push("Select a subnet mask between /24 and /30.");
      }

      if (this.form.dhcpEnabled) {
        if (!this.isValidIp(this.form.dhcpStart)) {
          errors.push("Enter a valid DHCP start address.");
        }
        if (!this.isValidIp(this.form.dhcpEnd)) {
          errors.push("Enter a valid DHCP end address.");
        }
        const lease = Number(this.form.dhcpLease);
        if (!Number.isInteger(lease) || lease <= 0) {
          errors.push("Lease time must be a positive number of seconds.");
        }

        if (this.isValidIp(this.form.ipAddress) && this.isValidNetmask(this.form.subnetMask)) {
          if (!this.areInSameSubnet(this.form.ipAddress, this.form.dhcpStart, this.form.subnetMask)) {
            errors.push("The DHCP start address must be in the same subnet as the LAN IP.");
          }

          if (!this.areInSameSubnet(this.form.ipAddress, this.form.dhcpEnd, this.form.subnetMask)) {
            errors.push("The DHCP end address must be in the same subnet as the LAN IP.");
          }
        }

        if (this.isValidIp(this.form.dhcpStart) && this.isValidIp(this.form.dhcpEnd)) {
          if (this.ipToNumber(this.form.dhcpStart) > this.ipToNumber(this.form.dhcpEnd)) {
            errors.push("The DHCP range start must be lower than the end address.");
          }
        }
      }

      if (this.form.dmzEnabled) {
        if (!this.isValidIp(this.form.dmzIp) || this.form.dmzIp === "0.0.0.0") {
          errors.push("Enter a valid DMZ client IP address.");
        }

        if (this.form.dmzIp === this.form.ipAddress) {
          errors.push("The DMZ client must be different from the LAN IP address.");
        }

        if (
          this.isValidIp(this.form.ipAddress) &&
          this.isValidNetmask(this.form.subnetMask) &&
          this.isValidIp(this.form.dmzIp)
        ) {
          if (!this.areInSameSubnet(this.form.ipAddress, this.form.dmzIp, this.form.subnetMask)) {
            errors.push("The DMZ client must be in the same subnet as the LAN IP.");
          }
        }
      }

      if (this.form.bridgeEnabled) {
        if (!this.isValidMac(this.form.bridgeMac)) {
          errors.push("Enter a valid bridge client MAC address (AA:BB:CC:DD:EE:FF).");
        }
      }

      this.validationErrors = errors;
      return errors.length === 0;
    },
    ipToNumber(ip) {
      const octets = ip.split(".").map((part) => parseInt(part, 10));
      if (octets.length !== 4 || octets.some((part) => Number.isNaN(part))) {
        return 0;
      }
      return (
        (octets[0] << 24) +
        (octets[1] << 16) +
        (octets[2] << 8) +
        octets[3]
      );
    },
    areInSameSubnet(ip1, ip2, mask) {
      const n1 = this.ipToNumber(ip1);
      const n2 = this.ipToNumber(ip2);
      const nm = this.ipToNumber(mask);
      return (n1 & nm) === (n2 & nm);
    },
    isValidIp(value) {
      if (typeof value !== "string") {
        return false;
      }
      const regex = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
      return regex.test(value.trim());
    },
    isValidNetmask(value) {
      if (!this.isValidIp(value)) {
        return false;
      }
      const validMasks = new Set(
        this.maskOptions.map((option) => option.value)
      );
      return validMasks.has(value.trim());
    },
    isValidMac(value) {
      if (typeof value !== "string") {
        return false;
      }
      const macRegex = /^([0-9A-F]{2}:){5}[0-9A-F]{2}$/;
      return macRegex.test(value.trim().toUpperCase());
    },
    async saveSettings() {
      this.successMessage = "";
      this.restartMessage = "";
      this.showSaveConfirmModal = false;

      if (!this.validateForm()) {
        return;
      }

      const params = new URLSearchParams();
      params.set("action", "update");
      params.set("ip_address", this.form.ipAddress.trim());
      params.set("subnet_mask", this.form.subnetMask.trim());
      params.set("dhcp_enabled", this.form.dhcpEnabled ? "1" : "0");
      if (this.form.dhcpEnabled) {
        params.set("dhcp_start", this.form.dhcpStart.trim());
        params.set("dhcp_end", this.form.dhcpEnd.trim());
        params.set("dhcp_lease", this.form.dhcpLease.trim());
      }

      params.set("dmz_enabled", this.form.dmzEnabled ? "1" : "0");
      const dmzIpValue = this.form.dmzEnabled ? this.form.dmzIp.trim() : "0.0.0.0";
      params.set("dmz_ip", dmzIpValue);
      params.set("ipv6_enabled", this.form.ipv6Enabled ? "1" : "0");
      params.set("bridge_enabled", this.form.bridgeEnabled ? "1" : "0");
      const bridgeMacValue = this.form.bridgeEnabled
        ? this.form.bridgeMac.trim().toUpperCase()
        : "0";
      params.set("bridge_mac", bridgeMacValue);
      params.set("auto_connect", this.form.autoConnect ? "1" : "0");
      params.set("roaming_enabled", this.form.roamingEnabled ? "1" : "0");

      this.isSaving = true;
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), 15000);

      try {
        const response = await fetch("/cgi-bin/network_settings", {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Accept: "application/json",
          },
          body: params.toString(),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const payload = await response.json();
        if (!payload.success) {
          const details = Array.isArray(payload.errors) && payload.errors.length
            ? `: ${payload.errors.join(" ")}`
            : "";
          throw new Error(payload.message + details);
        }

        // Check if any settings changed that require restart
        const networkChanged =
          this.originalData && (
            this.form.ipAddress !== this.originalData.ipAddress ||
            this.form.subnetMask !== this.originalData.subnetMask ||
            this.form.dhcpEnabled !== this.originalData.dhcpEnabled ||
            this.form.dhcpStart !== this.originalData.dhcpStart ||
            this.form.dhcpEnd !== this.originalData.dhcpEnd ||
            this.form.dhcpLease !== this.originalData.dhcpLease ||
            this.form.dmzEnabled !== this.originalData.dmzEnabled ||
            this.form.dmzIp !== this.originalData.dmzIp ||
            this.form.ipv6Enabled !== this.originalData.ipv6Enabled ||
            this.form.bridgeEnabled !== this.originalData.bridgeEnabled ||
            this.form.bridgeMac !== this.originalData.bridgeMac
          );

        const wanConnectionChanged =
          this.originalData && (
            this.form.autoConnect !== this.originalData.autoConnect ||
            this.form.roamingEnabled !== this.originalData.roamingEnabled
          );

        this.requiresRestart = networkChanged || wanConnectionChanged;

        // Show confirmation modal
        this.showSaveConfirmModal = true;

      } catch (error) {
        console.error("Unable to save network settings", error);
        this.restartMessage = "";
        this.successMessage = "";
        this.validationErrors = [];
        this.loadError = "";
        if (error && error.name === "AbortError") {
          this.validationErrors.push(
            "Saving the network settings timed out. Please verify the connection and try again."
          );
        } else {
          this.validationErrors.push(
            error && error.message ? error.message : "Unable to save the network settings."
          );
        }
      } finally {
        window.clearTimeout(timeoutId);
        this.isSaving = false;
      }
    },
    cancelRestart() {
      this.showSaveConfirmModal = false;
      this.requiresRestart = false;
      this.pendingRestartWarning = false;
      // Reload page to refresh configuration
      window.location.reload();
    },
    async confirmRestart() {
      this.showSaveConfirmModal = false;
      this.showRebootModal = true;
      this.rebootCountdown = 60;

      try {
        const result = await ATCommandService.execute("AT+CFUN=1,1", {
          endpoint: "/cgi-bin/user_atcommand",
          retries: 0,
          timeout: 20000,
        });

        if (!result.ok) {
          const reason = result.error && result.error.message ? result.error.message : "unknown error";
          this.showRebootModal = false;
          this.validationErrors.push(`Modem restart failed: ${reason}`);
          return;
        }
      } catch (error) {
        console.error("Unable to restart the modem", error);
        this.showRebootModal = false;
        this.validationErrors.push(
          error && error.message
            ? `Modem restart failed: ${error.message}`
            : "Modem restart failed."
        );
        return;
      }

      // Start countdown
      this.rebootInterval = setInterval(() => {
        this.rebootCountdown--;
        if (this.rebootCountdown <= 0) {
          clearInterval(this.rebootInterval);
          window.location.reload();
        }
      }, 1000);
    },
    async fetchArpEntries() {
      try {
        const response = await fetch("/cgi-bin/get_arp");
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        if (data.status === "success") {
          // Group entries by MAC address and combine IPs
          const macMap = new Map();
          
          (data.entries || []).forEach(entry => {
            const mac = entry.mac.toUpperCase();
            if (!macMap.has(mac)) {
              macMap.set(mac, {
                mac: mac,
                ips: []
              });
            }
            // Add IP if not already present
            if (entry.ip && !macMap.get(mac).ips.includes(entry.ip)) {
              macMap.get(mac).ips.push(entry.ip);
            }
          });
          
          // Convert map to array with combined labels
          this.arpEntries = Array.from(macMap.values()).map(item => {
            const ipList = item.ips.join(", ");
            return {
              mac: item.mac,
              ip: item.ips[0], // Keep first IP for backward compatibility
              label: `${item.mac} (${ipList})`
            };
          });
        }
      } catch (error) {
        console.error("Error loading ARP entries:", error);
        this.arpEntries = [];
      }
    },
  }));
}

// Register the component - supports both normal and dynamic loading
if (typeof Alpine !== 'undefined' && Alpine.version) {
  // Alpine is already initialized (dynamic loading), register immediately
  registerNetworkSettings();
} else {
  // Alpine not yet initialized (normal page load), wait for the event
  document.addEventListener("alpine:init", registerNetworkSettings);
}