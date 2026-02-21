(function() {
  const APP_VERSION = "Simple 502-1.0.1-RC1";

  function applyVersion() {
    document.querySelectorAll('[data-app-version]').forEach((el) => {
      el.textContent = APP_VERSION;
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", applyVersion);
  } else {
    applyVersion();
  }
})();
