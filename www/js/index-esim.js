document.addEventListener("DOMContentLoaded", () => {
  const esimCard = document.getElementById("esimNavItem");
  if (!esimCard || typeof EsimConfig === "undefined") {
    return;
  }

  EsimConfig.loadConfig().then((config) => {
    const enabled =
      config && (config.enabled === 1 || config.enabled === "1" || config.enabled === true);
    if (enabled) {
      esimCard.style.display = 'block';
    }
  });
});