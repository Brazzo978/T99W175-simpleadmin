"use client";

import { useCallback, useEffect, useState } from "react";

// SimpleAdmin session CGIs (deploy/www/cgi-bin/session_utils.sh). The session
// cookie is HttpOnly, so the browser cannot see it: session_status is the
// only way to know whether we are logged in. With login disabled
// (SIMPLEADMIN_ENABLE_LOGIN=0) it always answers authenticated.
const STATUS_ENDPOINT = "/cgi-bin/session_status";
const LOGIN_ENDPOINT = "/cgi-bin/authenticate";
const LOGOUT_ENDPOINT = "/cgi-bin/logout";

export interface SessionStatus {
  authenticated: boolean;
  gui_locked: boolean;
  gui_lock_page: string;
  username?: string;
  role?: string;
}

export async function fetchSessionStatus(): Promise<SessionStatus> {
  const resp = await fetch(STATUS_ENDPOINT, { cache: "no-store" });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}

// ---------------------------------------------------------------------------
// Session gate for the authenticated app
// ---------------------------------------------------------------------------

export type SessionState = "checking" | "authenticated";

/**
 * Confirms the session before the app renders: a locked GUI goes to its
 * lock page, a missing session to /login/. Network errors keep checking, so
 * a modem that is rebooting does not bounce the user to the login page.
 */
export function useSession(): { state: SessionState; session: SessionStatus | null } {
  const [session, setSession] = useState<SessionStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const check = () => {
      fetchSessionStatus()
        .then((status) => {
          if (cancelled) return;
          if (status.gui_locked) {
            window.location.href = status.gui_lock_page || "/webguioff.html";
          } else if (!status.authenticated) {
            window.location.href = "/login/";
          } else {
            setSession(status);
          }
        })
        .catch(() => {
          if (!cancelled) timer = setTimeout(check, 3000);
        });
    };
    check();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  return { state: session ? "authenticated" : "checking", session };
}

// ---------------------------------------------------------------------------
// Hook for the login page
// ---------------------------------------------------------------------------

export type LoginStatus = "loading" | "ready";

export function useLogin() {
  const [status, setStatus] = useState<LoginStatus>("loading");

  useEffect(() => {
    fetchSessionStatus()
      .then((data) => {
        if (data.gui_locked) {
          window.location.href = data.gui_lock_page || "/webguioff.html";
        } else if (data.authenticated) {
          window.location.href = "/dashboard/";
        } else {
          setStatus("ready");
        }
      })
      .catch(() => setStatus("ready"));
  }, []);

  const login = useCallback(
    async (
      username: string,
      password: string,
    ): Promise<{ success: boolean; error?: string }> => {
      try {
        const resp = await fetch(LOGIN_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ username, password }).toString(),
        });
        const data = await resp.json();

        if (data.success) {
          // Cookie is set by the backend — just redirect
          window.location.href = "/dashboard/";
          return { success: true };
        }
        return { success: false, error: data.message || "Login failed" };
      } catch {
        return { success: false, error: "Connection failed" };
      }
    },
    [],
  );

  return { status, login };
}

// ---------------------------------------------------------------------------
// Actions (used by the sidebar user menu)
// ---------------------------------------------------------------------------

/**
 * Ends the session. Navigates only once the CGI confirmed it: on failure
 * the session is still valid and the login page would bounce straight back.
 */
export async function logout(): Promise<{ success: boolean }> {
  try {
    const resp = await fetch(LOGOUT_ENDPOINT, { method: "POST" });
    if (!resp.ok) return { success: false };
  } catch {
    return { success: false };
  }
  window.location.href = "/login/";
  return { success: true };
}
