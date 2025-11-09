(function () {
  const endpoints = {
    list: "/cgi-bin/manage_credentials?action=list",
    manage: "/cgi-bin/manage_credentials",
  };

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

  function showFeedback(message, type = "success") {
    const alertBox = document.getElementById(selectors.feedback);
    if (!alertBox) {
      return;
    }

    alertBox.textContent = message;
    alertBox.className = `alert alert-${type}`;
    alertBox.classList.remove("d-none");
  }

  function clearFeedback() {
    const alertBox = document.getElementById(selectors.feedback);
    if (alertBox) {
      alertBox.classList.add("d-none");
    }
  }

  function createOption(user) {
    const option = document.createElement("option");
    option.value = user.username;
    option.textContent = `${user.username} (${user.role})`;
    return option;
  }

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

  function updateTable(users) {
    const tbody = document.getElementById(selectors.tableBody);
    if (!tbody) {
      return;
    }

    if (!Array.isArray(users) || users.length === 0) {
      tbody.innerHTML = '<tr><td colspan="2" class="text-center">No users configured.</td></tr>';
      return;
    }

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

      updateTable(payload.data);
      populateSelect(selectors.passwordUserSelect, payload.data);
      populateSelect(selectors.roleUserSelect, payload.data);
      populateSelect(selectors.deleteUserSelect, payload.data);
    } catch (error) {
      console.error("Unable to load users", error);
      showFeedback("Error loading users.", "danger");
    }
  }

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

  document.addEventListener("DOMContentLoaded", () => {
    if (typeof SimpleAdminAuth === "undefined") {
      return;
    }

    SimpleAdminAuth.requireAdmin().then((session) => {
      if (!session) {
        return;
      }

      loadUsers();

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
