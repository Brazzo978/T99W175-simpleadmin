import type { TFunction } from "i18next";
import type { NetworkEvent, NetworkEventType } from "@/types/modem-status";

/**
 * Label of one event in the current language: its type's
 * (`dashboard:event_type.<type>`), or for a DIAG radio event its technology
 * and category as Signal Details names them ("5G Failure", "LTE Mobility").
 */
export function eventLabel(event: NetworkEvent, t: TFunction): string {
  if (event.type === "radio_event" && event.category) {
    const category = t(`common:radio_category.${event.category}`);
    return event.rat
      ? t("dashboard:event_type.radio_label", { rat: event.rat, category })
      : category;
  }
  return t(`dashboard:event_type.${event.type}`, { defaultValue: event.type });
}

/** Tab categories used by the monitoring Network Events card */
export type EventTabCategory = "bandChanges" | "dataConnection" | "networkMode";

/** Maps each NetworkEventType to its tab category */
export const EVENT_TAB_CATEGORIES: Record<NetworkEventType, EventTabCategory> =
  {
    band_change: "bandChanges",
    pci_change: "bandChanges",
    scc_pci_change: "bandChanges",
    nr_anchor: "bandChanges",
    ca_change: "bandChanges",
    network_mode: "networkMode",
    signal_lost: "networkMode",
    signal_restored: "networkMode",
    internet_lost: "dataConnection",
    internet_restored: "dataConnection",
    high_latency: "dataConnection",
    latency_recovered: "dataConnection",
    high_packet_loss: "dataConnection",
    packet_loss_recovered: "dataConnection",
    watchcat_recovery: "dataConnection",
    sim_failover: "dataConnection",
    sim_swap_detected: "dataConnection",
    airplane_mode: "networkMode",
    profile_applied: "dataConnection",
    profile_failed: "dataConnection",
    profile_deactivated: "dataConnection",
    tower_failover: "dataConnection",
    radio_event: "networkMode",
  };
