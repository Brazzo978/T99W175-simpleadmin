(function () {
  const modal = document.getElementById("remoteConfigModal");
  const form = document.getElementById("remoteConfigForm");
  const statusBox = modal ? modal.querySelector("[data-remote-config-status]") : null;
  const badge = document.getElementById("remoteConnectionBadge");
  const testButton = document.getElementById("remoteConfigTest");

  if (!modal || !form || !statusBox) {
    return;
  }

  const fields = {
    host: form.querySelector("[name=host]"),
    ssh_port: form.querySelector("[name=ssh_port]"),
    username: form.querySelector("[name=username]"),
    password: form.querySelector("[name=password]"),
    interface: form.querySelector("[name=interface]"),
    at_command_tool: form.querySelector("[name=at_command_tool]"),
    at_command_args: form.querySelector("[name=at_command_args]"),
  };

  function setStatus(message, type = "") {
    statusBox.textContent = message || "";
    statusBox.className = "mt-3";
    if (message) {
      statusBox.classList.add("alert", `alert-${type || "info"}`);
    }
  }

  function updateBadge(config) {
    if (!badge) {
      return;
    }

    if (config.host) {
      const portInfo = config.ssh_port && Number(config.ssh_port) !== 22 ? `:${config.ssh_port}` : "";
      badge.textContent = `Remote: ${config.host}${portInfo}`;
      badge.classList.remove("text-bg-secondary");
      badge.classList.add("text-bg-success");
    } else {
      badge.textContent = "Remote: not configured";
      badge.classList.remove("text-bg-success");
      badge.classList.add("text-bg-secondary");
    }
  }

  async function loadConfig() {
    try {
      const response = await fetch("/cgi-bin/remote_config");
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      if (!data || !data.config) {
        return;
      }
      const config = data.config;
      Object.entries(fields).forEach(([key, input]) => {
        if (!input) {
          return;
        }
        if (key === "password") {
          input.value = "";
          input.placeholder = config.password ? "Stored password will be kept" : "";
        } else if (config[key] !== undefined && config[key] !== null) {
          input.value = config[key];
        }
      });
      updateBadge(config);
    } catch (error) {
      console.error("Unable to load the remote configuration:", error);
      setStatus("Unable to load the saved configuration.", "danger");
    }
  }

  async function submitConfig(event) {
    event.preventDefault();
    setStatus("");

    const payload = {};
    Object.entries(fields).forEach(([key, input]) => {
      if (!input) {
        return;
      }
      const value = input.value.trim();
      if (value) {
        payload[key] = value;
      } else if (key === "password") {
        payload[key] = "***";
      }
    });

    try {
      const response = await fetch("/cgi-bin/remote_config", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || `HTTP ${response.status}`);
      }

      setStatus(data.message || "Configuration saved.", "success");
      await loadConfig();
    } catch (error) {
      console.error("Unable to save the remote configuration:", error);
      setStatus(error.message || "Unable to save the configuration.", "danger");
    }
  }

  async function testConnection() {
    setStatus("Testing remote connection...", "info");
    try {
      const response = await fetch("/cgi-bin/remote_status");
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || `HTTP ${response.status}`);
      }
      setStatus(data.message || "Connection OK", "success");
    } catch (error) {
      console.error("Remote connection test failed:", error);
      setStatus(error.message || "Connection test failed.", "danger");
    }
  }

  form.addEventListener("submit", submitConfig);
  modal.addEventListener("show.bs.modal", () => {
    setStatus("");
    loadConfig();
  });
  if (testButton) {
    testButton.addEventListener("click", testConnection);
  }

  document.addEventListener("DOMContentLoaded", loadConfig);
})();
