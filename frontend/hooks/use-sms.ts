"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { authFetch } from "@/lib/auth-fetch";
import { sendAt } from "@/lib/at";
import {
  SMS_LIST_COMMAND,
  encodeUcs2,
  normalizeNumber,
  parseCpms,
  parseSmsList,
  splitParts,
} from "@/lib/sms";
import type { SmsMessage, SmsStorage } from "@/types/sms";

// =============================================================================
// useSms — inbox, send and delete for the SMS center
// =============================================================================
// Same contract as QManager's hook (components/cellular/sms), backed by the
// SimpleAdmin CGIs: AT+CMGL through get_atcommand for the list, send_sms for
// sending (one request per 70-character part).
// =============================================================================

const SEND_ENDPOINT = "/cgi-bin/send_sms";

export interface SmsData {
  messages: SmsMessage[];
  storage: SmsStorage;
}

export interface UseSmsReturn {
  data: SmsData | null;
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
  sendSms: (phone: string, message: string) => Promise<boolean>;
  deleteSms: (indexes: number[], storage: "ME" | "SM") => Promise<boolean>;
  deleteAllSms: () => Promise<boolean>;
  refresh: (silent?: boolean) => void;
}

export function useSms(): UseSmsReturn {
  const [data, setData] = useState<SmsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const fetchInbox = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    const cpms = await sendAt("AT+CPMS?");
    const storage = cpms.ok ? parseCpms(cpms.output) : null;
    const list = await sendAt(SMS_LIST_COMMAND);
    if (!mounted.current) return;
    if (!list.ok) {
      setError(list.message || "Unable to read the SMS");
      setIsLoading(false);
      return;
    }
    const messages = parseSmsList(list.output, storage?.memory ?? "ME").sort(
      (a, b) => b.indexes[0] - a.indexes[0],
    );
    setData({
      messages,
      storage: {
        used: storage?.used ?? messages.length,
        total: storage?.total ?? 0,
      },
    });
    setError(null);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    fetchInbox();
  }, [fetchInbox]);

  const sendSms = useCallback(
    async (phone: string, message: string) => {
      setIsSaving(true);
      try {
        const number = encodeUcs2(normalizeNumber(phone));
        const parts = splitParts(message);
        // Concatenation reference shared by every part of this message.
        const reference = Math.floor(Math.random() * 256);
        for (let i = 0; i < parts.length; i++) {
          let ok = false;
          let reason = "";
          try {
            const resp = await authFetch(SEND_ENDPOINT, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                number,
                message: encodeUcs2(parts[i]),
                command: `${reference},${i + 1},${parts.length}`,
              }),
            });
            const json = await resp.json();
            ok = Boolean(json.success);
            reason = json.message || json.error_code || "";
          } catch {
            reason = "Modem unreachable";
          }
          if (!ok) {
            setError(
              parts.length > 1
                ? `Part ${i + 1} of ${parts.length} not sent: ${reason}`
                : `SMS not sent: ${reason}`,
            );
            return false;
          }
        }
        setError(null);
        return true;
      } finally {
        if (mounted.current) setIsSaving(false);
      }
    },
    [],
  );

  const deleteSms = useCallback(
    async (indexes: number[], storage: "ME" | "SM") => {
      if (indexes.length === 0) return true;
      setIsSaving(true);
      try {
        const select = `AT+CPMS="${storage}","${storage}","${storage}"`;
        const command = [select, ...indexes.map((i) => `+CMGD=${i}`)].join(";");
        const result = await sendAt(command);
        if (!result.ok) {
          setError(result.message || "Unable to delete the SMS");
          return false;
        }
        await fetchInbox(true);
        return true;
      } finally {
        if (mounted.current) setIsSaving(false);
      }
    },
    [fetchInbox],
  );

  const deleteAllSms = useCallback(async () => {
    setIsSaving(true);
    try {
      const result = await sendAt("AT+CMGD=,4");
      if (!result.ok) {
        setError(result.message || "Unable to delete the SMS");
        return false;
      }
      await fetchInbox(true);
      return true;
    } finally {
      if (mounted.current) setIsSaving(false);
    }
  }, [fetchInbox]);

  return {
    data,
    isLoading,
    isSaving,
    error,
    sendSms,
    deleteSms,
    deleteAllSms,
    refresh: fetchInbox,
  };
}
