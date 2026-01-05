/**
 * eSIM Navigation Item Visibility Controller
 *
 * Conditionally displays the eSIM navigation item based on configuration.
 * Reads the eSIM feature flag from the server config and shows/hides the nav item.
 *
 * @module index-esim
 * @requires EsimConfig
 */

document.addEventListener("DOMContentLoaded", () => {
  // Exit if required module is missing
  if (typeof EsimConfig === "undefined") {
    return;
  }

  // Load eSIM configuration and conditionally show/hide nav items
  EsimConfig.loadConfig().then((config) => {
    const enabled =
      config && (config.enabled === 1 || config.enabled === "1" || config.enabled === true);

    // Hide/show ESIM menu item
    const esimMenuItem = document.getElementById("esimMenuItem");
    if (esimMenuItem) {
      esimMenuItem.style.display = enabled ? "list-item" : "none";
    }

    // Update divider visibility based on both menu items
    // Use setTimeout to allow other scripts to run first
    if (typeof updateConfigMenuDivider === "function") {
      setTimeout(updateConfigMenuDivider, 0);
    }
  });
});