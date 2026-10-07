"use client";

import { useEffect, useRef } from "react";
import { fetchSessionStatus } from "@/hooks/use-auth";

/** How often to re-check the session while the app is open (ms) */
const POLL_INTERVAL_MS = 10_000;

/**
 * How long the device must be continuously unreachable before we give up
 * and redirect to login. 90s is generous enough to survive normal slowness
 * but tight enough that reboots (typically 30–60s) are caught promptly once
 * they finish — the session check on the first successful response handles
 * the actual session-gone redirect; this threshold only fires if the device
 * never comes back (e.g. power loss, long watchdog reboot).
 */
const OFFLINE_THRESHOLD_MS = 90_000;

/**
 * Re-checks the session every POLL_INTERVAL_MS while `enabled`.
 *
 * - Session gone   → /login/ (sessions live in /tmp and die with a reboot)
 * - GUI locked     → the configured lock page
 * - Network error  → starts the offline clock
 * - Still offline after OFFLINE_THRESHOLD_MS → /login/?reason=offline
 * - Successful response → resets the offline clock
 */
export function useAutoLogout(enabled: boolean) {
  const offlineSinceRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    const tick = async () => {
      try {
        const status = await fetchSessionStatus();
        if (cancelled) return;
        offlineSinceRef.current = null;
        if (status.gui_locked) {
          window.location.href = status.gui_lock_page || "/webguioff.html";
        } else if (!status.authenticated) {
          window.location.href = "/login/";
        }
      } catch {
        if (offlineSinceRef.current === null) {
          offlineSinceRef.current = Date.now();
        } else if (Date.now() - offlineSinceRef.current >= OFFLINE_THRESHOLD_MS) {
          window.location.href = "/login/?reason=offline";
        }
      }
    };

    const id = setInterval(tick, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [enabled]);
}
