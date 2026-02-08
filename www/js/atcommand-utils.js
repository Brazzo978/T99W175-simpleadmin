/**
 * AT Command Execution Service
 *
 * Provides robust AT command execution with automatic retries, timeout handling,
 * and busy state detection. Integrates with the server-side AT command handler
 * that performs its own retry logic.
 *
 * @module atcommand-utils
 * @requires window
 */

(function (global) {
  // Configuration constants
  const DEFAULT_TIMEOUT = 10000;  // 10 seconds default timeout
  const DEFAULT_RETRIES = 2;      // Number of client-side retry attempts
  const BUSY_PATTERNS = [/busy/i, /in use/i, /locked/i, /not available/i];

  /**
   * Sanitizes an AT command by trimming whitespace.
   *
   * @param {string} atcmd - The AT command to sanitize
   * @returns {string} Trimmed command or empty string if invalid
   */
  function sanitize(atcmd) {
    if (typeof atcmd !== "string") {
      return "";
    }
    return atcmd.trim();
  }

  /**
   * Splits text into lines, trimming whitespace and filtering empty lines.
   *
   * @param {string} text - The text to split
   * @returns {string[]} Array of non-empty trimmed lines
   */
  function splitLines(text) {
    if (typeof text !== "string") {
      return [];
    }
    return text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  }

  /**
   * Removes an echoed AT command from the response if present.
   *
   * @param {string} text - Raw response text
   * @param {string} command - AT command that may be echoed
   * @returns {string} Response without the echoed command line
   */
  function stripEchoedCommand(text, command) {
    if (typeof text !== "string") {
      return "";
    }
    if (typeof command !== "string" || !command.trim()) {
      return text;
    }
    const normalizedCommand = command.trim();
    const lines = text.split(/\r?\n/);
    while (lines.length && lines[0].trim() === "") {
      lines.shift();
    }
    if (lines.length && lines[0].trim() === normalizedCommand) {
      lines.shift();
    }
    return lines.join("\n").trim();
  }

  /**
   * Checks if response text indicates the modem is busy.
   *
   * @param {string} text - The response text to check
   * @returns {boolean} True if any busy pattern matches
   */
  function isBusyResponse(text) {
    if (!text) {
      return false;
    }
    return BUSY_PATTERNS.some((pattern) => pattern.test(text));
  }

  /**
   * Creates a delay promise for the specified milliseconds.
   *
   * @param {number} ms - Milliseconds to delay
   * @returns {Promise<void>} Promise that resolves after the delay
   */
  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Creates a standardized result object.
   *
   * @param {boolean} ok - Whether the operation succeeded
   * @param {string} data - The response data
   * @param {Error|null} error - Error object if failed
   * @param {Object} meta - Additional metadata
   * @returns {Object} Result object with ok, data, error, and metadata
   */
  function createResult(ok, data, error, meta = {}) {
    return {
      ok,
      data,
      error: error || null,
      ...meta,
    };
  }

  /**
   * Executes an AT command with automatic retry and timeout handling.
   *
   * The server performs up to 5 retry attempts with exponential backoff.
   * This client performs additional retries if the server reports busy state.
   *
   * @param {string} atcmd - The AT command to execute
   * @param {Object} [options={}] - Execution options
   * @param {number} [options.retries] - Number of client-side retries (default: 2)
   * @param {number} [options.timeout] - Request timeout in milliseconds (default: 10000)
   * @param {string} [options.endpoint] - CGI endpoint path (default: "/cgi-bin/get_atcommand")
   * @returns {Promise<Object>} Result object with:
   *   - ok: boolean - True if command succeeded
   *   - data: string - Command output
   *   - error: Error|null - Error object if failed
   *   - busy: boolean - True if modem is busy
   *   - attempts: number - Total attempts made
   *   - command: string - The executed command
   */
  async function execute(atcmd, options = {}) {
    let adaptedCommand = atcmd;
    const adapter = global.ModemLogicAdapter;

    if (adapter && typeof adapter.adaptCommand === "function") {
      const adaptation = adapter.adaptCommand(atcmd);
      if (adaptation && adaptation.supported === false) {
        return createResult(false, "", new Error(adaptation.message || "AT command not supported."), {
          busy: false,
          attempts: 0,
          command: atcmd,
          logic: adapter.logic,
        });
      }
      if (adaptation && typeof adaptation.command === "string") {
        adaptedCommand = adaptation.command;
      }
    }

    const sanitized = sanitize(adaptedCommand);

    if (!sanitized) {
      return createResult(false, "", new Error("Empty or invalid AT command."), {
        busy: false,
        attempts: 0,
        logic: adapter?.logic,
      });
    }

    const retries = Number.isInteger(options.retries) && options.retries >= 0
      ? options.retries
      : DEFAULT_RETRIES;
    const timeout = typeof options.timeout === "number" && options.timeout > 0
      ? options.timeout
      : DEFAULT_TIMEOUT;
    const endpoint = typeof options.endpoint === "string" && options.endpoint.trim() !== ""
      ? options.endpoint.trim()
      : "/cgi-bin/get_atcommand";

    let clientAttempt = 0;
    let lastError = null;
    let lastData = "";
    let busy = false;

    while (clientAttempt <= retries) {
      clientAttempt += 1;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);

      try {
        const response = await fetch(
          `${endpoint}?${new URLSearchParams({ atcmd: sanitized })}`,
          { signal: controller.signal }
        );

        clearTimeout(timer);

        if (!response.ok) {
          lastError = new Error(`HTTP ${response.status}`);
          continue;
        }

        const bodyText = await response.text();
        let json = null;
        try {
          json = JSON.parse(bodyText);
        } catch (error) {
          json = null;
        }

        if (!json || typeof json !== "object") {
          const rawOutput = bodyText || "";
          const normalizedOutput = adapter?.normalizeResponse
            ? adapter.normalizeResponse(rawOutput, { command: sanitized, endpoint })
            : rawOutput;

          const hasErrorToken = /\bERROR\b/i.test(normalizedOutput);
          return createResult(
            !hasErrorToken,
            normalizedOutput,
            hasErrorToken ? new Error("The modem returned ERROR.") : null,
            {
              busy: isBusyResponse(normalizedOutput),
              attempts: 1,
              command: sanitized,
              logic: adapter?.logic,
            }
          );
        }
        
        // The server already handles retries (5 attempts), so we use server's attempt count
        const serverAttempts = json.attempts || 1;
        
        if (json.success) {
          const rawOutput = json.output || "";
          lastData = adapter?.normalizeResponse
            ? adapter.normalizeResponse(rawOutput, { command: sanitized, endpoint })
            : rawOutput;
          
          // Check if output contains ERROR token (modem-level error)
          const hasErrorToken = json.has_error || false;
          
          return createResult(
            !hasErrorToken, 
            lastData, 
            hasErrorToken ? new Error("The modem returned ERROR.") : null, 
            {
              busy: false,
              attempts: serverAttempts,
              command: json.command,
              logic: adapter?.logic,
            }
          );
        } else {
          // Server reported failure
          lastData = json.output || "";
          busy = json.busy || false;
          
          if (busy) {
            lastError = new Error(json.message || "The modem is busy. Try again later.");
          } else {
            lastError = new Error(json.message || "Command execution failed.");
          }
          
          // If server already retried and failed, respect that
          if (serverAttempts >= 5 || !busy) {
            return createResult(false, lastData, lastError, {
              busy,
              attempts: serverAttempts,
              command: json.command,
            });
          }
        }

      } catch (error) {
        clearTimeout(timer);
        
        if (error.name === "AbortError") {
          lastError = new Error("AT request timed out.");
        } else {
          lastError = error;
        }
      }

      // Client-side retry with backoff
      if (clientAttempt <= retries) {
        await delay(Math.min(2000, 500 * clientAttempt));
      }
    }

    return createResult(false, lastData, lastError, {
      busy,
      attempts: clientAttempt,
    });
  }

  // Export service to global scope
  global.ATCommandService = {
    execute,
    splitLines,
    delay,
    sanitize,
    isBusyResponse,
  };
})(window);
