function monitorPage() {
  return {
    connectionConfigForm: {
      pingTargets: '',
      dnsTests: ''
    },
    watchdogForm: {
      enabled: false,
      failCount: 3,
      checkInterval: 10,
      pingTimeoutMs: 5000,
      action: 'cfun',
      bootGrace: 600
    },
    connectionConfigSaving: false,
    connectionConfigSuccessMessage: '',
    connectionConfigErrorMessage: '',
    watchdogLogText: 'Loading watchdog log...',
    watchdogLogFile: '/tmp/connection-watchdog.log',
    watchdogLogLoading: false,
    watchdogLogAutoRefresh: null,

    init() {
      this.fetchConnectionConfig();
      this.fetchWatchdogConfig();

      const logModalEl = document.getElementById('watchdogLogModal');
      if (logModalEl) {
        logModalEl.addEventListener('show.bs.modal', () => {
          this.fetchWatchdogLog();
          this.startWatchdogLogAutoRefresh();
        });

        logModalEl.addEventListener('hidden.bs.modal', () => {
          this.stopWatchdogLogAutoRefresh();
        });
      }
    },

    validateWatchdogForm() {
      if (!Number.isInteger(this.watchdogForm.failCount) || this.watchdogForm.failCount < 1 || this.watchdogForm.failCount > 60) {
        return 'Failure attempts must be between 1 and 60.';
      }
      if (!Number.isInteger(this.watchdogForm.checkInterval) || this.watchdogForm.checkInterval < 5 || this.watchdogForm.checkInterval > 3600) {
        return 'Check interval must be between 5 and 3600 seconds.';
      }
      if (!Number.isInteger(this.watchdogForm.pingTimeoutMs) || this.watchdogForm.pingTimeoutMs < 100 || this.watchdogForm.pingTimeoutMs > 30000) {
        return 'Ping timeout must be between 100 and 30000 milliseconds.';
      }
      if (!Number.isInteger(this.watchdogForm.bootGrace) || this.watchdogForm.bootGrace < 0 || this.watchdogForm.bootGrace > 3600) {
        return 'Boot grace must be between 0 and 3600 seconds.';
      }
      return '';
    },

    async fetchConnectionConfig() {
      try {
        const response = await fetch('/cgi-bin/get_connection_config');
        if (!response.ok) {
          throw new Error('Failed to fetch connection configuration');
        }

        const data = await response.json();
        if (data.status === 'success') {
          this.connectionConfigForm.pingTargets = data.pingTargets || '';
          this.connectionConfigForm.dnsTests = data.dnsTests || '';
        } else {
          this.connectionConfigErrorMessage = data.message || 'Failed to load configuration';
        }
      } catch (error) {
        console.error('Error fetching connection config:', error);
        this.connectionConfigErrorMessage = 'Error loading configuration: ' + error.message;
      }
    },

    async fetchWatchdogConfig() {
      try {
        const response = await fetch('/cgi-bin/connection_watchdog');
        if (!response.ok) {
          throw new Error('Failed to fetch watchdog configuration');
        }

        const data = await response.json();
        if (!data.success) {
          throw new Error(data.message || 'Failed to load watchdog configuration');
        }

        this.watchdogForm.enabled = Boolean(data.enabled);
        this.watchdogForm.failCount = Number(data.failCount || 3);
        this.watchdogForm.checkInterval = Number(data.checkInterval || 10);
        this.watchdogForm.pingTimeoutMs = Number(data.pingTimeoutMs || 5000);
        this.watchdogForm.action = data.action === 'reboot' ? 'reboot' : 'cfun';
        this.watchdogForm.bootGrace = Number(data.bootGrace ?? 600);
        this.watchdogLogFile = data.logFile || this.watchdogLogFile;
      } catch (error) {
        console.error('Error fetching watchdog config:', error);
        this.connectionConfigErrorMessage = 'Error loading watchdog config: ' + error.message;
      }
    },

    async saveConnectionConfig() {
      this.connectionConfigSaving = true;
      this.connectionConfigSuccessMessage = '';
      this.connectionConfigErrorMessage = '';

      const validationError = this.validateWatchdogForm();
      if (validationError) {
        this.connectionConfigErrorMessage = validationError;
        this.connectionConfigSaving = false;
        this._lastSaveSuccess = false;
        return;
      }

      try {
        const monitorResp = await fetch('/cgi-bin/set_connection_config', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            pingTargets: this.connectionConfigForm.pingTargets,
            dnsTests: this.connectionConfigForm.dnsTests
          })
        });

        if (!monitorResp.ok) {
          throw new Error('Failed to save connection monitoring configuration');
        }

        const monitorData = await monitorResp.json();
        if (monitorData.status !== 'success') {
          throw new Error(monitorData.message || 'Failed to save connection monitoring configuration');
        }

        const watchdogResp = await fetch('/cgi-bin/connection_watchdog', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            enabled: this.watchdogForm.enabled,
            targets: this.connectionConfigForm.pingTargets,
            failCount: this.watchdogForm.failCount,
            checkInterval: this.watchdogForm.checkInterval,
            pingTimeoutMs: this.watchdogForm.pingTimeoutMs,
            action: this.watchdogForm.action,
            bootGrace: this.watchdogForm.bootGrace
          })
        });

        if (!watchdogResp.ok) {
          throw new Error('Failed to save watchdog configuration');
        }

        const watchdogData = await watchdogResp.json();
        if (!watchdogData.success) {
          throw new Error(watchdogData.message || 'Failed to save watchdog configuration');
        }

        this.watchdogForm.enabled = Boolean(watchdogData.enabled);
        this.watchdogLogFile = watchdogData.logFile || this.watchdogLogFile;

        this.connectionConfigSuccessMessage = this.watchdogForm.enabled
          ? 'Connection monitoring and watchdog configuration saved.'
          : 'Connection monitoring saved, watchdog is disabled.';

        this._lastSaveSuccess = true;
      } catch (error) {
        console.error('Error saving config:', error);
        this.connectionConfigErrorMessage = 'Error saving configuration: ' + error.message;
        this._lastSaveSuccess = false;
      } finally {
        this.connectionConfigSaving = false;
      }
    },

    async fetchWatchdogLog() {
      this.watchdogLogLoading = true;
      try {
        const response = await fetch('/cgi-bin/get_watchdog_log?lines=120');
        if (!response.ok) {
          throw new Error('Failed to fetch watchdog log');
        }

        const data = await response.json();
        if (!data.success) {
          throw new Error(data.message || 'Failed to fetch watchdog log');
        }

        this.watchdogLogText = data.content || 'Log is currently empty.';
        this.watchdogLogFile = data.logFile || this.watchdogLogFile;
      } catch (error) {
        console.error('Error loading watchdog log:', error);
        this.watchdogLogText = 'Unable to load watchdog log: ' + error.message;
      } finally {
        this.watchdogLogLoading = false;
      }
    },

    startWatchdogLogAutoRefresh() {
      this.stopWatchdogLogAutoRefresh();
      this.watchdogLogAutoRefresh = setInterval(() => {
        this.fetchWatchdogLog();
      }, 3000);
    },

    stopWatchdogLogAutoRefresh() {
      if (this.watchdogLogAutoRefresh) {
        clearInterval(this.watchdogLogAutoRefresh);
        this.watchdogLogAutoRefresh = null;
      }
    },

    openWatchdogLogModal() {
      const modal = new bootstrap.Modal(document.getElementById('watchdogLogModal'));
      modal.show();
    },

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
        }, 300);
      }
    },

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
