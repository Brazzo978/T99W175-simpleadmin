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
          console.debug("[eSIM] eSIM configuration not available (response not OK)");
          return { enabled: false, base_url: "" };
        }
        const payload = await response.json();
        if (!payload || payload.success !== true) {
          console.debug("[eSIM] eSIM configuration repsonse not valid", payload);
          return { enabled: false, base_url: "" };
        }
        return payload.data || { enabled: false, base_url: "" };
      })
      .catch((error) => {
        console.debug("[eSIM] Error during eSIM configuration retreive", error);
        return { enabled: false, base_url: "" };
      });

    return cachePromise;
  }

  return {
    loadConfig,
  };
})();
