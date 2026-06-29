import { SidebarCloseIcon, SidebarOpenIcon } from "lucide-react";
import { useCallback } from "react";

import { electrobun } from "@/lib/electrobun";
import { cn } from "@/lib/utils";

import { Tooltip } from "./tooltip";
import { Button } from "./ui/button";
import { Kbd, KbdGroup } from "./ui/kbd";

export function AppHeader({
  sidebarOpen = true,
  fullScreen,
  onToggleSidebar,
}: {
  sidebarOpen?: boolean;
  fullScreen?: boolean;
  onToggleSidebar?: () => void;
}) {
  const handleDoubleClick = useCallback(() => {
    if (!electrobun.rpc) {
      return;
    }
    void electrobun.rpc.request.toggleMaximized({});
  }, []);
  return (
    <header
      className="titlebar electrobun-webkit-app-region-drag relative flex min-h-[36px] w-full cursor-default items-center justify-center border-b select-none"
      onDoubleClick={handleDoubleClick}
    >
      <div
        className={cn(
          "electrobun-webkit-app-region-no-drag absolute flex h-full items-center",
          fullScreen ? "left-2" : "left-18"
        )}
      >
        <Tooltip
          content={
            <>
              {sidebarOpen ? "Hide Sidebar" : "Show Sidebar"}{" "}
              <KbdGroup>
                <Kbd className="text-foreground!">⌘ B</Kbd>
              </KbdGroup>
            </>
          }
        >
          <Button size="icon-sm" variant="ghost" onClick={onToggleSidebar}>
            {sidebarOpen ? (
              <SidebarCloseIcon className="size-4" />
            ) : (
              <SidebarOpenIcon className="size-4" />
            )}
          </Button>
        </Tooltip>
      </div>
      <h1 className="text-sm">LLM Space 4</h1>
    </header>
  );
}
