/**
 * eSIM Configuration Manager
 *
 * Provides centralized loading and caching of eSIM configuration from the server.
 * Uses promise caching to avoid redundant fetch requests within the same session.
 *
 * @module esim-config
 */

const EsimConfig = (() => {
  let cachePromise = null;

  /**
   * Loads eSIM configuration from the server.
   *
   * Caches the promise to prevent multiple simultaneous requests.
   * Returns a default disabled configuration if the endpoint fails or returns invalid data.
   *
   * @returns {Promise<{enabled: boolean, base_url: string}>} Configuration object with:
   *   - enabled: Whether eSIM functionality is enabled
   *   - base_url: Base URL for eSIM API endpoints
   *
   * On error or disabled state, returns { enabled: false, base_url: "" }
   */
  async function loadConfig() {
    // Return cached promise if available
    if (cachePromise) {
      return cachePromise;
    }

    // Fetch configuration from server
    cachePromise = fetch("/cgi-bin/esim_config", {
      credentials: "include",
      cache: "no-store",
    })
      .then(async (response) => {
        // Handle HTTP errors
        if (!response.ok) {
          console.debug("[eSIM] eSIM configuration not available (response not OK)");
          return { enabled: false, base_url: "" };
        }
        const payload = await response.json();

        // Validate response structure
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
