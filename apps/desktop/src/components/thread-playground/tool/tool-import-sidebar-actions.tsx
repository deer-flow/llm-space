"use client";

import { cn } from "@llm-space/ui/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@llm-space/ui/ui/dropdown-menu";
import { MoreHorizontal } from "lucide-react";
import { memo, useState } from "react";


/**
 * Right-side slot for a tool-import sidebar row: shows the tool count badge at
 * rest, and swaps it for a "…" actions menu ("Enable all tools" / "Disable all
 * tools") while the row is hovered or the menu is open. The parent row must
 * carry the `group/row` class for the hover swap to work.
 */
function _ToolImportSidebarActions({
  count,
  onEnableAll,
  onDisableAll,
}: {
  count?: number | null;
  onEnableAll: () => void;
  onDisableAll: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {count != null && !open ? (
        <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-[0.625rem] group-hover/row:hidden">
          {count}
        </span>
      ) : null}
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Tool actions"
            className={cn(
              "hover:bg-accent-foreground/10 text-muted-foreground hover:text-foreground relative z-10 hidden size-5 shrink-0 items-center justify-center rounded outline-none group-hover/row:flex data-[state=open]:flex",
              open && "text-foreground flex"
            )}
            onClick={(event) => event.stopPropagation()}
          >
            <MoreHorizontal className="size-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
          <DropdownMenuItem onSelect={onEnableAll}>
            Enable all tools
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onDisableAll}>
            Disable all tools
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}

export const ToolImportSidebarActions = memo(_ToolImportSidebarActions);
