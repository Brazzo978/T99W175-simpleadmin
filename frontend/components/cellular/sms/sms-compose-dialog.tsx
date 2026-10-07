"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

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
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

// =============================================================================
// SmsComposeDialog — Dialog for composing and sending SMS messages
// =============================================================================

interface SmsComposeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSend: (phone: string, message: string) => Promise<boolean>;
  isSaving: boolean;
}

export default function SmsComposeDialog({
  open,
  onOpenChange,
  onSend,
  isSaving,
}: SmsComposeDialogProps) {
  const [phone, setPhone] = React.useState("");
  const [message, setMessage] = React.useState("");

  // Character count and encoding detection
  const isUcs2 = /[^\x00-\x7F]/.test(message);
  const maxChars = isUcs2 ? 70 : 160;
  const charCount = message.length;
  const isOverLimit = charCount > maxChars;

  const isValid = phone.trim().length > 0 && message.trim().length > 0;

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isValid) return;

    const success = await onSend(phone.trim(), message);
    if (success) {
      toast.success("SMS sent successfully");
      setPhone("");
      setMessage("");
      onOpenChange(false);
    } else {
      toast.error("Failed to send SMS");
    }
  };

  // Reset form when dialog opens
  React.useEffect(() => {
    if (open) {
      setPhone("");
      setMessage("");
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New Message</DialogTitle>
          <DialogDescription>
            Compose and send an SMS message.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSend} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="sms-phone">Phone Number</Label>
            <Input
              id="sms-phone"
              type="tel"
              placeholder="+1234567890"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={isSaving}
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="sms-message">Message</Label>
              <span
                className={`text-xs ${
                  isOverLimit
                    ? "text-destructive font-medium"
                    : charCount > maxChars * 0.9
                      ? "text-warning"
                      : "text-muted-foreground"
                }`}
              >
                {charCount}/{maxChars}
                {isUcs2 && " (Unicode)"}
              </span>
            </div>
            <Textarea
              id="sms-message"
              placeholder="Type your message..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              disabled={isSaving}
              rows={4}
              className="resize-none"
            />
            {isOverLimit && (
              <p className="text-xs text-destructive">
                Message exceeds single SMS limit. It will be sent as multiple
                parts.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving || !isValid}>
              {isSaving ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Sending&hellip;
                </>
              ) : (
                "Send"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
