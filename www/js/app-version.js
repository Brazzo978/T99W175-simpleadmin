(function() {
  const APP_VERSION = "Simple T99373-1.0.1B";
  const VERSION_CHECK_URL = "https://raw.githubusercontent.com/Brazzo978/T99W175-simpleadmin/Beta/VERSION.md";
  const UPDATE_TARGET_URL = "https://github.com/Brazzo978/T99W175-simpleadmin/blob/Beta/README.md";

  function createUpToDateBadge() {
    const badge = document.createElement("span");
    badge.className = "d-inline-flex align-items-center";
    badge.title = "Web UI is up to date";
    badge.setAttribute("aria-label", badge.title);
    badge.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14">
        <path d="M20 6 9 17l-5-5"/>
      </svg>
    `;
    return badge;
  }

  function createUpdateBadge(remoteVersion) {
    const link = document.createElement("a");
    link.className = "d-inline-flex align-items-center gap-1 text-danger text-decoration-none";
    link.href = UPDATE_TARGET_URL;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.title = `Update available: ${remoteVersion}. Open update page.`;
    link.setAttribute("aria-label", link.title);
    link.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14">
        <circle cx="12" cy="12" r="10"/>
        <path d="m15 9-6 6"/>
        <path d="m9 9 6 6"/>
      </svg>
      <span>${remoteVersion}</span>
    `;
    return link;
  }

  function renderVersion(state, remoteVersion) {
    document.querySelectorAll("[data-app-version]").forEach((el) => {
      el.textContent = "";

      const text = document.createElement("span");
      text.textContent = APP_VERSION;
      el.appendChild(text);

      if (state === "up-to-date") {
        el.appendChild(document.createTextNode(" "));
        el.appendChild(createUpToDateBadge());
      } else if (state === "update-available") {
        el.appendChild(document.createTextNode(" "));
        el.appendChild(createUpdateBadge(remoteVersion));
      }
    });
  }

  function extractRemoteVersion(text) {
    const match = text.match(/^- Current-Version:\s*`([^`]+)`/m);
    return match ? match[1].trim() : "";
  }

  async function checkRemoteVersion() {
    try {
      const response = await fetch(VERSION_CHECK_URL, { cache: "no-store" });
      if (!response.ok) {
        return;
      }

      const remoteText = await response.text();
      const remoteVersion = extractRemoteVersion(remoteText);
      if (!remoteVersion) {
        return;
      }

      renderVersion(
        remoteVersion === APP_VERSION ? "up-to-date" : "update-available",
        remoteVersion
      );
    } catch (error) {
      // Silent failure: local version should still render without warning badge.
    }
  }

  function applyVersion() {
    renderVersion("unknown", "");
    checkRemoteVersion();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", applyVersion);
  } else {
    applyVersion();
  }
})();
