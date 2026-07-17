import type { ReactNode } from "react";

import { cn } from "../lib/utils";

export function CollapsibleContent({
  collapsed = false,
  className,
  children,
}: {
  collapsed?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "grid w-full motion-safe:transition-[grid-template-rows] motion-safe:duration-200 motion-safe:ease-in-out",
        collapsed ? "grid-rows-[0fr]" : "grid-rows-[1fr]"
      )}
    >
      <div
        className={cn(
          "overflow-hidden motion-safe:transition-opacity motion-safe:duration-200",
          collapsed ? "opacity-0" : "opacity-100",
          className
        )}
      >
        {children}
      </div>
    </div>
  );
}
