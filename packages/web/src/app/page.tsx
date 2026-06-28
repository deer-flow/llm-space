"use client";

import type { Thread } from "@llm-space/core";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";

import { localFs } from "@/client";
import { FileSystemTreeView } from "@/components/file-system-tree-view/file-system-tree-view";
import { ThreadPlayground } from "@/components/thread-playground";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";

export default function HomePage() {
  const [selectedPath, setSelectedPath] = useState<string | null>(null);

  // Read the selected thread from storage.
  const { data: thread, isLoading } = useQuery({
    queryKey: ["thread", selectedPath],
    queryFn: () => localFs.read(selectedPath!),
    enabled: selectedPath !== null,
  });

  // Persist edits back to the same path, debounced so we don't write per keystroke.
  const writeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleChange = useCallback(
    (next: Thread) => {
      if (selectedPath === null) return;
      if (writeTimer.current) clearTimeout(writeTimer.current);
      writeTimer.current = setTimeout(() => {
        void localFs.write(selectedPath, next);
      }, 500);
    },
    [selectedPath]
  );

  // Flush any pending write when switching files or unmounting.
  useEffect(() => {
    return () => {
      if (writeTimer.current) clearTimeout(writeTimer.current);
    };
  }, [selectedPath]);

  return (
    <ResizablePanelGroup className="h-size">
      <ResizablePanel className="bg-background" defaultSize="16.7%">
        <FileSystemTreeView
          className="size-full"
          onSelectFile={setSelectedPath}
        />
      </ResizablePanel>
      <ResizableHandle />
      <ResizablePanel>
        {selectedPath === null ? (
          <div className="text-muted-foreground flex size-full items-center justify-center text-sm">
            Select a thread to open
          </div>
        ) : (
          <ThreadPlayground
            key={selectedPath}
            className="bg-background size-full shadow-lg"
            loading={isLoading}
            initialValue={thread}
            onChange={handleChange}
          />
        )}
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
