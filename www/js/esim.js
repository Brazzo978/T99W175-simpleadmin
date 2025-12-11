document.addEventListener("alpine:init", () => {
  Alpine.data("esimManager", () => ({
    loading: true,
    enabled: false,
    baseUrl: "",
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
    processForm: {
      iccid: "",
      process_all: true,
      sequence_number: "",
    },
    removeForm: {
      remove_all: true,
      iccid: "",
      sequence_number: "",
    },
    init() {
      this.bootstrap();
    },
    async bootstrap() {
      this.loading = true;
      this.clearAlert();
      const config = await EsimConfig.loadConfig();
      this.enabled = config.enabled === 1 || config.enabled === "1" || config.enabled === true;
      this.baseUrl = (config.base_url || "").replace(/\/+$/, "");
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
    async apiFetch(path, options = {}) {
      if (!this.enabled) {
        throw new Error("ESIM disabled");
      }

      const response = await fetch(`${this.baseUrl}${path}`, {
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

      return response.json();
    },
    async checkHealth() {
      try {
        const payload = await this.apiFetch("/health", { cache: "no-store" });
        this.serverHealthy = payload?.success === true;
      } catch (error) {
        console.error(error);
        this.serverHealthy = false;
        this.setAlert(
          "danger",
          "Impossibile contattare il server eSIM. Verifica che euicc-client sia in esecuzione."
        );
      }
    },
    async refreshAll() {
      try {
        await Promise.all([this.loadEid(), this.loadProfiles(), this.loadNotifications()]);
      } catch (error) {
        console.error(error);
        this.setAlert("danger", "Errore durante l'aggiornamento dei dati eSIM.");
      }
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
    async processNotifications() {
      if (!this.processForm.iccid) {
        this.setAlert("warning", "Inserisci l'ICCID per processare le notifiche.");
        return;
      }
      const payload = {
        iccid: this.processForm.iccid,
        process_all: this.processForm.process_all,
      };
      const sequence = Number.parseInt(this.processForm.sequence_number, 10);
      if (!this.processForm.process_all && !Number.isNaN(sequence)) {
        payload.sequence_number = sequence;
      }
      try {
        const response = await this.apiFetch("/notifications/process", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        const processedCount = response?.processed_count ?? 0;
        this.setAlert("success", `Notifiche elaborate: ${processedCount}.`);
        await this.loadNotifications();
      } catch (error) {
        console.error(error);
        this.setAlert("danger", `Errore durante l'elaborazione: ${error.message}`);
      }
    },
    async removeNotifications() {
      const payload = {};
      if (this.removeForm.remove_all) {
        payload.remove_all = true;
      }
      if (this.removeForm.iccid) {
        payload.iccid = this.removeForm.iccid;
      }
      const sequence = Number.parseInt(this.removeForm.sequence_number, 10);
      if (!Number.isNaN(sequence)) {
        payload.sequence_number = sequence;
      }
      try {
        const response = await this.apiFetch("/notifications/remove", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        const removedCount = response?.removed_count ?? 0;
        this.setAlert("success", `Notifiche rimosse: ${removedCount}.`);
        await this.loadNotifications();
      } catch (error) {
        console.error(error);
        this.setAlert("danger", `Errore durante la rimozione: ${error.message}`);
      }
    },
  }));
});
