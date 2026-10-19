"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authFetch } from "@/lib/auth-fetch";

// cgi-bin/manage_credentials, action=change_own_password: open to every
// role, it changes the password of the session's own account once
// current_password matches. The Credentials page sets any user's password
// (admins only) through action=update_password of the same CGI.
const ENDPOINT = "/cgi-bin/manage_credentials";

type Failure = "wrong_current" | "unreachable" | "failed";

async function changeOwnPassword(
  current: string,
  next: string,
): Promise<{ ok: true } | { ok: false; failure: Failure; message?: string }> {
  try {
    const resp = await authFetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        action: "change_own_password",
        current_password: current,
        password: next,
      }).toString(),
    });
    const json = await resp.json().catch(() => ({}));
    if (resp.ok && json.success) return { ok: true };
    return {
      ok: false,
      failure: json.error === "wrong_current_password" ? "wrong_current" : "failed",
      message: typeof json.message === "string" ? json.message : undefined,
    };
  } catch {
    return { ok: false, failure: "unreachable" };
  }
}

interface ChangePasswordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  username: string;
}

/** Changes the signed-in user's own password (user menu). */
export function ChangePasswordDialog({
  open,
  onOpenChange,
  username,
}: ChangePasswordDialogProps) {
  const [busy, setBusy] = useState(false);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!busy) onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        {/* Mounted only while open, so every opening starts empty. */}
        <ChangePasswordForm
          username={username}
          busy={busy}
          setBusy={setBusy}
          onDone={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function ChangePasswordForm({
  username,
  busy,
  setBusy,
  onDone,
}: {
  username: string;
  busy: boolean;
  setBusy: (busy: boolean) => void;
  onDone: () => void;
}) {
  const { t } = useTranslation("common");
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<{ failure: Failure; message?: string } | null>(null);
  const currentRef = useRef<HTMLInputElement>(null);

  const mismatch = confirm.length > 0 && confirm !== password;
  const valid = current.length > 0 && password.length > 0 && confirm === password;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    const result = await changeOwnPassword(current, password);
    setBusy(false);
    if (result.ok) {
      toast.success(t("change_password.success"));
      onDone();
      return;
    }
    setError({ failure: result.failure, message: result.message });
  };

  // The fields are disabled while busy, which drops the focus: give it back
  // to the field to correct once they are enabled again.
  useEffect(() => {
    if (error?.failure === "wrong_current") currentRef.current?.select();
  }, [error]);

  let errorText = "";
  if (error?.failure === "wrong_current") errorText = t("change_password.wrong_current");
  else if (error?.failure === "unreachable") errorText = t("change_password.unreachable");
  else if (error) {
    errorText = error.message
      ? `${t("change_password.failed")} (${error.message})`
      : t("change_password.failed");
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>{t("actions.change_password")}</DialogTitle>
        <DialogDescription>
          {t("change_password.description", { username })}
        </DialogDescription>
      </DialogHeader>

      {/* Lets password managers file the new password under this account. */}
      <input hidden readOnly autoComplete="username" value={username} />

      <div className="grid gap-2">
        <Label htmlFor="own-current-password">{t("change_password.current")}</Label>
        <Input
          ref={currentRef}
          id="own-current-password"
          type="password"
          autoComplete="current-password"
          autoFocus
          disabled={busy}
          aria-invalid={error?.failure === "wrong_current" || undefined}
          value={current}
          onChange={(e) => {
            setCurrent(e.target.value);
            if (error?.failure === "wrong_current") setError(null);
          }}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="own-new-password">{t("change_password.new")}</Label>
        <Input
          id="own-new-password"
          type="password"
          autoComplete="new-password"
          disabled={busy}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="own-confirm-password">{t("change_password.confirm")}</Label>
        <Input
          id="own-confirm-password"
          type="password"
          autoComplete="new-password"
          disabled={busy}
          aria-invalid={mismatch || undefined}
          aria-describedby={mismatch ? "own-confirm-password-error" : undefined}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
        {mismatch && (
          <p id="own-confirm-password-error" className="text-xs text-destructive">
            {t("change_password.mismatch")}
          </p>
        )}
      </div>

      {errorText && (
        <p role="alert" className="text-sm text-destructive">
          {errorText}
        </p>
      )}

      <DialogFooter>
        <Button type="button" variant="outline" disabled={busy} onClick={onDone}>
          {t("actions.cancel")}
        </Button>
        <Button type="submit" disabled={busy || !valid}>
          {busy ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              {t("state.saving")}
            </>
          ) : (
            t("actions.save")
          )}
        </Button>
      </DialogFooter>
    </form>
  );
}
