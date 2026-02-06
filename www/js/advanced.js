/**
 * Advanced settings management for T99W175 modem.
 *
 * Provides Alpine.js component for managing advanced modem settings including:
 * - AT command terminal interface
 * - TTL (Time To Live) override configuration
 * - Device reboot functionality
 * - AT command profile reset
 *
 * @module advanced
 * @requires Alpine.js
 * @requires atcommand-utils.js
 */

/**
 * Alpine.js component for advanced settings page.
 *
 * Manages AT command execution, TTL override settings, and device reboot operations.
 * Provides a terminal-like interface for sending custom AT commands and viewing responses.
 *
 * @returns {Object} Alpine.js component data object
 */
function simpleSettings() {
return {
    // Loading state indicator for async operations
    isLoading: false,
    // Success message display flag
    showSuccess: false,
    // Error message display flag
    showError: false,
    // Clean state flag (no command output displayed)
    isClean: true,
    // Reboot confirmation modal visibility
    showModal: false,
    // Device rebooting state
    isRebooting: false,
    // Current AT command input value
    atcmd: "",
    // AT command for fetching current settings
    fetchATCommand: "",
    // Reboot countdown timer value
    countdown: 0,
    // AT command response output
    atCommandResponse: "",
    // Current settings response output
    currentSettingsResponse: "",
    // Error message text
    errorMessage: "",
    // TTL data from server
    ttldata: null,
    // Current TTL value
    ttlvalue: 0,
    // TTL override enabled status
    ttlStatus: false,
    // New TTL value to set
    newTTL: null,
    // IP Passthrough mode selection (deprecated/unused)
    ipPassMode: "Unspecified",
    // IP Passthrough status (deprecated/unused)
    ipPassStatus: false,
    // USB network mode selection (deprecated/unused)
    usbNetMode: "Unspecified",
    // Current USB network mode (deprecated/unused)
    currentUsbNetMode: "Unknown",
    // DNS proxy status (deprecated/unused)
    DNSProxyStatus: true,
    // Factory reset confirmation modal visibility
    showFactoryResetModal: false,
    // Factory reset support flag (not available on current modem backend)
    factoryResetSupported: false,
    // Factory reset in progress state
    isFactoryResetting: false,
    // Factory reset countdown timer value
    resetCountdown: 60,

    /**
     * Closes the reboot confirmation modal.
     *
     * Resets modal visibility flags to hide the dialog.
     */
    closeModal() {
    this.confirmModal = false;
    this.showModal = false;
    },

    /**
     * Displays the reboot confirmation modal.
     *
     * Sets the modal visibility flag to show the confirmation dialog.
     */
    showRebootModal() {
    this.showModal = true;
    },

    /**
     * Handles AT command execution errors.
     *
     * Displays error message and optionally captures response data.
     * Logs error to console and resets loading state.
     *
     * @param {string} message - Error message to display
     * @param {string} [data=""] - Optional response data to capture
     */
    handleAtError(message, data = "") {
    this.errorMessage = message;
    this.showError = true;
    if (data) {
        this.atCommandResponse = data;
    }
    this.isLoading = false;
    console.error("AT command error:", message);
    },

    /**
     * Executes an AT command via the ATCommandService.
     *
     * Sends the current AT command to the modem with retry logic.
     * Uses "ATI" as default if no command is specified.
     * Updates the response display on success or shows error on failure.
     *
     * @async
     * @returns {Promise<void>}
     */
    async sendATCommand() {
    if (!this.atcmd) {
        // Use ATI as default command
        this.atcmd = "ATI";
        console.log(
        "AT Command is empty, using ATI as default command: ",
        this.atcmd
        );
    }
    this.isLoading = true;

    try {
        const result = await ATCommandService.execute(this.atcmd, {
        retries: 3,
        timeout: 12000,
        });

        if (!result.ok) {
        const message = result.error
            ? result.error.message
            : "Unknown error while executing the command.";
        this.handleAtError(message, result.data);
        return;
        }

        this.atCommandResponse = result.data;
        this.showError = false;
        this.isClean = false;
    } catch (error) {
        this.handleAtError(
        error.message || "Network error while executing the command."
        );
    } finally {
        this.isLoading = false;
    }
    },

    /**
     * Executes a user AT command via the user_atcommand CGI endpoint.
     *
     * Sends the current AT command using the user_atcommand CGI script,
     * which strips ANSI escape sequences for cleaner terminal output.
     * Displays the formatted response or error message.
     *
     * @async
     * @returns {Promise<void>}
     */
    async sendUserATCommand() {
    this.isLoading = true;
    const encodedATCmd = encodeURIComponent(this.atcmd);
    const url = `/cgi-bin/user_atcommand?atcmd=${encodedATCmd}`;

    try {
        const response = await fetch(url);

        if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        if (data.success) {
        // Display output directly (already formatted)
        this.atCommandResponse = data.output;
        this.showError = false;
        this.isClean = false;
        } else {
        // Show error message
        this.atCommandResponse = `ERROR: ${data.message}`;
        this.showError = true;
        }

    } catch (error) {
        this.handleAtError(
        error.message || "Network error while executing the custom command."
        );
    } finally {
        this.isLoading = false;
    }
    },

    /**
     * Clears the AT command response display.
     *
     * Resets the command output area and returns to clean state.
     */
    clearResponses() {
    this.atCommandResponse = "";
    this.isClean = true;
    },

    /**
     * Reboots the modem device.
     *
     * Sends AT+CFUN=1,1 command to reset the modem functionality.
     * Initiates a 40-second countdown timer and reinitializes on completion.
     * Clears response display and shows rebooting state.
     */
    rebootDevice() {
    this.atcmd = "AT+CFUN=1,1";
    this.sendATCommand();

    this.atCommandResponse = "";
    this.showModal = false;
    this.isRebooting = true;
    this.countdown = 40;

    // Do the countdown
    const interval = setInterval(() => {
        this.countdown--;
        if (this.countdown === 0) {
        clearInterval(interval);
        this.isRebooting = false;
        this.init();
        }
    }, 1000);
    },

    /**
     * Resets AT command profile to factory defaults.
     *
     * Sends AT&F command to restore default AT command profile.
     * Clears command output and prompts user to reboot device.
     */
    resetATCommands() {
    this.atcmd = "AT&F";
    this.sendATCommand();
    console.log("Resetting AT Commands");
    this.atcmd = "";
    this.atCommandResponse = "";
    this.showRebootModal();
    },

    // NOTE: The following functions are commented out as they are deprecated or unused.
    // They are kept for reference purposes in case they are needed in the future.
    // - ipPassThroughEnable/disable: IP Passthrough configuration
    // - onBoardDNSProxyEnable/disable: DNS proxy configuration
    // - usbNetModeChanger: USB network mode configuration
    // - fetchCurrentSettings: Fetch current network settings

    /**
     * Fetches current TTL override status and value.
     *
     * Queries the get_ttl_status CGI endpoint to retrieve TTL configuration.
     * Updates ttldata, ttlStatus, and ttlvalue properties with response data.
     */
    fetchTTL() {
    fetch("/cgi-bin/get_ttl_status")
        .then((res) => res.json())
        .then((data) => {
        this.ttldata = data;
        this.ttlStatus = this.ttldata.isEnabled;
        this.ttlvalue = this.ttldata.ttl;
        });
    },

    /**
     * Sets new TTL override value.
     *
     * Sends new TTL value to set_ttl CGI endpoint.
     * Refreshes TTL status after update and handles loading state.
     */
    setTTL() {
    this.isLoading = true; // Set loading state while updating TTL
    const ttlval = this.newTTL;
    fetch(
        "/cgi-bin/set_ttl?" + new URLSearchParams({ ttlvalue: ttlval })
    )
        .then((res) => res.text()) // Use res.text() instead of res.json()
        .then((data) => {
        // Manually handle the response data
        console.log("Response from server:", data);
        // You can try to parse the JSON manually or handle the response as needed

        // Once TTL is updated, fetch the updated TTL data
        this.fetchTTL();
        this.isLoading = false; // Set loading state back to false
        })
        .catch((error) => {
        console.error("Error updating TTL: ", error);
        this.isLoading = false; // Ensure loading state is properly handled in case of error
        });
    },

    /**
     * Shows the factory reset confirmation modal.
     *
     * Sets showFactoryResetModal flag to display the warning dialog.
     */
    openFactoryResetModal() {
      if (!this.factoryResetSupported) {
        this.showError = true;
        this.errorMessage = "Factory reset non supportato su questo modem.";
        return;
      }
      this.showFactoryResetModal = true;
    },

    /**
     * Closes the factory reset confirmation modal.
     *
     * Resets modal visibility flag to hide the dialog.
     */
    closeFactoryResetModal() {
      this.showFactoryResetModal = false;
    },

    /**
     * Performs the factory reset operation.
     *
     * Sends request to factory_reset CGI endpoint to reset device to factory defaults.
     * Shows progress modal and handles success/error responses.
     * The device will automatically reboot after successful reset.
     */
    performFactoryReset() {
      if (!this.factoryResetSupported) {
        this.showError = true;
        this.errorMessage = "Factory reset non supportato su questo modem.";
        return;
      }
      this.showFactoryResetModal = false;
      this.isFactoryResetting = true;
      this.resetCountdown = 60;

      fetch('/cgi-bin/factory_reset', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      })
      .then(res => res.json())
      .then(data => {
        if (data.status === 'success') {
          console.log('Factory reset initiated:', data.message);
          // Start countdown timer
          const countdownInterval = setInterval(() => {
            this.resetCountdown--;
            if (this.resetCountdown <= 0) {
              clearInterval(countdownInterval);
              // Redirect to stock IP
              window.location.href = 'http://192.168.225.1';
            }
          }, 1000);
        } else {
          console.error('Factory reset failed:', data.message);
          this.isFactoryResetting = false;
          alert('Factory reset failed: ' + data.message);
        }
      })
      .catch(error => {
        console.error('Error performing factory reset:', error);
        this.isFactoryResetting = false;
        alert('Error performing factory reset: ' + error);
      });
    },

    /**
     * Initializes the advanced settings component.
     *
     * Loads initial TTL configuration on component mount.
     * Note: fetchCurrentSettings is disabled as those features are deprecated.
     */
    init() {
    //this.fetchCurrentSettings();
    this.fetchTTL();
    },
};
}
