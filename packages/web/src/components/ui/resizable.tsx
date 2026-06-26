"use client";

import { useEffect, useState } from "react";
import * as ResizablePrimitive from "react-resizable-panels";

import { cn } from "@/lib/utils";

const panelCollapseTransitionClassName =
  "[&_[data-panel]]:motion-safe:transition-[flex-grow,flex-basis,flex-shrink] [&_[data-panel]]:motion-safe:duration-200 [&_[data-panel]]:motion-safe:ease-in-out has-[[data-separator=active]]:[&_[data-panel]]:motion-safe:transition-none";

const PANEL_COLLAPSE_TRANSITION_DELAY_MS = 0;

function ResizablePanelGroup({
  className,
  ...props
}: ResizablePrimitive.GroupProps) {
  const [collapseTransitionEnabled, setCollapseTransitionEnabled] =
    useState(false);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setCollapseTransitionEnabled(true);
    }, PANEL_COLLAPSE_TRANSITION_DELAY_MS);
    return () => window.clearTimeout(timeout);
  }, []);

  return (
    <ResizablePrimitive.Group
      data-slot="resizable-panel-group"
      className={cn(
        "flex h-full w-full aria-[orientation=vertical]:flex-col",
        collapseTransitionEnabled && panelCollapseTransitionClassName,
        className
      )}
      {...props}
    />
  );
}

function ResizablePanel({ ...props }: ResizablePrimitive.PanelProps) {
  return <ResizablePrimitive.Panel data-slot="resizable-panel" {...props} />;
}

function ResizableHandle({
  withHandle,
  className,
  ...props
}: ResizablePrimitive.SeparatorProps & {
  withHandle?: boolean;
}) {
  return (
    <ResizablePrimitive.Separator
      data-slot="resizable-handle"
      className={cn(
        "bg-border ring-offset-background focus-visible:ring-ring focus-visible:outline-hidden relative flex w-px items-center justify-center after:absolute after:inset-y-0 after:left-1/2 after:w-1 after:-translate-x-1/2 focus-visible:ring-1 aria-[orientation=horizontal]:h-px aria-[orientation=horizontal]:w-full aria-[orientation=horizontal]:after:left-0 aria-[orientation=horizontal]:after:h-1 aria-[orientation=horizontal]:after:w-full aria-[orientation=horizontal]:after:-translate-y-1/2 aria-[orientation=horizontal]:after:translate-x-0 [&[aria-orientation=horizontal]>div]:rotate-90",
        className
      )}
      {...props}
    >
      {withHandle && (
        <div className="bg-border z-10 flex h-6 w-1 shrink-0 rounded-lg" />
      )}
    </ResizablePrimitive.Separator>
  );
}

export { ResizableHandle, ResizablePanel, ResizablePanelGroup };
