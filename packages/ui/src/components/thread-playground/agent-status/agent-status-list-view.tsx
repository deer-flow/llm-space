"use client";

import { PlusIcon } from "lucide-react";
import { useCallback, useState } from "react";

import { useHostServices } from "@llm-space/ui/host";
import { useAutoAnimation } from "@llm-space/ui/lib/use-auto-animation";
import { cn } from "@llm-space/ui/lib/utils";
import { Button } from "@llm-space/ui/ui/button";

import { useThreadStore, useThreadStoreActions } from "../stores/thread-store";

import { AgentStatusConfigDialog } from "./agent-status-config-dialog";
import { AgentStatusListItem } from "./agent-status-list-item";
import {
  AGENT_STATUS_COMPONENT_OPTIONS,
  selectAgentStatusComponents,
} from "./agent-status-options";

export function AgentStatusListView({
  className,
  readonly,
}: {
  className?: string;
  readonly?: boolean;
}) {
  const components = useThreadStore(selectAgentStatusComponents);
  const status = useThreadStore((state) => state.status);
  const { setAgentStatusComponent } = useThreadStoreActions();
  const { presentational } = useHostServices();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [animationContainerRef] = useAutoAnimation({ duration: 150 });
  const configurationDisabled = readonly || status !== "idle";
  const selected = AGENT_STATUS_COMPONENT_OPTIONS.filter((option) =>
    components.includes(option.id)
  );
  const openConfiguration = useCallback(() => {
    setDialogOpen(true);
  }, []);

  return (
    <>
      <div
        ref={animationContainerRef}
        className={cn("group flex min-w-0 grow flex-wrap gap-2.5", className)}
      >
        {selected.map((option) => (
          <AgentStatusListItem
            key={option.id}
            component={option.id}
            readonly={configurationDisabled}
            onEdit={openConfiguration}
            onRemove={(component) => setAgentStatusComponent(component, false)}
          />
        ))}
        {!presentational ? (
          <Button
            className={cn(
              "-ml-1 px-0 transition-opacity hover:bg-transparent!",
              configurationDisabled ? "opacity-30!" : "opacity-50"
            )}
            variant="ghost"
            size="sm"
            disabled={configurationDisabled}
            aria-label="添加 Agent Status 组件"
            onClick={() => setDialogOpen(true)}
          >
            <PlusIcon className="size-3" />
            Add
          </Button>
        ) : null}
      </div>
      {!presentational ? (
        <AgentStatusConfigDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          readonly={configurationDisabled}
        />
      ) : null}
    </>
  );
}
