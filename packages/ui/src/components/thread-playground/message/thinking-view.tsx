import { ChevronDownIcon } from "lucide-react";
import React, { useCallback, useState } from "react";

import { cn } from "@llm-space/ui/lib/utils";
import { CollapsibleContent } from "@llm-space/ui/ui/collapsible-content";



function _ThinkingView({
  className,
  thinking,
}: {
  className?: string;
  thinking: string;
}) {
  const [collapsed, setCollapsed] = useState(true);
  const handleToggleCollapsed = useCallback(() => {
    setCollapsed((collapsed) => !collapsed);
  }, []);
  return (
    <div
      className={cn(
        "hover:text-accent-foreground text-muted-foreground flex w-full cursor-pointer flex-col px-2 pb-1 text-sm",
        className
      )}
      onClick={handleToggleCollapsed}
    >
      <header>
        <div className="flex items-center gap-1">
          <ChevronDownIcon
            className={cn(
              "size-3.5 shrink-0 motion-safe:transition-transform motion-safe:duration-200 motion-safe:ease-in-out",
              collapsed && "-rotate-90"
            )}
          />
          <div className="font-semibold">Thinking{collapsed ? ":" : ""}</div>
          {collapsed && (
            <div className="text-muted-foreground overflow-hidden text-ellipsis whitespace-nowrap">
              {thinking}
            </div>
          )}
        </div>
      </header>
      <CollapsibleContent collapsed={collapsed} className="pl-1.5">
        <main>
          <div className="text-muted-foreground whitespace-pre-wrap border-l pl-3 text-sm">
            {thinking}
          </div>
        </main>
      </CollapsibleContent>
    </div>
  );
}

export const ThinkingView = React.memo(_ThinkingView);
