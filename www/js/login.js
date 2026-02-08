/**
 * Login Page Controller
 *
 * Handles user authentication, form submission, and post-login redirect.
 * Integrates with SimpleAdminAuth for session management and route restoration.
 *
 * @module login
 * @requires SimpleAdminAuth
 */

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("loginForm");
  const alertBox = document.getElementById("loginAlert");
  const submitButton = document.getElementById("loginSubmit");

  /**
   * Displays an alert message to the user.
   *
   * @param {string} message - The message to display
   * @param {string} [type="danger"] - Alert type (danger, success, warning, info)
   */
  function showAlert(message, type = "danger") {
    if (!alertBox) {
      return;
    }
    alertBox.textContent = message;
    alertBox.className = `alert alert-${type}`;
    alertBox.classList.remove("d-none");
  }

  // Check if user is already authenticated
  if (typeof SimpleAdminAuth !== "undefined") {
    SimpleAdminAuth.ensureSession().then((session) => {
      if (session) {
        // Already logged in, redirect to intended page or dashboard
        window.location.replace("/index.html");
        setTimeout(() => {
          SimpleAdminAuth.restorePostLoginRoute();
        }, 100);
      }
    });
  }

  // Exit if login form doesn't exist
  if (!form) {
    return;
  }

  /**
   * Handles form submission for user authentication.
   *
   * Validates credentials, sends authentication request to server,
   * and redirects on success. Shows error messages on failure.
   */
  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    // Hide previous alerts
    if (alertBox) {
      alertBox.classList.add("d-none");
    }

    // Extract form data
    const formData = new FormData(form);
    const username = formData.get("username");
    const password = formData.get("password");

    // Validate input
    if (!username || !password) {
      showAlert("Enter username and password.");
      return;
    }

    // Disable submit button to prevent double submission
    if (submitButton) {
      submitButton.disabled = true;
    }

    try {
      // Send authentication request
      const response = await fetch("/cgi-bin/authenticate", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ username, password }),
      });

      const payload = await response.json().catch(() => ({ success: false }));

      // Handle authentication failure
      if (!response.ok || !payload.success) {
        showAlert(payload.message || "Invalid credentials.");
        return;
      }

      // Login successful - redirect to index, then restore route
      window.location.replace("/index.html");
      setTimeout(() => {
        if (typeof SimpleAdminAuth !== "undefined" && SimpleAdminAuth.restorePostLoginRoute) {
          SimpleAdminAuth.restorePostLoginRoute();
        }
      }, 100);
    } catch (error) {
      console.error("Login failed", error);
      showAlert("Error during authentication.");
    } finally {
      // Re-enable submit button
      if (submitButton) {
        submitButton.disabled = false;
      }
    }
  });
});
