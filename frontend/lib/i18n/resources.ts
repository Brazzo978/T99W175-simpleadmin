import enCommon from "@/locales/en/common.json";
import enSidebar from "@/locales/en/sidebar.json";
import enDashboard from "@/locales/en/dashboard.json";
import enSignal from "@/locales/en/signal.json";
import enAntenna from "@/locales/en/antenna.json";
import enBandLocking from "@/locales/en/band-locking.json";
import enCellLocking from "@/locales/en/cell-locking.json";
import enFrequencyCalculator from "@/locales/en/frequency-calculator.json";
import enCellular from "@/locales/en/cellular.json";
import enSimProfiles from "@/locales/en/sim-profiles.json";
import enSms from "@/locales/en/sms.json";
import enEsim from "@/locales/en/esim.json";
import enNetwork from "@/locales/en/network.json";
import enSystemSettings from "@/locales/en/system-settings.json";
import enCredentials from "@/locales/en/credentials.json";
import enTailscale from "@/locales/en/tailscale.json";
import enTerminal from "@/locales/en/terminal.json";
import enAbout from "@/locales/en/about.json";
import enMonitoring from "@/locales/en/monitoring.json";
import itCommon from "@/locales/it/common.json";
import itSidebar from "@/locales/it/sidebar.json";
import itDashboard from "@/locales/it/dashboard.json";
import itSignal from "@/locales/it/signal.json";
import itAntenna from "@/locales/it/antenna.json";
import itBandLocking from "@/locales/it/band-locking.json";
import itCellLocking from "@/locales/it/cell-locking.json";
import itFrequencyCalculator from "@/locales/it/frequency-calculator.json";
import itCellular from "@/locales/it/cellular.json";
import itSimProfiles from "@/locales/it/sim-profiles.json";
import itSms from "@/locales/it/sms.json";
import itEsim from "@/locales/it/esim.json";
import itNetwork from "@/locales/it/network.json";
import itSystemSettings from "@/locales/it/system-settings.json";
import itCredentials from "@/locales/it/credentials.json";
import itTailscale from "@/locales/it/tailscale.json";
import itTerminal from "@/locales/it/terminal.json";
import itAbout from "@/locales/it/about.json";
import itMonitoring from "@/locales/it/monitoring.json";

// Static resources for i18next. Every bundled language declares every
// namespace: one per page (or page group), plus common, sidebar and
// dashboard. Bundle-only: the whole locale catalog rides the existing
// out/ → www deploy path, so nothing is fetched at runtime.
export const resources = {
  en: {
    common: enCommon,
    sidebar: enSidebar,
    dashboard: enDashboard,
    signal: enSignal,
    antenna: enAntenna,
    "band-locking": enBandLocking,
    "cell-locking": enCellLocking,
    "frequency-calculator": enFrequencyCalculator,
    cellular: enCellular,
    "sim-profiles": enSimProfiles,
    sms: enSms,
    esim: enEsim,
    network: enNetwork,
    "system-settings": enSystemSettings,
    credentials: enCredentials,
    tailscale: enTailscale,
    terminal: enTerminal,
    about: enAbout,
    monitoring: enMonitoring,
  },
  it: {
    common: itCommon,
    sidebar: itSidebar,
    dashboard: itDashboard,
    signal: itSignal,
    antenna: itAntenna,
    "band-locking": itBandLocking,
    "cell-locking": itCellLocking,
    "frequency-calculator": itFrequencyCalculator,
    cellular: itCellular,
    "sim-profiles": itSimProfiles,
    sms: itSms,
    esim: itEsim,
    network: itNetwork,
    "system-settings": itSystemSettings,
    credentials: itCredentials,
    tailscale: itTailscale,
    terminal: itTerminal,
    about: itAbout,
    monitoring: itMonitoring,
  },
} as const;

export const DEFAULT_NAMESPACE = "common" as const;
export const ALL_NAMESPACES = [
  "common",
  "sidebar",
  "dashboard",
  "signal",
  "antenna",
  "band-locking",
  "cell-locking",
  "frequency-calculator",
  "cellular",
  "sim-profiles",
  "sms",
  "esim",
  "network",
  "system-settings",
  "credentials",
  "tailscale",
  "terminal",
  "about",
  "monitoring",
] as const;
