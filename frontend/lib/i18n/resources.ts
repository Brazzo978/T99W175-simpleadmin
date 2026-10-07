import enCommon from "@/locales/en/common.json";
import enSidebar from "@/locales/en/sidebar.json";
import enDashboard from "@/locales/en/dashboard.json";
import itCommon from "@/locales/it/common.json";
import itSidebar from "@/locales/it/sidebar.json";
import itDashboard from "@/locales/it/dashboard.json";

// Static resources for i18next. Every bundled language declares every namespace.
// locales/ also holds the namespaces of pages not ported yet (cellular,
// system-settings): they join the bundle with their pages.
// Bundle-only: the whole locale catalog rides the existing out/ → www deploy
// path, so nothing is fetched at runtime.
export const resources = {
  en: {
    common: enCommon,
    sidebar: enSidebar,
    dashboard: enDashboard,
  },
  it: {
    common: itCommon,
    sidebar: itSidebar,
    dashboard: itDashboard,
  },
} as const;

export const DEFAULT_NAMESPACE = "common" as const;
export const ALL_NAMESPACES = ["common", "sidebar", "dashboard"] as const;
