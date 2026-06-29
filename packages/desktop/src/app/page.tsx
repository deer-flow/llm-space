import { useCallback, useEffect, useRef, useState } from "react";
import { usePanelRef } from "react-resizable-panels";

import { AppHeader } from "@/components/app-header";
import { FileSystemTreeView } from "@/components/file-system-tree-view";
import { ThreadTabs, useThreadTabs } from "@/components/thread-tabs";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { electrobun } from "@/lib/electrobun";
import { useFullScreen } from "@/lib/use-full-screen";

export function Page() {
  const tabs = useThreadTabs();

  // Bridge the native File-menu commands (sent over RPC from the bun process)
  // into the tab state. `close`/`closeAll` are stable; the latest active tab is
  // read through a ref so the listener never goes stale.
  const activePathRef = useRef(tabs.activePath);
  activePathRef.current = tabs.activePath;
  const { close, closeOthers, closeAll } = tabs;
  useEffect(() => {
    const rpc = electrobun.rpc;
    if (!rpc) return;
    const onCloseActiveTab = () => {
      if (activePathRef.current) close(activePathRef.current);
    };
    const onCloseOtherTabs = () => {
      if (activePathRef.current) closeOthers(activePathRef.current);
    };
    const onCloseAllTabs = () => closeAll();
    rpc.addMessageListener("closeActiveTab", onCloseActiveTab);
    rpc.addMessageListener("closeOtherTabs", onCloseOtherTabs);
    rpc.addMessageListener("closeAllTabs", onCloseAllTabs);
    return () => {
      rpc.removeMessageListener("closeActiveTab", onCloseActiveTab);
      rpc.removeMessageListener("closeOtherTabs", onCloseOtherTabs);
      rpc.removeMessageListener("closeAllTabs", onCloseAllTabs);
    };
  }, [close, closeOthers, closeAll]);

  // The "New file" tab button reuses the tree's create-thread flow: the tree
  // registers it here, and the button (and ⌘N menu) trigger the same handler.
  const newThreadRef = useRef<(() => void) | null>(null);
  const registerNewThread = useCallback((fn: () => void) => {
    newThreadRef.current = fn;
  }, []);
  const handleNewFile = useCallback(() => newThreadRef.current?.(), []);

  // Collapse / expand the left side panel from the title-bar button.
  const sidebarPanelRef = usePanelRef();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const toggleSidebar = useCallback(() => {
    const panel = sidebarPanelRef.current;
    if (!panel) return;
    if (panel.isCollapsed()) panel.expand();
    else panel.collapse();
  }, [sidebarPanelRef]);

  // The View > Toggle Sidebar menu (⌘B) drives the same toggle over RPC.
  useEffect(() => {
    const rpc = electrobun.rpc;
    if (!rpc) return;
    rpc.addMessageListener("toggleSidebar", toggleSidebar);
    return () => rpc.removeMessageListener("toggleSidebar", toggleSidebar);
  }, [toggleSidebar]);

  const fullScreen = useFullScreen();

  return (
    <div className="flex size-full flex-col">
      <AppHeader
        sidebarOpen={sidebarOpen}
        fullScreen={fullScreen}
        onToggleSidebar={toggleSidebar}
      />
      <main className="min-h-0 grow">
        <ResizablePanelGroup>
          <ResizablePanel
            panelRef={sidebarPanelRef}
            collapsible
            collapsedSize={0}
            defaultSize="16.7%"
            minSize={200}
            onResize={(size) => setSidebarOpen(size.inPixels > 0)}
          >
            <FileSystemTreeView
              className="size-full"
              onSelectFile={tabs.open}
              onRemove={tabs.handleRemove}
              onMove={tabs.handleMove}
              registerNewThread={registerNewThread}
            />
          </ResizablePanel>
          <ResizableHandle />
          <ResizablePanel minSize={640}>
            <ThreadTabs
              tabs={tabs.tabs}
              activePath={tabs.activePath}
              activate={tabs.activate}
              close={tabs.close}
              reorder={tabs.reorder}
              onNewFile={handleNewFile}
            />
          </ResizablePanel>
        </ResizablePanelGroup>
      </main>
    </div>
  );
}
