import { Loader2Icon } from "lucide-react"

import { cn } from "@/lib/utils"

function Spinner({ className, ...props }: React.ComponentProps<"svg">) {
  return (
    <span role="status" aria-live="polite" className="inline-flex">
      <Loader2Icon
        aria-hidden="true"
        className={cn("size-4 animate-spin", className)}
        {...props}
      />
      <span className="sr-only">Loading</span>
    </span>
  )
}

export { Spinner }
