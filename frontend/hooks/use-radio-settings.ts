"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { sendAt, type AtResult } from "@/lib/at";
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

const fail = (result: AtResult, fallback: string): ActionResult => ({
  ok: false,
  message: result.message || fallback,
});

export function useRadioSettings() {
  const [data, setData] = useState<RadioSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
      setError(result.message || "Unable to read the radio settings");
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
    setError(null);
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
        return r.ok ? { ok: true } : fail(r, "Unable to lock the bands");
      }),
    [run],
  );

  const resetBands = useCallback(
    () =>
      run(async () => {
        const r = await sendAt(BAND_RESET_COMMAND);
        return r.ok ? { ok: true } : fail(r, "Unable to restore the bands");
      }),
    [run],
  );

  const setNetworkMode = useCallback(
    (value: number) =>
      run(async () => {
        const r = await sendAt(`AT^SLMODE=1,${value}`);
        return r.ok ? { ok: true } : fail(r, "Unable to set the network mode");
      }),
    [run],
  );

  const setNr5gMode = useCallback(
    (mode: Nr5gMode) =>
      run(async () => {
        const r = await sendAt(`AT^NR5G_MODE=${mode}`);
        return r.ok ? { ok: true } : fail(r, "Unable to set the 5G mode");
      }),
    [run],
  );

  /** Switching slot resets the network mode: put the previous one back. */
  const switchSim = useCallback(
    (slot: 1 | 2) =>
      run(async () => {
        const previousMode = data?.networkMode ?? null;
        const r = await sendAt(simSlotCommand(slot));
        if (!r.ok) return fail(r, "Unable to switch SIM");
        await sleep(SIM_SWITCH_SETTLE_MS);
        if (previousMode !== null) {
          await sendAt(`AT^SLMODE=1,${previousMode}`);
        }
        return { ok: true };
      }),
    [run, data?.networkMode],
  );

  /**
   * Profile 1 carries the data connection: the other profiles are removed,
   * profile 1 rewritten, and the radio restarted to attach with it.
   */
  const setApn = useCallback(
    (apn: string, type: PdpType) =>
      run(async () => {
        const read = await sendAt("AT+CGDCONT?");
        if (!read.ok) return fail(read, "Unable to read the APN profiles");
        for (const ctx of parsePdpContexts(read.output)) {
          if (ctx.cid === 1) continue;
          const del = await sendAt(`AT+CGDCONT=${ctx.cid}`);
          if (!del.ok) return fail(del, `Unable to remove APN profile ${ctx.cid}`);
        }
        const set = await sendAt(`AT+CGDCONT=1,"${type}","${apn}"`);
        if (!set.ok) return fail(set, "Unable to set the APN");
        const off = await sendAt("AT+CFUN=0");
        if (!off.ok) return fail(off, "Unable to turn the radio off");
        const on = await sendAt("AT+CFUN=1");
        if (!on.ok) return fail(on, "Unable to turn the radio back on");
        return { ok: true };
      }),
    [run],
  );

  /** Deletes every APN profile and restarts the modem (operator defaults). */
  const resetApn = useCallback(async (): Promise<ActionResult> => {
    setIsBusy(true);
    try {
      const read = await sendAt("AT+CGDCONT?");
      if (!read.ok) return fail(read, "Unable to read the APN profiles");
      for (const ctx of parsePdpContexts(read.output)) {
        const del = await sendAt(`AT+CGDCONT=${ctx.cid}`);
        if (!del.ok) return fail(del, `Unable to remove APN profile ${ctx.cid}`);
      }
      const restart = await sendAt("AT+CFUN=1,1");
      return restart.ok ? { ok: true } : fail(restart, "Unable to restart the modem");
    } finally {
      if (mounted.current) setIsBusy(false);
    }
  }, []);

  // A cell lock pins the RAT on this firmware: SLMODE back to automatic
  // keeps the other RAT usable (same workaround as the classic page).
  const lockLte = useCallback(
    (cells: LteLock[]) =>
      run(async () => {
        const r = await sendAt(lteLockCommand(cells));
        if (!r.ok) return fail(r, "Unable to apply the LTE lock");
        await sendAt("AT^SLMODE=1,0");
        return { ok: true };
      }),
    [run],
  );

  const lockNr = useCallback(
    (lock: NrLock) =>
      run(async () => {
        const r = await sendAt(nrLockCommand(lock));
        if (!r.ok) return fail(r, "Unable to apply the 5G SA lock");
        await sendAt("AT^SLMODE=1,0");
        return { ok: true };
      }),
    [run],
  );

  const unlockLte = useCallback(
    () =>
      run(async () => {
        const r = await sendAt(LTE_UNLOCK_COMMAND);
        return r.ok ? { ok: true } : fail(r, "Unable to remove the LTE lock");
      }),
    [run],
  );

  const unlockNr = useCallback(
    () =>
      run(async () => {
        const r = await sendAt(NR_UNLOCK_COMMAND);
        return r.ok ? { ok: true } : fail(r, "Unable to remove the 5G SA lock");
      }),
    [run],
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
