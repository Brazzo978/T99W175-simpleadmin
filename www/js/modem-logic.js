/**
 * Modem Logic Configuration
 *
 * Loads the modem logic profile from the backend and exposes a global adapter
 * that can transform AT commands (or block them) based on the selected profile.
 */

const ModemLogicConfig = (() => {
  const STORAGE_KEY = "simpleadmin_modem_logic";
  let cachePromise = null;

  function normalizeLogic(value) {
    if (typeof value !== "string" || value.trim() === "") {
      return "default";
    }
    return value.trim().toLowerCase();
  }

  function getCachedLogic() {
    try {
      const cached = sessionStorage.getItem(STORAGE_KEY);
      if (cached) {
        return normalizeLogic(JSON.parse(cached).logic);
      }
    } catch (error) {
      console.debug("[ModemLogic] Unable to read cached logic", error);
    }
    return "default";
  }

  function cacheLogic(logic) {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ logic }));
    } catch (error) {
      console.debug("[ModemLogic] Unable to cache logic", error);
    }
  }

  async function loadConfig() {
    if (cachePromise) {
      return cachePromise;
    }

    cachePromise = fetch("/cgi-bin/get_connection_config", {
      credentials: "include",
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) {
          return { logic: getCachedLogic() };
        }
        const payload = await response.json();
        const logic = normalizeLogic(payload?.modemLogic);
        cacheLogic(logic);
        return { logic };
      })
      .catch((error) => {
        console.debug("[ModemLogic] Failed to load modem logic", error);
        return { logic: getCachedLogic() };
      });

    return cachePromise;
  }

  return {
    loadConfig,
    getCachedLogic,
  };
})();

const MODEM_LOGIC_PROFILES = {
  default: {
    adaptCommand: (atcmd) => ({ supported: true, command: atcmd }),
    normalizeResponse: (raw) => raw,
  },
  quectel: {
    adaptCommand: (atcmd) => ({
      supported: false,
      command: atcmd,
      message: "Quectel modem logic not mapped in the UI yet.",
    }),
    normalizeResponse: (raw) => raw,
  },
};

const ModemLogicAdapter = {
  logic: "default",
  resolveProfile() {
    return MODEM_LOGIC_PROFILES[this.logic] || MODEM_LOGIC_PROFILES.default;
  },
  adaptCommand(atcmd) {
    return this.resolveProfile().adaptCommand(atcmd);
  },
  normalizeResponse(raw, context = {}) {
    return this.resolveProfile().normalizeResponse(raw, context);
  },
};

ModemLogicConfig.loadConfig().then(({ logic }) => {
  ModemLogicAdapter.logic = logic;
});
