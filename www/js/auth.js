(function (global) {
  const state = {
    session: null,
    promise: null,
    loaded: false,
  };

  const callbacks = [];

  function requiresAuth() {
    const body = document.body;
    if (!body) {
      return true;
    }
    const attr = body.getAttribute("data-require-auth");
    if (!attr) {
      return true;
    }
    return attr !== "false";
  }

  async function fetchSession() {
    try {
      const response = await fetch("/cgi-bin/session_status", {
        credentials: "include",
        cache: "no-store",
      });

      if (response.status === 401) {
        return null;
      }

      if (!response.ok) {
        console.error("Unable to retrieve session status", response.status);
        return null;
      }

      const payload = await response.json();
      if (!payload || payload.authenticated !== true) {
        return null;
      }

      return {
        username: payload.username,
        role: payload.role,
      };
    } catch (error) {
      console.error("Session fetch failed", error);
      return null;
    }
  }

  function ensureSession({ refresh = false } = {}) {
    if (!refresh && state.promise) {
      return state.promise;
    }

    state.promise = fetchSession().then((session) => {
      state.session = session;
      state.loaded = true;
      callbacks.splice(0).forEach((cb) => {
        try {
          cb(session);
        } catch (error) {
          console.error("Error running auth callback", error);
        }
      });
      return session;
    });

    return state.promise;
  }

  function onReady(callback) {
    if (typeof callback !== "function") {
      return;
    }

    if (state.loaded) {
      callback(state.session);
    } else {
      callbacks.push(callback);
    }
  }

  function updateNav(session) {
    const nameEl = document.getElementById("navUserName");
    const roleEl = document.getElementById("navUserRole");

    if (nameEl) {
      nameEl.textContent = session ? session.username : "";
    }

    if (roleEl) {
      if (session) {
        const label = session.role === "admin" ? "Admin" : "User";
        roleEl.textContent = label;
        roleEl.classList.toggle("bg-danger-subtle", session.role === "admin");
        roleEl.classList.toggle("bg-primary-subtle", session.role !== "admin");
        roleEl.classList.remove("d-none");
      } else {
        roleEl.textContent = "";
        roleEl.classList.add("d-none");
      }
    }

    const manageLinks = document.querySelectorAll("[data-requires-admin='hide']");
    manageLinks.forEach((link) => {
      if (!session || session.role !== "admin") {
        link.classList.add("d-none");
      } else {
        link.classList.remove("d-none");
      }
    });
  }

  function disableElement(element) {
    const requirement = element.dataset.requiresAdmin || "";
    if (requirement === "hide") {
      element.classList.add("d-none");
      return;
    }

    if (element.tagName === "FORM") {
      element.classList.add("disabled");
      element.setAttribute("aria-disabled", "true");
      const controls = element.querySelectorAll(
        "input, select, textarea, button"
      );
      controls.forEach((control) => {
        if (control.dataset.allowUser === "true") {
          return;
        }
        if (!control.dataset.requiresAdmin) {
          control.setAttribute("data-requires-admin", "");
        }
        disableElement(control);
      });
      return;
    }

    if (element.tagName === "A") {
      element.classList.add("disabled");
      element.setAttribute("aria-disabled", "true");
      element.addEventListener("click", (event) => event.preventDefault());
      return;
    }

    if (element.tagName === "BUTTON") {
      element.disabled = true;
      element.classList.add("disabled");
      return;
    }

    if (element.tagName === "INPUT" || element.tagName === "TEXTAREA") {
      element.setAttribute("readonly", "readonly");
      element.classList.add("disabled");
      if (element.type !== "checkbox" && element.type !== "radio") {
        element.classList.add("pe-none");
      }
      return;
    }

    if (element.tagName === "SELECT") {
      element.disabled = true;
      element.classList.add("disabled");
      return;
    }

    element.setAttribute("aria-disabled", "true");
    element.classList.add("disabled");
    const descendants = element.querySelectorAll(
      "button, input, select, textarea, a"
    );
    descendants.forEach((child) => {
      if (child === element) {
        return;
      }
      if (child.dataset.allowUser === "true") {
        return;
      }
      if (!child.dataset.requiresAdmin) {
        child.setAttribute("data-requires-admin", "");
      }
      disableElement(child);
    });
  }

  function applyPermissions(session) {
    const html = document.documentElement;
    if (html) {
      html.setAttribute("data-user-role", session ? session.role : "guest");
    }

    updateNav(session);

    if (session && session.role === "admin") {
      return;
    }

    const adminElements = document.querySelectorAll("[data-requires-admin]");
    adminElements.forEach((element) => {
      disableElement(element);
    });
  }

  function redirectToLogin() {
    if (window.location.pathname.endsWith("/login.html")) {
      return;
    }
    window.location.replace("/login.html");
  }

  async function logout() {
    try {
      await fetch("/cgi-bin/logout", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
      });
    } catch (error) {
      console.error("Logout failed", error);
    } finally {
      state.session = null;
      state.promise = null;
      redirectToLogin();
    }
  }

  function handleLogoutButton() {
    const logoutButton = document.getElementById("logoutButton");
    if (!logoutButton) {
      return;
    }

    logoutButton.addEventListener("click", (event) => {
      event.preventDefault();
      logout();
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    handleLogoutButton();

    ensureSession();

    onReady((session) => {
      applyPermissions(session);
      if (requiresAuth() && !session) {
        redirectToLogin();
      }
    });
  });

  global.SimpleAdminAuth = {
    ensureSession,
    onReady,
    getSession() {
      return state.session;
    },
    hasWriteAccess() {
      return state.session && state.session.role === "admin";
    },
    async requireLogin() {
      const session = await ensureSession();
      if (!session) {
        redirectToLogin();
        return null;
      }
      return session;
    },
    async requireAdmin() {
      const session = await global.SimpleAdminAuth.requireLogin();
      if (!session) {
        return null;
      }
      if (session.role !== "admin") {
        window.location.replace("/index.html");
        return null;
      }
      return session;
    },
    logout,
  };
})(window);
