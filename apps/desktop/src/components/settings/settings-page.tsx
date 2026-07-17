import { cn } from "@llm-space/ui/lib/utils";
import type { ReactNode } from "react";


/**
 * Shared layout for a single settings page: a sticky title header (with an
 * optional one-line description) followed by a scrollable body. Each concrete
 * page (General, Models, …) renders its own controls into `children`.
 */
export function SettingsPage({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <header
        className={cn(
          "shrink-0 px-6",
          description
            ? "flex flex-col justify-center gap-0.5 py-2.5"
            : "flex h-12 items-center"
        )}
      >
        <h2 className="font-heading text-base font-medium">{title}</h2>
        {description ? (
          <p className="text-muted-foreground text-xs">{description}</p>
        ) : null}
      </header>
      <div className={cn("min-h-0 flex-1 overflow-x-hidden px-6 pb-6", className)}>
        {children}
      </div>
    </div>
  );
}
