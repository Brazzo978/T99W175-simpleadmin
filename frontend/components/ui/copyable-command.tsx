"use client";

import { toast } from "sonner";

interface CopyableCommandProps {
  command: string;
}

export function CopyableCommand({ command }: CopyableCommandProps) {
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      toast.success("Copied to clipboard");
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = command;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      toast.success("Copied to clipboard");
    }
  };

  return (
    <button
      type="button"
      className="bg-muted px-4 py-2.5 rounded-md text-xs font-mono text-muted-foreground select-all max-w-full overflow-x-auto text-left cursor-pointer hover:bg-muted/80 transition-colors"
      onClick={handleCopy}
      title="Click to copy"
      aria-label="Copy install command to clipboard"
    >
      {command}
    </button>
  );
}
