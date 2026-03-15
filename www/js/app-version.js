(function() {
  const APP_VERSION = "Simple T99-1.0.5Beta";
  const VERSION_CHECK_URL = "https://raw.githubusercontent.com/Brazzo978/T99W175-simpleadmin/Beta/VERSION.md";

  function createUpdateBadge(remoteVersion) {
    const badge = document.createElement("span");
    badge.className = "d-inline-flex align-items-center";
    badge.title = remoteVersion
      ? `Update available: ${remoteVersion}`
      : "Update available";
    badge.setAttribute("aria-label", badge.title);
    badge.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14" style="color: #d97706;">
        <path d="M12 3v12"/>
        <path d="m7 10 5 5 5-5"/>
        <path d="M5 21h14"/>
      </svg>
    `;
    return badge;
  }

  function renderVersion(updateAvailable, remoteVersion) {
    document.querySelectorAll("[data-app-version]").forEach((el) => {
      el.textContent = "";

      const text = document.createElement("span");
      text.textContent = APP_VERSION;
      el.appendChild(text);

      if (updateAvailable) {
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

      renderVersion(remoteVersion !== APP_VERSION, remoteVersion);
    } catch (error) {
      // Silent failure: local version should still render without warning badge.
    }
  }

  function applyVersion() {
    renderVersion(false, "");
    checkRemoteVersion();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", applyVersion);
  } else {
    applyVersion();
  }
})();
