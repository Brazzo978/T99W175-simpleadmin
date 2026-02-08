/**
 * Login Configuration Manager
 *
 * Provides centralized loading and caching of login configuration from the server.
 * Uses promise caching to avoid redundant fetch requests within the same session.
 *
 * @module login-config
 */

const LoginConfig = (() => {
  let cachePromise = null;

  /**
   * Loads login configuration from the server.
   *
   * Caches the promise to prevent multiple simultaneous requests.
   * Returns a default enabled configuration if the endpoint fails or returns invalid data.
   *
   * @returns {Promise<{enabled: boolean}>} Configuration object with:
   *   - enabled: Whether login functionality is enabled
   *
   * On error, returns { enabled: true } (default to enabled for security)
   */
  async function loadConfig() {
    // Return cached promise if available
    if (cachePromise) {
      return cachePromise;
    }

    // Fetch configuration from server
    cachePromise = fetch("/cgi-bin/login_config", {
      credentials: "include",
      cache: "no-store",
    })
      .then(async (response) => {
        // Handle HTTP errors
        if (!response.ok) {
          console.debug("[Login] Login configuration not available (response not OK)");
          const defaultConfig = { enabled: true }; // Default to enabled for security
          sessionStorage.setItem("simpleadmin_login_enabled", JSON.stringify(defaultConfig));
          return defaultConfig;
        }
        const payload = await response.json();

        // Validate response structure
        if (!payload || payload.success !== true) {
          console.debug("[Login] Login configuration response not valid", payload);
          const defaultConfig = { enabled: true }; // Default to enabled for security
          sessionStorage.setItem("simpleadmin_login_enabled", JSON.stringify(defaultConfig));
          return defaultConfig;
        }
        const config = payload.data || { enabled: true };
        // Store in sessionStorage for immediate access on next page load
        sessionStorage.setItem("simpleadmin_login_enabled", JSON.stringify(config));
        return config;
      })
      .catch((error) => {
        console.debug("[Login] Error during login configuration retrieve", error);
        const defaultConfig = { enabled: true }; // Default to enabled for security
        sessionStorage.setItem("simpleadmin_login_enabled", JSON.stringify(defaultConfig));
        return defaultConfig;
      });

    return cachePromise;
  }

  /**
   * Gets login configuration from sessionStorage if available.
   * Returns null if not found in sessionStorage.
   *
   * @returns {{enabled: boolean}|null} Configuration object or null
   */
  function getCachedConfig() {
    try {
      const cached = sessionStorage.getItem("simpleadmin_login_enabled");
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (e) {
      console.debug("[Login] Error reading cached config", e);
    }
    return null;
  }

  return {
    loadConfig,
    getCachedConfig,
  };
})();
