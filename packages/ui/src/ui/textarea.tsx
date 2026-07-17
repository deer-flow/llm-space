import * as React from "react";

import { cn } from "../lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      autoCapitalize="off"
      autoComplete="off"
      autoCorrect="off"
      className={cn(
        "border-input bg-input/20 placeholder:text-muted-foreground/60 focus-visible:border-ring focus-visible:ring-ring/30 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:bg-input/30 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 flex field-sizing-content min-h-16 w-full resize-none rounded-md border px-2 py-2 text-sm transition-colors outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:ring-2 md:text-xs/relaxed",
        className
      )}
      {...props}
    />
  );
}

export { Textarea };
