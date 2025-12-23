document.addEventListener("alpine:init", () => {
  Alpine.data("networkSettings", () => ({
    isLoading: false,
    isSaving: false,
    loadError: "",
    successMessage: "",
    restartMessage: "",
    restartStatusClass: "alert-info",
    validationErrors: [],
    dhcpRangeEdited: false,
    originalData: null,
    ttlSaving: false,
    ttlSuccessMessage: "",
    ttlErrorMessage: "",
    rebootSaving: false,
    rebootSuccessMessage: "",
    rebootErrorMessage: "",
    rebootSchedule: "",
    rebootForm: {
      enabled: false,
      mode: "interval",
      intervalHours: 24,
      frequency: "daily",
      dayOfWeek: "3",
      dayOfMonth: 1,
      time: "00:00",
    },
    currentTtlSettings: {
      enabled: false,
      value: 0,
    },
    maskOptions: [
      { value: "255.255.255.0", label: "/24 (255.255.255.0)" },
      { value: "255.255.255.128", label: "/25 (255.255.255.128)" },
      { value: "255.255.255.192", label: "/26 (255.255.255.192)" },
      { value: "255.255.255.224", label: "/27 (255.255.255.224)" },
      { value: "255.255.255.240", label: "/28 (255.255.255.240)" },
      { value: "255.255.255.248", label: "/29 (255.255.255.248)" },
      { value: "255.255.255.252", label: "/30 (255.255.255.252)" },
    ],
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
      ttlEnabled: false,
      ttlValue: null,
    },
    async init() {
      await this.fetchConfiguration();
      await this.fetchTtlSettings();
      await this.loadRebootSchedule();
    },
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
      this.form.ttlEnabled = this.currentTtlSettings.enabled;
      this.form.ttlValue = this.currentTtlSettings.enabled ? this.currentTtlSettings.value : null;
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
    async applyTtlImmediately() {
      this.ttlSuccessMessage = "";
      this.ttlErrorMessage = "";

      if (!this.form.ttlEnabled) {
        const confirmed = window.confirm(
          "Are you sure you want to disable Custom TTL?"
        );
        if (!confirmed) {
          this.form.ttlEnabled = true;
          return;
        }
      }

      if (this.form.ttlEnabled) {
        if (!this.form.ttlValue || this.form.ttlValue === 0) {
          this.form.ttlValue = 64;
        }

        if (this.form.ttlValue < 1 || this.form.ttlValue > 255) {
          this.ttlErrorMessage = "TTL value must be between 1 and 255.";
          return;
        }
      }

      this.ttlSaving = true;

      try {
        const ttlValue = this.form.ttlEnabled ? this.form.ttlValue : 0;
        
        const response = await fetch(
          "/cgi-bin/set_ttl?" + new URLSearchParams({ ttlvalue: ttlValue })
        );
        
        if (!response.ok) {
          throw new Error("Failed to save TTL settings");
        }
        
        const result = await response.text();
        console.log("TTL applied:", { 
          enabled: this.form.ttlEnabled, 
          value: ttlValue,
          response: result 
        });
        
        this.currentTtlSettings.enabled = this.form.ttlEnabled;
        this.currentTtlSettings.value = ttlValue;
        
        if (this.originalData) {
          this.originalData.ttlEnabled = this.form.ttlEnabled;
          this.originalData.ttlValue = this.form.ttlValue;
        }

        this.ttlSuccessMessage = this.form.ttlEnabled 
          ? `Custom TTL enabled with value ${ttlValue}. Applied immediately.`
          : "Custom TTL disabled. Applied immediately.";
        
        setTimeout(() => {
          this.ttlSuccessMessage = "";
        }, 5000);

      } catch (error) {
        console.error("Error applying TTL:", error);
        this.ttlErrorMessage = "Failed to apply TTL settings. Please try again.";
      } finally {
        this.ttlSaving = false;
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
    async fetchTtlSettings() {
      try {
        const response = await fetch("/cgi-bin/get_ttl_status");
        if (!response.ok) {
          throw new Error("Failed to fetch TTL settings");
        }
        
        const data = await response.json();
        this.currentTtlSettings.enabled = data.isEnabled || false;
        this.currentTtlSettings.value = data.ttl || 0;
        
        this.form.ttlEnabled = this.currentTtlSettings.enabled;
        this.form.ttlValue = this.currentTtlSettings.enabled ? this.currentTtlSettings.value : null;
        
        console.log("TTL settings loaded:", this.currentTtlSettings);
      } catch (error) {
        console.error("Error loading TTL settings:", error);
        this.currentTtlSettings.enabled = false;
        this.currentTtlSettings.value = 0;
        this.form.ttlEnabled = false;
        this.form.ttlValue = null;
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
        
        // Disabilita il reboot cancellando lo schedule
        await this.clearRebootSchedule();
        return;
      }

      // Validazione
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

      if (!this.validateForm()) {
        return;
      }

      if (
        this.form.bridgeEnabled &&
        this.originalData &&
        !this.originalData.bridgeEnabled
      ) {
        const confirmed = window.confirm(
          "Enabling bridge mode will route the public IP directly to the selected client. This may make it harder to access the router interface because it will remain on the LAN subnet. Continue?"
        );
        if (!confirmed) {
          return;
        }
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

        this.successMessage = payload.message || "Network configuration updated.";
        await this.handleRestart();
        await this.fetchConfiguration(false);
        await this.fetchTtlSettings();
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
    async handleRestart() {
      try {
        const result = await ATCommandService.execute("AT+CFUN=1,1", {
          endpoint: "/cgi-bin/user_atcommand",
          retries: 0,
          timeout: 20000,
        });

        if (result.ok) {
          this.restartStatusClass = "alert-info";
          this.restartMessage = "Modem restart command sent. Please wait for the connection to resume.";
        } else {
          const reason = result.error && result.error.message ? result.error.message : "unknown error";
          this.restartStatusClass = "alert-warning";
          this.restartMessage = `Configuration saved but the modem restart failed: ${reason}`;
        }
      } catch (error) {
        console.error("Unable to restart the modem", error);
        this.restartStatusClass = "alert-warning";
        this.restartMessage =
          error && error.message
            ? `Configuration saved but the modem restart failed: ${error.message}`
            : "Configuration saved but the modem restart failed.";
      }
    },
  }));
});