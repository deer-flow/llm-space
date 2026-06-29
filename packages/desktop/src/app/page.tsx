import { useEffect, useRef } from "react";

import { FileSystemTreeView } from "@/components/file-system-tree-view";
import { ThreadTabs, useThreadTabs } from "@/components/thread-tabs";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { electrobun } from "@/lib/electrobun";

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

  return (
    <ResizablePanelGroup className="size-full">
      <ResizablePanel className="bg-background" defaultSize="16.7%">
        <FileSystemTreeView
          className="size-full"
          onSelectFile={tabs.open}
          onRemove={tabs.handleRemove}
          onMove={tabs.handleMove}
        />
      </ResizablePanel>
      <ResizableHandle />
      <ResizablePanel>
        <ThreadTabs
          tabs={tabs.tabs}
          activePath={tabs.activePath}
          activate={tabs.activate}
          close={tabs.close}
          reorder={tabs.reorder}
        />
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
