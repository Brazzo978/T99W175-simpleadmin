/**
 * Connection Monitor Page Component
 *
 * Alpine.js component for managing network monitoring configuration.
 * Handles connection testing setup including ping targets and DNS test servers.
 * Provides functionality to load, save, and validate monitoring settings.
 *
 * @module monitor
 * @requires Alpine.js
 */

/**
 * Creates and returns the monitor page Alpine.js component.
 *
 * Manages the connection monitoring configuration interface, allowing users
 * to configure ping targets and DNS test servers for network health monitoring.
 *
 * @returns {Object} Alpine.js component object with reactive data and methods
 */
function monitorPage() {
  return {
    /**
     * Connection configuration form data.
     * @type {Object}
     * @property {string} pingTargets - Comma-separated list of hosts/IPs to ping
     * @property {string} dnsTests - Comma-separated list of DNS servers to test
     */
    connectionConfigForm: {
      pingTargets: '',
      dnsTests: ''
    },

    /**
     * Indicates whether a save operation is in progress.
     * @type {boolean}
     */
    connectionConfigSaving: false,

    /**
     * Success message to display after saving configuration.
     * @type {string}
     */
    connectionConfigSuccessMessage: '',

    /**
     * Error message to display on failure.
     * @type {string}
     */
    connectionConfigErrorMessage: '',

    /**
     * Initializes the component by loading the current configuration.
     * Called automatically by Alpine.js when the component is mounted.
     */
    init() {
      this.fetchConnectionConfig();
    },

    /**
     * Fetches the current connection monitoring configuration from the server.
     *
     * Loads ping targets and DNS test servers from the CGI backend.
     * Updates the form data or displays an error message if the fetch fails.
     *
     * @async
     */
    async fetchConnectionConfig() {
      try {
        const response = await fetch('/cgi-bin/get_connection_config');

        // Check for HTTP errors
        if (!response.ok) {
          throw new Error('Failed to fetch connection configuration');
        }

        const data = await response.json();

        // Update form if server returned success
        if (data.status === 'success') {
          this.connectionConfigForm.pingTargets = data.pingTargets || '';
          this.connectionConfigForm.dnsTests = data.dnsTests || '';
        } else {
          // Display server-provided error message
          this.connectionConfigErrorMessage = data.message || 'Failed to load configuration';
        }
      } catch (error) {
        console.error('Error fetching connection config:', error);
        this.connectionConfigErrorMessage = 'Error loading configuration: ' + error.message;
      }
    },

    /**
     * Saves the connection monitoring configuration to the server.
     *
     * Sends the current form data (ping targets and DNS tests) to the CGI backend.
     * Displays a success message that auto-dismisses after 3 seconds, or an error
     * message if the save operation fails.
     *
     * @async
     */
    async saveConnectionConfig() {
      // Set loading state
      this.connectionConfigSaving = true;
      this.connectionConfigSuccessMessage = '';
      this.connectionConfigErrorMessage = '';

      try {
        // Send configuration to server
        const response = await fetch('/cgi-bin/set_connection_config', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            pingTargets: this.connectionConfigForm.pingTargets,
            dnsTests: this.connectionConfigForm.dnsTests
          })
        });

        // Check for HTTP errors
        if (!response.ok) {
          throw new Error('Failed to save connection configuration');
        }

        const data = await response.json();

        // Handle response
        if (data.status === 'success') {
          // Show success message and auto-dismiss after 3 seconds
          this.connectionConfigSuccessMessage = 'Configuration saved successfully!';
          // Return success status for modal handling
          this._lastSaveSuccess = true;
          setTimeout(() => {
            this.connectionConfigSuccessMessage = '';
          }, 3000);
        } else {
          // Display server-provided error message
          this.connectionConfigErrorMessage = data.message || 'Failed to save configuration';
          this._lastSaveSuccess = false;
        }
      } catch (error) {
        console.error('Error saving connection config:', error);
        this.connectionConfigErrorMessage = 'Error saving configuration: ' + error.message;
        this._lastSaveSuccess = false;
      } finally {
        // Always clear loading state
        this.connectionConfigSaving = false;
      }
    },

    /**
     * Saves the connection configuration and returns to connection details modal on success.
     *
     * Calls saveConnectionConfig() and if successful, closes the monitoring modal
     * and reopens the connection details modal.
     */
    async saveAndReturn() {
      await this.saveConnectionConfig();
      if (this._lastSaveSuccess) {
        setTimeout(() => {
          const monitoringModal = bootstrap.Modal.getInstance(document.getElementById('monitoringConfigModal'));
          if (monitoringModal) {
            monitoringModal.hide();
            setTimeout(() => {
              const connectionModal = new bootstrap.Modal(document.getElementById('connectionModal'));
              connectionModal.show();
            }, 300);
          }
        }, 500);
      }
    },

    /**
     * Closes the monitoring configuration modal and opens the connection details modal.
     * Used by the "Close" button in the monitoring modal footer.
     */
    closeAndOpenConnection() {
      const monitoringModalEl = document.getElementById('monitoringConfigModal');
      const monitoringModal = bootstrap.Modal.getInstance(monitoringModalEl);
      if (monitoringModal) {
        monitoringModal.hide();
        setTimeout(() => {
          const connectionModalEl = document.getElementById('connectionModal');
          const connectionModal = new bootstrap.Modal(connectionModalEl);
          connectionModal.show();
        }, 300);
      }
    },

    /**
     * Closes the connection details modal and opens the monitoring configuration modal.
     * Used by the button in the connection modal header.
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
    }
  };
}
