"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { atMessage, sendAt, type AtResult } from "@/lib/at";
import {
  BAND_RESET_COMMAND,
  LTE_UNLOCK_COMMAND,
  NR_UNLOCK_COMMAND,
  bandLockCommand,
  lteLockCommand,
  nrLockCommand,
  parseBandPref,
  parseLteLocks,
  parseNr5gMode,
  parseNrLocks,
  parsePdpContexts,
  parseSimSlot,
  parseSlmode,
  simSlotCommand,
  type BandPrefs,
  type LteLock,
  type Nr5gMode,
  type NrLock,
  type PdpContext,
  type PdpType,
} from "@/lib/radio-at";
import type { BandCategory } from "@/types/band-locking";

// =============================================================================
// useRadioSettings — band lock, cell lock, network mode, SIM slot, APN
// =============================================================================
// Reads everything with one chained AT query on mount and after each change;
// every action is one or a few AT commands, the same sequences the classic
// radio settings page sent.
// =============================================================================

const READ_COMMAND =
  "AT^SWITCH_SLOT?;^SLMODE?;^NR5G_MODE?;+CPIN?;+CGDCONT?;^LTE_LOCK?;^NR5G_LOCK?;^BAND_PREF_EXT?";

/** The SIM switch needs a moment before the modem answers again. */
const SIM_SWITCH_SETTLE_MS = 5000;
/** Attempts at restoring the network mode while the modem settles. */
const SLMODE_RESTORE_ATTEMPTS = 3;
const SLMODE_RESTORE_GAP_MS = 2000;

export interface RadioSettings {
  bands: BandPrefs;
  networkMode: number | null;
  nr5gMode: Nr5gMode | null;
  simSlot: 1 | 2 | null;
  simReady: boolean;
  contexts: PdpContext[];
  lteLocks: LteLock[];
  nrLocks: NrLock[];
}

export interface ActionResult {
  ok: boolean;
  message?: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const fail = (t: TFunction, result: AtResult, fallback: string): ActionResult => ({
  ok: false,
  message: atMessage(t, result) || fallback,
});

/** The first step went through, a follow-up did not: say both. */
const partial = (t: TFunction, result: AtResult, context: string): ActionResult => {
  const reason = atMessage(t, result);
  return { ok: false, message: reason ? `${context} (${reason})` : context };
};

export function useRadioSettings() {
  const { t } = useTranslation("cellular");
  const [data, setData] = useState<RadioSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  // The failed read, translated at render so the text follows the language.
  const [readError, setReadError] = useState<AtResult | null>(null);
  const error = readError
    ? atMessage(t, readError) || t("radio_actions.read_failed")
    : null;
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    const result = await sendAt(READ_COMMAND);
    if (!mounted.current) return;
    if (!result.ok && !result.output) {
      setReadError(result);
      setIsLoading(false);
      return;
    }
    // With no SIM some queries answer ERROR; parse whatever came back.
    const out = result.output;
    setData({
      bands: parseBandPref(out),
      networkMode: parseSlmode(out),
      nr5gMode: parseNr5gMode(out),
      simSlot: parseSimSlot(out),
      simReady: /\+CPIN:\s*READY/i.test(out),
      contexts: parsePdpContexts(out),
      lteLocks: parseLteLocks(out),
      nrLocks: parseNrLocks(out),
    });
    setReadError(null);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  /** Runs an action with the busy flag set, then re-reads the settings. */
  const run = useCallback(
    async (action: () => Promise<ActionResult>): Promise<ActionResult> => {
      setIsBusy(true);
      try {
        return await action();
      } finally {
        await refresh();
        if (mounted.current) setIsBusy(false);
      }
    },
    [refresh],
  );

  const lockBands = useCallback(
    (category: BandCategory, bands: number[]) =>
      run(async () => {
        const r = await sendAt(bandLockCommand(category, bands));
        return r.ok ? { ok: true } : fail(t, r, t("radio_actions.lock_bands_failed"));
      }),
    [run, t],
  );

  const resetBands = useCallback(
    () =>
      run(async () => {
        const r = await sendAt(BAND_RESET_COMMAND);
        return r.ok ? { ok: true } : fail(t, r, t("radio_actions.restore_bands_failed"));
      }),
    [run, t],
  );

  const setNetworkMode = useCallback(
    (value: number) =>
      run(async () => {
        const r = await sendAt(`AT^SLMODE=1,${value}`);
        return r.ok ? { ok: true } : fail(t, r, t("radio_actions.network_mode_failed"));
      }),
    [run, t],
  );

  const setNr5gMode = useCallback(
    (mode: Nr5gMode) =>
      run(async () => {
        const r = await sendAt(`AT^NR5G_MODE=${mode}`);
        return r.ok ? { ok: true } : fail(t, r, t("radio_actions.nr5g_mode_failed"));
      }),
    [run, t],
  );

  /** Switching slot resets the network mode: put the previous one back. */
  const switchSim = useCallback(
    (slot: 1 | 2) =>
      run(async () => {
        const previousMode = data?.networkMode ?? null;
        const r = await sendAt(simSlotCommand(slot));
        if (!r.ok) return fail(t, r, t("radio_actions.switch_sim_failed"));
        await sleep(SIM_SWITCH_SETTLE_MS);
        if (previousMode === null) return { ok: true };
        let restore: AtResult = { ok: false, output: "" };
        for (let i = 0; i < SLMODE_RESTORE_ATTEMPTS && !restore.ok; i++) {
          if (i > 0) await sleep(SLMODE_RESTORE_GAP_MS);
          restore = await sendAt(`AT^SLMODE=1,${previousMode}`);
        }
        return restore.ok
          ? { ok: true }
          : partial(t, restore, t("radio_actions.sim_mode_restore_failed", { slot }));
      }),
    [run, data?.networkMode, t],
  );

  /**
   * Profile 1 carries the data connection: the other profiles are removed,
   * profile 1 rewritten, and the radio restarted to attach with it. The
   * restart goes through CFUN=4 (radio off, SIM kept): on this modem CFUN=0
   * powers the SIM down and CFUN=1 does not bring it back ("SIM not
   * inserted" until a reboot).
   */
  const setApn = useCallback(
    (apn: string, type: PdpType) =>
      run(async () => {
        const read = await sendAt("AT+CGDCONT?");
        if (!read.ok) return fail(t, read, t("radio_actions.read_apn_failed"));
        for (const ctx of parsePdpContexts(read.output)) {
          if (ctx.cid === 1) continue;
          const del = await sendAt(`AT+CGDCONT=${ctx.cid}`);
          if (!del.ok) return fail(t, del, t("radio_actions.remove_apn_failed", { cid: ctx.cid }));
        }
        const set = await sendAt(`AT+CGDCONT=1,"${type}","${apn}"`);
        if (!set.ok) return fail(t, set, t("radio_actions.set_apn_failed"));
        const off = await sendAt("AT+CFUN=4");
        if (!off.ok) return fail(t, off, t("radio_actions.radio_off_failed"));
        const on = await sendAt("AT+CFUN=1");
        if (!on.ok) return fail(t, on, t("radio_actions.radio_on_failed"));
        return { ok: true };
      }),
    [run, t],
  );

  /** Deletes every APN profile and restarts the modem (operator defaults). */
  const resetApn = useCallback(async (): Promise<ActionResult> => {
    setIsBusy(true);
    try {
      const read = await sendAt("AT+CGDCONT?");
      if (!read.ok) return fail(t, read, t("radio_actions.read_apn_failed"));
      for (const ctx of parsePdpContexts(read.output)) {
        const del = await sendAt(`AT+CGDCONT=${ctx.cid}`);
        if (!del.ok) return fail(t, del, t("radio_actions.remove_apn_failed", { cid: ctx.cid }));
      }
      const restart = await sendAt("AT+CFUN=1,1");
      return restart.ok ? { ok: true } : fail(t, restart, t("radio_actions.restart_failed"));
    } finally {
      if (mounted.current) setIsBusy(false);
    }
  }, [t]);

  // A cell lock pins the RAT on this firmware: SLMODE back to automatic
  // keeps the other RAT usable (same workaround as the classic page).
  const lockLte = useCallback(
    (cells: LteLock[]) =>
      run(async () => {
        const r = await sendAt(lteLockCommand(cells));
        if (!r.ok) return fail(t, r, t("radio_actions.lte_lock_failed"));
        const mode = await sendAt("AT^SLMODE=1,0");
        return mode.ok
          ? { ok: true }
          : partial(t, mode, t("radio_actions.lte_lock_mode_failed"));
      }),
    [run, t],
  );

  const lockNr = useCallback(
    (lock: NrLock) =>
      run(async () => {
        const r = await sendAt(nrLockCommand(lock));
        if (!r.ok) return fail(t, r, t("radio_actions.nr_lock_failed"));
        const mode = await sendAt("AT^SLMODE=1,0");
        return mode.ok
          ? { ok: true }
          : partial(t, mode, t("radio_actions.nr_lock_mode_failed"));
      }),
    [run, t],
  );

  const unlockLte = useCallback(
    () =>
      run(async () => {
        const r = await sendAt(LTE_UNLOCK_COMMAND);
        return r.ok ? { ok: true } : fail(t, r, t("radio_actions.lte_unlock_failed"));
      }),
    [run, t],
  );

  const unlockNr = useCallback(
    () =>
      run(async () => {
        const r = await sendAt(NR_UNLOCK_COMMAND);
        return r.ok ? { ok: true } : fail(t, r, t("radio_actions.nr_unlock_failed"));
      }),
    [run, t],
  );

  return {
    data,
    isLoading,
    isBusy,
    error,
    refresh,
    lockBands,
    resetBands,
    setNetworkMode,
    setNr5gMode,
    switchSim,
    setApn,
    resetApn,
    lockLte,
    lockNr,
    unlockLte,
    unlockNr,
  };
}
