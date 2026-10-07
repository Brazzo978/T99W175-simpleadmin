"use client";

import * as React from "react";
import type { SessionStatus } from "@/hooks/use-auth";

/** The confirmed session of the authenticated app (see AppLayout). */
export const SessionContext = React.createContext<SessionStatus | null>(null);

export function useSessionInfo(): SessionStatus | null {
  return React.useContext(SessionContext);
}
