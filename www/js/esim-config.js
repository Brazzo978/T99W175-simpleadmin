const EsimConfig = (() => {
  let cachePromise = null;

  async function loadConfig() {
    if (cachePromise) {
      return cachePromise;
    }

    cachePromise = fetch("/cgi-bin/esim_config", {
      credentials: "include",
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) {
          console.debug("[eSIM] Configurazione eSIM non disponibile (response non OK)");
          return { enabled: false, base_url: "" };
        }
        const payload = await response.json();
        if (!payload || payload.success !== true) {
          console.debug("[eSIM] Configurazione eSIM risposta non valida", payload);
          return { enabled: false, base_url: "" };
        }
        return payload.data || { enabled: false, base_url: "" };
      })
      .catch((error) => {
        console.debug("[eSIM] Errore durante il recupero della configurazione eSIM", error);
        return { enabled: false, base_url: "" };
      });

    return cachePromise;
  }

  return {
    loadConfig,
  };
})();
