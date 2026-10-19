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
] as const;
