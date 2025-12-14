function esimManager() {
  return {
    loading: true,
    enabled: false,
    baseUrl: "",
    fallbackBaseUrl: "",
    eid: null,
    profiles: [],
    notifications: [],
    serverHealthy: null,
    alert: { type: "", message: "" },
    downloadLoading: false,
    downloadForm: {
      smdp: "",
      matching_id: "",
      confirmation_code: "",
      auto_confirm: true,
    },
    nicknameModal: {
      iccid: "",
      nickname: "",
      currentNickname: "",
    },
    init() {
      this.bootstrap();
    },
    async bootstrap() {
      if (this._bootstrapped) {
        console.debug("[eSIM] Bootstrap already executed, skipping.");
        return;
      }
      this._bootstrapped = true;

      this.loading = true;
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
        this.loading = false;
        return;
      }

      await this.checkHealth();
      await this.refreshAll();
      this.loading = false;
    },
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
    clearAlert() {
      this.alert.type = "";
      this.alert.message = "";
      if (this._alertTimeout) {
        clearTimeout(this._alertTimeout);
        this._alertTimeout = null;
      }
    },
    apiHeaders() {
      return {
        "Content-Type": "application/json",
      };
    },
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
    async refreshAll() {
      try {
        await this.loadProfiles();
        await this.sleep(500);
        await this.loadNotifications();
      } catch (error) {
        console.error(error);
        this.setAlert("danger", "Error while refreshing eSIM data.", false);
      }
    },
    sleep(ms) {
      return new Promise(resolve => setTimeout(resolve, ms));
    },
    async loadEid() {
      const payload = await this.apiFetch("/eid", { cache: "no-store" });
      this.eid = payload?.data?.eid || null;
    },
    async loadProfiles() {
      const payload = await this.apiFetch("/profiles", { cache: "no-store" });
      this.profiles = payload?.data?.profiles || [];
    },
    async loadNotifications() {
      const payload = await this.apiFetch("/notifications", { cache: "no-store" });
      this.notifications = payload?.data?.notifications || [];
    },
    profileStateLabel(value) {
      const labels = {
        0: "Unknown/Disabled",
        1: "Enabled",
        2: "Disabled",
      };
      return labels[value] || "Unknown";
    },
    profileClassLabel(value) {
      const labels = {
        0: "Unknown",
        1: "Test",
        2: "Operational",
      };
      return labels[value] || "Unknown";
    },
    getUniqueNotificationIccids() {
      const iccids = new Set();
      this.notifications.forEach(notification => {
        if (notification.iccid) {
          iccids.add(notification.iccid);
        }
      });
      return Array.from(iccids).sort();
    },
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

    openNicknameModal(profile) {
      this.nicknameModal.iccid = profile.iccid;
      this.nicknameModal.nickname = profile.profile_nickname || "";
      this.nicknameModal.currentNickname = profile.profile_nickname || "";
      
      const modalEl = document.getElementById('nicknameModal');
      const modal = new bootstrap.Modal(modalEl);
      modal.show();
    },

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