(function() {
  const APP_VERSION = "Simple T99-1.0.4";

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
