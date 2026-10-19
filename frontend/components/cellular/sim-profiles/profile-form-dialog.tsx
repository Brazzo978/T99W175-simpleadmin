"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { SaveButton, useSaveFlash } from "@/components/ui/save-button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ProfileResult, SimProfile } from "@/hooks/use-sim-profiles";
import { PDP_TYPES, isValidApn, type PdpType } from "@/lib/radio-at";

export type ProfileDraft = Omit<SimProfile, "updated">;

type Errors = Partial<Record<keyof ProfileDraft | "form", string>>;

const NAME_RE = /^[A-Za-z0-9 ._()+-]{1,32}$/;
const ICCID_RE = /^[0-9]{18,22}$/;

function validate(d: ProfileDraft): Errors {
  const e: Errors = {};
  if (!NAME_RE.test(d.name.trim())) e.name = "1 to 32 letters, digits, spaces and . _ ( ) + -";
  if (!ICCID_RE.test(d.iccid)) e.iccid = "18 to 22 digits, as the SIM reports it";
  if (d.apn && !isValidApn(d.apn)) e.apn = "Letters, digits, dot, dash and underscore, at most 63";
  if (d.ttl !== "" && !(/^\d{1,3}$/.test(d.ttl) && Number(d.ttl) <= 255)) e.ttl = "0 to 255, or empty";
  if (!d.apn && d.ttl === "") e.form = "Set an APN, a TTL, or both.";
  return e;
}

const PDP_LABELS: Record<PdpType, string> = { IP: "IPv4", IPV6: "IPv6", IPV4V6: "IPv4v6" };

/**
 * New or edited profile. Mounted with a key per opening, so the fields start
 * from `initial` every time.
 */
export function ProfileFormDialog({
  open,
  onOpenChange,
  initial,
  editing,
  activeIccid,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: ProfileDraft;
  /** ICCID of the profile being edited; undefined for a new one */
  editing?: string;
  activeIccid?: string;
  onSave: (draft: ProfileDraft, previousIccid?: string) => Promise<ProfileResult>;
}) {
  const [draft, setDraft] = useState<ProfileDraft>(initial);
  const [showErrors, setShowErrors] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const { saved, markSaved } = useSaveFlash(900);
  const errors = showErrors ? validate(draft) : {};
  const update = (patch: Partial<ProfileDraft>) => setDraft({ ...draft, ...patch });

  const handleSave = async () => {
    const found = validate(draft);
    if (Object.keys(found).length) {
      setShowErrors(true);
      return;
    }
    setIsSaving(true);
    setSaveError(null);
    const result = await onSave({ ...draft, name: draft.name.trim() }, editing);
    setIsSaving(false);
    if (result.ok) {
      markSaved();
      setTimeout(() => onOpenChange(false), 600);
    } else {
      setSaveError(result.message || "Save failed");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !isSaving && onOpenChange(o)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit Profile" : "New Profile"}</DialogTitle>
          <DialogDescription>
            Applied by itself whenever this SIM becomes the active one. Empty fields leave that
            setting as it is.
          </DialogDescription>
        </DialogHeader>

        <div className="@container/card grid gap-4">
          <Field data-invalid={!!errors.name}>
            <FieldLabel htmlFor="sp-name">Name</FieldLabel>
            <Input
              id="sp-name"
              value={draft.name}
              aria-invalid={!!errors.name}
              onChange={(e) => update({ name: e.target.value })}
            />
            {errors.name && <FieldError>{errors.name}</FieldError>}
          </Field>
          <Field data-invalid={!!errors.iccid}>
            <FieldLabel htmlFor="sp-iccid">ICCID</FieldLabel>
            <div className="flex gap-2">
              <Input
                id="sp-iccid"
                inputMode="numeric"
                className="font-mono"
                value={draft.iccid}
                aria-invalid={!!errors.iccid}
                onChange={(e) => update({ iccid: e.target.value.replace(/\D/g, "") })}
              />
              {activeIccid && draft.iccid !== activeIccid && (
                <Button
                  variant="outline"
                  className="text-foreground"
                  onClick={() => update({ iccid: activeIccid })}
                >
                  Active SIM
                </Button>
              )}
            </div>
            {errors.iccid ? (
              <FieldError>{errors.iccid}</FieldError>
            ) : (
              <FieldDescription>The SIM this profile belongs to.</FieldDescription>
            )}
          </Field>
          <div className="grid grid-cols-1 gap-4 @sm/card:grid-cols-[2fr_1fr]">
            <Field data-invalid={!!errors.apn}>
              <FieldLabel htmlFor="sp-apn">APN</FieldLabel>
              <Input
                id="sp-apn"
                value={draft.apn}
                aria-invalid={!!errors.apn}
                onChange={(e) => update({ apn: e.target.value.trim() })}
              />
              {errors.apn ? (
                <FieldError>{errors.apn}</FieldError>
              ) : (
                <FieldDescription>Profile 1, the data connection.</FieldDescription>
              )}
            </Field>
            <Field>
              <FieldLabel htmlFor="sp-pdp">PDP type</FieldLabel>
              <Select value={draft.pdpType} onValueChange={(v) => update({ pdpType: v as PdpType })}>
                <SelectTrigger id="sp-pdp" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PDP_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {PDP_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field data-invalid={!!errors.ttl}>
            <FieldLabel htmlFor="sp-ttl">TTL / Hop Limit</FieldLabel>
            <Input
              id="sp-ttl"
              inputMode="numeric"
              className="tabular-nums @sm/card:max-w-[12rem]"
              value={draft.ttl}
              aria-invalid={!!errors.ttl}
              onChange={(e) => update({ ttl: e.target.value.replace(/\D/g, "").slice(0, 3) })}
            />
            {errors.ttl ? (
              <FieldError>{errors.ttl}</FieldError>
            ) : (
              <FieldDescription>Outgoing TTL and IPv6 hop limit; 0 turns the override off.</FieldDescription>
            )}
          </Field>
          {(errors.form || saveError) && (
            <div
              role="alert"
              className="border-destructive/30 bg-destructive/10 text-destructive rounded-md border px-3 py-2 text-sm"
            >
              {errors.form ?? saveError}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Cancel
          </Button>
          <SaveButton label="Save Profile" isSaving={isSaving} saved={saved} onClick={handleSave} />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
