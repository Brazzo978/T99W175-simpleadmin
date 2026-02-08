(function () {
  const disabledPaths = new Set([]);

  function hideElement(el) {
    if (!el) return;
    el.style.display = "none";
  }

  function hideLinkByHref(href) {
    const links = document.querySelectorAll(`a[href=\"${href}\"]`);
    links.forEach((link) => hideElement(link.closest("li") || link));
  }

  document.addEventListener("DOMContentLoaded", () => {
    const path = window.location.pathname || "/";
    const isIndex = path === "/" || path === "/index.html";

    // Device info is now enabled on all pages.

    // Hide disabled nav links/pages
    disabledPaths.forEach((href) => hideLinkByHref(href));

    // Hide config menu divider if no visible items remain under it
    const divider = document.getElementById("configMenuDivider");
    if (divider) {
      const menu = divider.closest(".dropdown-menu");
      if (menu) {
        const visibleItems = Array.from(menu.querySelectorAll("li"))
          .filter((li) => li.style.display !== "none")
          .filter((li) => li !== divider);
        if (visibleItems.length === 0) {
          hideElement(divider);
        }
      }
    }
  });
})();
