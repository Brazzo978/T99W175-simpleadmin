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
    downloadForm: {
      smdp: "",
      matching_id: "",
      confirmation_code: "",
      auto_confirm: true,
    },
    nicknameForm: {
      iccid: "",
      nickname: "",
    },
    init() {
      this.bootstrap();
    },
    async bootstrap() {
      if (this._bootstrapped) {
        console.debug("[eSIM] Bootstrap già eseguito, skip.");
        return;
      }
      this._bootstrapped = true;

      this.loading = true;
      this.clearAlert();
      console.debug("[eSIM] Avvio bootstrap gestione eSIM...");

      const config = await EsimConfig.loadConfig();
      this.enabled = config.enabled === 1 || config.enabled === "1" || config.enabled === true;

      // Calcola subito il fallback
      const configBaseUrl = (config.base_url || "").replace(/\/+$/, "");
      this.fallbackBaseUrl = this.computeFallbackBaseUrl(configBaseUrl);

      // Se l'URL configurato è localhost, usa direttamente il fallback
      try {
        const url = new URL(configBaseUrl);
        if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
          console.debug("[eSIM] Rilevato localhost, utilizzo direttamente il fallback");
          this.baseUrl = this.fallbackBaseUrl;
        } else {
          this.baseUrl = configBaseUrl;
        }
      } catch (error) {
        this.baseUrl = configBaseUrl;
      }

      console.debug("[eSIM] Configurazione caricata", {
        enabled: this.enabled,
        baseUrl: this.baseUrl,
        fallbackBaseUrl: this.fallbackBaseUrl,
      });

      if (!this.enabled) {
        this.setAlert(
          "warning",
          "La gestione eSIM è disabilitata. Abilitala in config/simpleadmin.conf per procedere."
        );
        this.loading = false;
        return;
      }

      await this.checkHealth();
      await this.refreshAll();
      this.loading = false;
    },
    setAlert(type, message) {
      this.alert.type = type;
      this.alert.message = message;
    },
    clearAlert() {
      this.alert.type = "";
      this.alert.message = "";
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
          console.debug("[eSIM] Utilizzo fallback base URL", url.toString());
          return url.toString().replace(/\/+$/, "");
        }
      } catch (error) {
        console.debug("[eSIM] Impossibile calcolare fallback base URL", error);
      }
      return "";
    },
    async apiFetch(path, options = {}) {
      if (!this.enabled) {
        throw new Error("ESIM disabled");
      }

      const baseUrlsToTry = [this.baseUrl];
      if (this.fallbackBaseUrl && this.fallbackBaseUrl !== this.baseUrl) {
        baseUrlsToTry.push(this.fallbackBaseUrl);
      }

      let lastError;
      for (const baseUrl of baseUrlsToTry) {
        try {
          console.debug(`[eSIM] Richiesta API`, { baseUrl, path });
          const response = await fetch(`${baseUrl}${path}`, {
            ...options,
            headers: {
              ...this.apiHeaders(),
              ...(options.headers || {}),
            },
          });

          if (!response.ok) {
            const text = await response.text();
            throw new Error(text || `Richiesta fallita (${response.status})`);
          }

          if (baseUrl !== this.baseUrl) {
            console.debug("[eSIM] Switch verso fallback base URL", baseUrl);
            this.baseUrl = baseUrl;
          }

          return response.json();
        } catch (error) {
          console.error(`[eSIM] Errore durante la chiamata a ${baseUrl}${path}`, error);
          lastError = error;
        }
      }

      throw lastError || new Error("Impossibile completare la richiesta eSIM.");
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
            "Server online ma eSIM non disponibile. Verifica il modulo eSIM."
          );
          console.debug("[eSIM] Server online - eSIM ERROR");
        }
      } catch (error) {
        console.error(error);
        this.serverHealthy = false;
        this.setAlert(
          "danger",
          "Server offline. Verifica che euicc-client sia in esecuzione."
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
        this.setAlert("danger", "Errore durante l'aggiornamento dei dati eSIM.");
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
    parseLpaQrCode(qrText) {
      // Formato: LPA:1$smdp.server.com$MATCHING_ID[$CONFIRMATION_CODE]
      const lpaRegex = /^LPA:1\$([^$]+)\$([^$]+)(?:\$([^$]+))?$/;
      const match = qrText.match(lpaRegex);

      if (!match) {
        throw new Error("Formato QR code non valido. Formato atteso: LPA:1$server$id[$code]");
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
        this.setAlert("warning", "Per favore carica un'immagine valida.");
        event.target.value = '';
        return;
      }

      // Verifica che jsQR sia caricato
      if (typeof jsQR === 'undefined') {
        this.setAlert("danger", "Libreria jsQR non caricata. Ricarica la pagina e riprova.");
        event.target.value = '';
        return;
      }

      try {
        const imageData = await this.readImageFile(file);
        const qrCode = jsQR(imageData.data, imageData.width, imageData.height);

        if (!qrCode) {
          this.setAlert("danger", "Nessun QR code trovato nell'immagine.");
          event.target.value = '';
          return;
        }

        console.debug("[eSIM] QR code decodificato:", qrCode.data);

        const lpaData = this.parseLpaQrCode(qrCode.data);

        // Forza l'aggiornamento dei campi in modo reattivo
        this.downloadForm = {
          ...this.downloadForm,
          smdp: lpaData.smdp,
          matching_id: lpaData.matching_id,
          confirmation_code: lpaData.confirmation_code
        };

        this.setAlert("success", "QR code letto con successo! Campi compilati automaticamente.");

        console.debug("[eSIM] Campi aggiornati:", this.downloadForm);

        // Reset input file
        event.target.value = '';
      } catch (error) {
        console.error("[eSIM] Errore lettura QR code:", error);
        this.setAlert("danger", `Errore: ${error.message}`);
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

          img.onerror = () => reject(new Error("Impossibile caricare l'immagine"));
          img.src = e.target.result;
        };

        reader.onerror = () => reject(new Error("Impossibile leggere il file"));
        reader.readAsDataURL(file);
      });
    },
    async enableProfile(iccid) {
      try {
        await this.apiFetch("/profile/enable", {
          method: "POST",
          body: JSON.stringify({ iccid }),
        });
        this.setAlert("success", `Profilo ${iccid} abilitato con successo.`);
        await this.loadProfiles();
      } catch (error) {
        console.error(error);
        this.setAlert("danger", `Errore durante l'abilitazione del profilo: ${error.message}`);
      }
    },
    async disableProfile(iccid) {
      try {
        await this.apiFetch("/profile/disable", {
          method: "POST",
          body: JSON.stringify({ iccid }),
        });
        this.setAlert("success", `Profilo ${iccid} disabilitato con successo.`);
        await this.loadProfiles();
      } catch (error) {
        console.error(error);
        this.setAlert("danger", `Errore durante la disabilitazione del profilo: ${error.message}`);
      }
    },
    async deleteProfile(iccid) {
      if (!confirm(`Confermi l'eliminazione del profilo ${iccid}?`)) {
        return;
      }
      try {
        await this.apiFetch("/profile/delete", {
          method: "POST",
          body: JSON.stringify({ iccid }),
        });
        this.setAlert("success", `Profilo ${iccid} eliminato.`);
        await this.refreshAll();
      } catch (error) {
        console.error(error);
        this.setAlert("danger", `Errore durante l'eliminazione: ${error.message}`);
      }
    },
    async setNickname() {
      if (!this.nicknameForm.iccid) {
        this.setAlert("warning", "Seleziona un ICCID per impostare il nickname.");
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
        this.setAlert("success", "Nickname aggiornato.");
        this.nicknameForm.nickname = "";
        await this.loadProfiles();
      } catch (error) {
        console.error(error);
        this.setAlert("danger", `Errore durante il salvataggio del nickname: ${error.message}`);
      }
    },
    async downloadProfile() {
      if (!this.downloadForm.smdp || !this.downloadForm.matching_id) {
        this.setAlert("warning", "Compila SMDP e Matching ID per scaricare il profilo.");
        return;
      }
      const body = { ...this.downloadForm };
      if (!body.confirmation_code) {
        delete body.confirmation_code;
      }
      try {
        await this.apiFetch("/download", {
          method: "POST",
          body: JSON.stringify(body),
        });
        this.setAlert("success", "Download profilo avviato.");
        this.downloadForm.confirmation_code = "";
        await this.refreshAll();
      } catch (error) {
        console.error(error);
        this.setAlert("danger", `Errore durante il download: ${error.message}`);
      }
    },
  async processSingleNotification(iccid, sequenceNumber) {
    try {
      const response = await this.apiFetch("/notifications/process", {
        method: "POST",
        body: JSON.stringify({
          iccid: iccid,
          sequence_number: sequenceNumber,
          process_all: false
        }),
      });
      const processedCount = response?.processed_count ?? 0;
      this.setAlert("success", `Notifica #${sequenceNumber} processata.`);
      await this.loadNotifications();
    } catch (error) {
      console.error(error);
      this.setAlert("danger", `Errore durante l'elaborazione: ${error.message}`);
    }
  },
  async removeSingleNotification(iccid, sequenceNumber) {
    try {
      const response = await this.apiFetch("/notifications/remove", {
        method: "POST",
        body: JSON.stringify({
          iccid: iccid,
          sequence_number: sequenceNumber
        }),
      });
      this.setAlert("success", `Notifica #${sequenceNumber} rimossa.`);
      await this.loadNotifications();
    } catch (error) {
      console.error(error);
      this.setAlert("danger", `Errore durante la rimozione: ${error.message}`);
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
      this.setAlert("success", `Notifica #${sequenceNumber} processata e rimossa.`);
      await this.loadNotifications();
    } catch (error) {
      console.error(error);
      this.setAlert("danger", `Errore: ${error.message}`);
    }
  },
  async processAllNotifications() {
    if (!confirm('Confermi di voler processare tutte le notifiche?')) {
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
      this.setAlert("success", `Tutte le notifiche processate: ${totalProcessed}.`);
      await this.loadNotifications();
    } catch (error) {
      console.error(error);
      this.setAlert("danger", `Errore durante l'elaborazione: ${error.message}`);
    }
  },
  async removeAllNotifications() {
    if (!confirm('Confermi di voler rimuovere TUTTE le notifiche?')) {
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
      this.setAlert("success", `Tutte le notifiche rimosse: ${removedCount}.`);
      await this.loadNotifications();
    } catch (error) {
      console.error(error);
      this.setAlert("danger", `Errore durante la rimozione: ${error.message}`);
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
