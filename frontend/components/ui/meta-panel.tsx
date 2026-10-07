import * as React from "react";
import { CheckCircle2Icon, TriangleAlertIcon } from "lucide-react";

import { cn } from "@/lib/utils";

// MetaPanel — a tinted, bordered callout for surfacing read-only summary
// details. Pairs with `MetaPair` for grid-laid attribute readouts.
//
// Use when a card needs to show "here's the state of the thing you just
// selected" alongside a control. Not a Card (no nesting cards) and not
// an Alert (informational, not actionable).
interface MetaPanelProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string;
  blurb?: string;
}

function MetaPanel({
  title,
  blurb,
  className,
  children,
  ...props
}: MetaPanelProps) {
  return (
    <div
      data-slot="meta-panel"
      className={cn(
        "rounded-md border bg-muted/50 px-3 py-2.5 text-sm",
        className,
      )}
      {...props}
    >
      {title && (
        <p className="text-foreground">
          <span className="font-semibold">{title}</span>
          {blurb && (
            <span className="text-muted-foreground"> — {blurb}</span>
          )}
        </p>
      )}
      {children}
    </div>
  );
}

// MetaPair — a label/value cell. `glyph` renders a small status icon next
// to the value (size-3 lucide, semantic color). Generic OK/Warning labels
// keep the component reusable across contexts; callers add surrounding
// context via the row label and card title.
interface MetaPairProps {
  label: string;
  value: string;
  glyph?: "ok" | "warn" | null;
}

function MetaPair({ label, value, glyph = null }: MetaPairProps) {
  return (
    <div className="flex flex-col">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-semibold tabular-nums flex items-center gap-1.5">
        {value}
        {glyph === "ok" && (
          <CheckCircle2Icon
            className="size-3 text-success"
            aria-label="OK"
          />
        )}
        {glyph === "warn" && (
          <TriangleAlertIcon
            className="size-3 text-warning"
            aria-label="Warning"
          />
        )}
      </span>
    </div>
  );
}

export { MetaPanel, MetaPair };
