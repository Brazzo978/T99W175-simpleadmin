/**
 * Login UI Visibility Controller
 *
 * Conditionally displays/hides login-related UI elements based on configuration.
 * Reads the login feature flag from the server config and shows/hides:
 * - Username/avatar section
 * - Logout buttons (mobile and desktop)
 * - Users menu item
 *
 * @module index-login
 * @requires LoginConfig
 */

/**
 * Applies login UI visibility based on enabled state.
 * This function can be called immediately (before DOMContentLoaded) or after.
 *
 * @param {boolean} enabled - Whether login is enabled
 */
function applyLoginVisibility(enabled) {
  // Hide/show username section (desktop)
  const userSection = document.querySelector(".navbar-user-section");
  if (userSection) {
    userSection.style.display = enabled ? "flex" : "none";
  }

  // Hide/show username avatar
  const userAvatar = document.getElementById("userAvatar");
  if (userAvatar) {
    userAvatar.style.display = enabled ? "block" : "none";
  }

  // Hide/show username text
  const userName = document.getElementById("navUserName");
  if (userName) {
    userName.style.display = enabled ? "inline" : "none";
  }

  // Hide/show logout button (desktop)
  const logoutDesktop = document.getElementById("logoutButtonDesktop");
  if (logoutDesktop) {
    logoutDesktop.style.display = enabled ? "block" : "none";
  }

  // Hide/show logout button (mobile)
  const logoutMobile = document.getElementById("logoutButtonMobile");
  if (logoutMobile) {
    logoutMobile.style.display = enabled ? "block" : "none";
  }

  // Hide/show logout link (mobile, alternative)
  const logoutLink = document.getElementById("logoutButton");
  if (logoutLink) {
    logoutLink.style.display = enabled ? "block" : "none";
  }

  // Hide/show Users menu item
  const usersMenuItem = document.getElementById("usersMenuItem");
  if (usersMenuItem) {
    usersMenuItem.style.display = enabled ? "list-item" : "none";
  }

  // Update divider visibility based on both menu items
  // Use setTimeout to allow other scripts to run first
  setTimeout(updateConfigMenuDivider, 0);
}

// Apply cached config immediately if available (before DOMContentLoaded)
(function() {
  try {
    const cached = sessionStorage.getItem("simpleadmin_login_enabled");
    if (cached) {
      const config = JSON.parse(cached);
      const enabled = config && (config.enabled === 1 || config.enabled === "1" || config.enabled === true);
      // Apply immediately when DOM is ready (or wait for it)
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => applyLoginVisibility(enabled));
      } else {
        applyLoginVisibility(enabled);
      }
    }
  } catch (e) {
    console.debug("[Login] Error applying cached config", e);
  }
})();

document.addEventListener("DOMContentLoaded", () => {
  // Exit if required module is missing
  if (typeof LoginConfig === "undefined") {
    return;
  }

  // Load login configuration and conditionally show/hide UI elements
  LoginConfig.loadConfig().then((config) => {
    const enabled =
      config && (config.enabled === 1 || config.enabled === "1" || config.enabled === true);

    // Apply visibility (this will also update sessionStorage via login-config.js)
    applyLoginVisibility(enabled);
  });
});

/**
 * Updates the visibility of the configuration menu divider.
 * Hides the divider if both Users and eSIM menu items are hidden.
 */
function updateConfigMenuDivider() {
  const divider = document.getElementById("configMenuDivider");
  if (!divider) {
    return;
  }

  const usersMenuItem = document.getElementById("usersMenuItem");
  const esimMenuItem = document.getElementById("esimMenuItem");

  // Check if menu items are visible using computed style
  const usersVisible = usersMenuItem && 
    window.getComputedStyle(usersMenuItem).display !== "none";
  
  const esimVisible = esimMenuItem && 
    window.getComputedStyle(esimMenuItem).display !== "none";

  // Hide divider if both menu items are hidden
  divider.style.display = (usersVisible || esimVisible) ? "block" : "none";
}
