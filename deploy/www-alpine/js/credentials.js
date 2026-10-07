/**
 * User Credentials Management Module
 *
 * Provides CRUD operations for user account management.
 * Handles user listing, addition, password updates, role changes, and deletion.
 * Requires admin privileges for all operations.
 *
 * @module credentials
 * @requires SimpleAdminAuth
 */

(function () {
  // API endpoints
  const endpoints = {
    list: "/cgi-bin/manage_credentials?action=list",
    manage: "/cgi-bin/manage_credentials",
  };

  // DOM element IDs
  const selectors = {
    tableBody: "usersTableBody",
    addForm: "addUserForm",
    updatePasswordForm: "updatePasswordForm",
    updateRoleForm: "updateRoleForm",
    deleteForm: "deleteUserForm",
    feedback: "credentialsAlert",
    passwordUserSelect: "passwordUserSelect",
    roleUserSelect: "roleUserSelect",
    deleteUserSelect: "deleteUserSelect",
  };

  /**
   * Displays a feedback message to the user.
   *
   * @param {string} message - The message to display
   * @param {string} [type="success"] - Alert type (success, danger, warning, info)
   */
  function showFeedback(message, type = "success") {
    const alertBox = document.getElementById(selectors.feedback);
    if (!alertBox) {
      return;
    }

    alertBox.textContent = message;
    alertBox.className = `alert alert-${type}`;
    alertBox.classList.remove("d-none");
  }

  /**
   * Hides the feedback alert box.
   */
  function clearFeedback() {
    const alertBox = document.getElementById(selectors.feedback);
    if (alertBox) {
      alertBox.classList.add("d-none");
    }
  }

  /**
   * Creates an option element for a user select dropdown.
   *
   * @param {Object} user - User object
   * @param {string} user.username - Username
   * @param {string} user.role - User role (admin or user)
   * @returns {HTMLOptionElement} Option element
   */
  function createOption(user) {
    const option = document.createElement("option");
    option.value = user.username;
    option.textContent = `${user.username} (${user.role})`;
    return option;
  }

  /**
   * Populates a select dropdown with user options.
   *
   * @param {string} selectId - ID of the select element
   * @param {Array<Object>} users - Array of user objects
   */
  function populateSelect(selectId, users) {
    const select = document.getElementById(selectId);
    if (!select) {
      return;
    }

    const currentValue = select.value;
    select.innerHTML = "";
    users.forEach((user) => {
      select.appendChild(createOption(user));
    });
    if (currentValue) {
      select.value = currentValue;
    }
  }

  /**
   * Updates the users table with the provided user list.
   *
   * @param {Array<Object>} users - Array of user objects
   */
  function updateTable(users) {
    const tbody = document.getElementById(selectors.tableBody);
    if (!tbody) {
      return;
    }

    // Display message if no users exist
    if (!Array.isArray(users) || users.length === 0) {
      tbody.innerHTML = '<tr><td colspan="2" class="text-center">No users configured.</td></tr>';
      return;
    }

    // Clear and populate table
    tbody.innerHTML = "";
    users.forEach((user) => {
      const row = document.createElement("tr");
      const usernameCell = document.createElement("td");
      usernameCell.textContent = user.username;
      const roleCell = document.createElement("td");
      roleCell.textContent = user.role === "admin" ? "Admin" : "User";
      row.appendChild(usernameCell);
      row.appendChild(roleCell);
      tbody.appendChild(row);
    });
  }

  /**
   * Loads users from the server and updates the UI.
   *
   * Fetches the user list and populates the table and all select dropdowns.
   */
  async function loadUsers() {
    try {
      const response = await fetch(endpoints.list, {
        credentials: "include",
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const payload = await response.json();
      if (!payload.success || !Array.isArray(payload.data)) {
        throw new Error("Invalid response format");
      }

      // Update all UI elements
      updateTable(payload.data);
      populateSelect(selectors.passwordUserSelect, payload.data);
      populateSelect(selectors.roleUserSelect, payload.data);
      populateSelect(selectors.deleteUserSelect, payload.data);
    } catch (error) {
      console.error("Unable to load users", error);
      showFeedback("Error loading users.", "danger");
    }
  }

  /**
   * Submits a user management form to the server.
   *
   * @param {Event} event - Form submit event
   * @param {string} action - Action to perform (add, update_password, update_role, delete)
   * @param {string} successMessage - Message to display on success
   */
  async function submitForm(event, action, successMessage) {
    event.preventDefault();
    clearFeedback();

    const form = event.target;
    const submitButton = form.querySelector("button[type='submit']");
    if (submitButton) {
      submitButton.disabled = true;
    }

    const formData = new FormData(form);
    formData.append("action", action);

    try {
      const response = await fetch(endpoints.manage, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams(formData),
      });

      const payload = await response.json().catch(() => ({ success: false }));
      if (!response.ok || !payload.success) {
        showFeedback(payload.message || "Operation failed.", "danger");
        return;
      }

      // Success - update UI
      showFeedback(successMessage, "success");
      form.reset();
      await loadUsers();
    } catch (error) {
      console.error("Credential operation failed", error);
      showFeedback("Error during the requested operation.", "danger");
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
      }
    }
  }

  /**
   * Initialize credentials management on page load.
   *
   * Requires admin privileges. Sets up form event listeners and loads initial user list.
   */
  document.addEventListener("DOMContentLoaded", () => {
    // Ensure authentication module is available
    if (typeof SimpleAdminAuth === "undefined") {
      return;
    }

    // Verify admin privileges
    SimpleAdminAuth.requireAdmin().then((session) => {
      if (!session) {
        return;
      }

      // Load initial user list
      loadUsers();

      // Attach form listeners
      const addForm = document.getElementById(selectors.addForm);
      if (addForm) {
        addForm.addEventListener("submit", (event) =>
          submitForm(event, "add", "User added successfully.")
        );
      }

      const updatePasswordForm = document.getElementById(selectors.updatePasswordForm);
      if (updatePasswordForm) {
        updatePasswordForm.addEventListener("submit", (event) =>
          submitForm(event, "update_password", "Password updated.")
        );
      }

      const updateRoleForm = document.getElementById(selectors.updateRoleForm);
      if (updateRoleForm) {
        updateRoleForm.addEventListener("submit", (event) =>
          submitForm(event, "update_role", "Role updated.")
        );
      }

      const deleteForm = document.getElementById(selectors.deleteForm);
      if (deleteForm) {
        deleteForm.addEventListener("submit", (event) =>
          submitForm(event, "delete", "User removed.")
        );
      }
    });
  });
})();
