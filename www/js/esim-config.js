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
          return { enabled: false, base_url: "" };
        }
        const payload = await response.json();
        if (!payload || payload.success !== true) {
          return { enabled: false, base_url: "" };
        }
        return payload.data || { enabled: false, base_url: "" };
      })
      .catch(() => ({ enabled: false, base_url: "" }));

    return cachePromise;
  }

  return {
    loadConfig,
  };
})();
