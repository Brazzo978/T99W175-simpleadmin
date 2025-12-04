document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("loginForm");
  const alertBox = document.getElementById("loginAlert");
  const submitButton = document.getElementById("loginSubmit");

  function showAlert(message, type = "danger") {
    if (!alertBox) {
      return;
    }
    alertBox.textContent = message;
    alertBox.className = `alert alert-${type}`;
    alertBox.classList.remove("d-none");
  }

  if (typeof SimpleAdminAuth !== "undefined") {
    SimpleAdminAuth.ensureSession().then((session) => {
      if (session) {
        window.location.replace("/index.html");
      }
    });
  }

  if (!form) {
    return;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (alertBox) {
      alertBox.classList.add("d-none");
    }

    const formData = new FormData(form);
    const username = formData.get("username");
    const password = formData.get("password");

    if (!username || !password) {
      showAlert("Enter username and password.");
      return;
    }

    if (submitButton) {
      submitButton.disabled = true;
    }

    try {
      const response = await fetch("/cgi-bin/authenticate", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ username, password }),
      });

      const payload = await response.json().catch(() => ({ success: false }));

      if (!response.ok || !payload.success) {
        showAlert(payload.message || "Invalid credentials.");
        return;
      }

      window.location.replace("/index.html");
    } catch (error) {
      console.error("Login failed", error);
      showAlert("Error during authentication.");
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
      }
    }
  });
});
