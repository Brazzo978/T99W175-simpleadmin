"use client";

import { useCallback, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Loader2, CheckIcon } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

type ButtonProps = React.ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean };

// =============================================================================
// useSaveFlash — brief "Saved!" indicator after a successful save
// =============================================================================
// Usage:
//   const { saved, markSaved } = useSaveFlash();
//   // call markSaved() after a successful save
// =============================================================================

export function useSaveFlash(duration = 1800) {
  const [saved, setSaved] = useState(false);
  const markSaved = useCallback(() => {
    setSaved(true);
    setTimeout(() => setSaved(false), duration);
  }, [duration]);
  return { saved, markSaved };
}

// =============================================================================
// SaveButton — primary save button with loading + saved flash states
// =============================================================================

interface SaveButtonProps extends Omit<ButtonProps, "children"> {
  isSaving: boolean;
  saved: boolean;
  label?: string;
}

export function SaveButton({
  isSaving,
  saved,
  label = "Save Settings",
  disabled,
  className,
  ...props
}: SaveButtonProps) {
  const isActive = isSaving || saved;

  return (
    <Button
      {...props}
      disabled={disabled || isActive}
      className={cn("relative min-w-[120px] overflow-hidden", className)}
    >
      <AnimatePresence mode="wait" initial={false}>
        {isSaving ? (
          <motion.span
            key="saving"
            className="flex items-center gap-1.5"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.14 }}
          >
            <Loader2 className="size-3.5 animate-spin" />
            Saving…
          </motion.span>
        ) : saved ? (
          <motion.span
            key="saved"
            className="flex items-center gap-1.5"
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.85 }}
            transition={{ duration: 0.18, type: "spring", stiffness: 400, damping: 22 }}
          >
            <CheckIcon className="size-3.5" />
            Saved!
          </motion.span>
        ) : (
          <motion.span
            key="idle"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.14 }}
          >
            {label}
          </motion.span>
        )}
      </AnimatePresence>
    </Button>
  );
}
