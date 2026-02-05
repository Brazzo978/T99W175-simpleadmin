(() => {
  const path = window.location.pathname || "/";
  const isPlaceholder = path === "/webguioff.html" || path.endsWith("/webguioff.html");

  fetch("/cgi-bin/webui_config", { cache: "no-store" })
    .then((response) => (response.ok ? response.json() : null))
    .then((payload) => {
      if (!payload || payload.success !== true) {
        return;
      }
      const disabled = payload.data && (payload.data.disabled === 1 || payload.data.disabled === "1" || payload.data.disabled === true);
      if (disabled && !isPlaceholder) {
        window.location.replace("/webguioff.html");
      } else if (!disabled && isPlaceholder) {
        window.location.replace("/");
      }
    })
    .catch(() => {});
})();
