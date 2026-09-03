import type { ToolCall } from "@llm-space/core";
import {
  getToolCallOutputText,
  parseSpawnAgentArgs,
  type CreateSubagentThreadResult,
} from "@llm-space/core/thread";
import { ArrowUpRight, LoaderCircle, Plus } from "lucide-react";
import { createContext, useContext, useRef, useState } from "react";
import { toast } from "sonner";

import { useHostServices } from "../../../host";
import { Button } from "../../../ui/button";
import { ThreadStoreContext, useThreadStore } from "../stores";

export const SubagentParentPathContext = createContext<string | undefined>(
  undefined
);

/** Read the UI link, with read-only support for results saved by older versions. */
export function readCreatedSubagent(
  toolCall: ToolCall
): CreateSubagentThreadResult | null {
  if (toolCall.subtaskPath !== undefined) {
    return toolCall.subtaskPath
      ? {
          path: toolCall.subtaskPath,
          status: "created",
          message: "Created, not yet run.",
        }
      : null;
  }
  if (toolCall.output?.isError) return null;
  try {
    const result: unknown = JSON.parse(getToolCallOutputText(toolCall));
    if (
      result &&
      typeof result === "object" &&
      "status" in result &&
      result.status === "created" &&
      "path" in result &&
      typeof result.path === "string" &&
      result.path.endsWith(".json")
    ) {
      return {
        path: result.path,
        status: "created",
        message: "Created, not yet run.",
      };
    }
  } catch {
    /* Pending calls and editable non-JSON results have no created child. */
  }
  return null;
}

export function SpawnAgentCard({
  messageId,
  toolCall,
  readonly,
}: {
  messageId: string;
  toolCall: ToolCall;
  readonly: boolean;
}) {
  const { subagents, presentational } = useHostServices();
  const parentPath = useContext(SubagentParentPathContext);
  const store = useContext(ThreadStoreContext);
  const status = useThreadStore((state) => state.status);
  const isSpawn = useThreadStore((state) =>
    state.thread.context?.tools?.some(
      (tool) => tool.type === "builtin" && tool.name === "spawn_agent"
    )
  );
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [createdResult, setCreatedResult] =
    useState<CreateSubagentThreadResult | null>(null);
  if (toolCall.input.name !== "spawn_agent" || !isSpawn) return null;

  let validationError: string | undefined;
  let args;
  try {
    args = parseSpawnAgentArgs(toolCall.input.arguments);
  } catch (error) {
    validationError =
      error instanceof Error ? error.message : "Invalid arguments.";
  }
  const created = readCreatedSubagent(toolCall) ?? createdResult;
  const disabled =
    readonly ||
    presentational ||
    busy ||
    status !== "idle" ||
    !subagents ||
    !parentPath ||
    (!created && !args);

  const handleCreate = async () => {
    if (
      disabled ||
      inFlight.current ||
      !subagents ||
      !parentPath ||
      store?.getState().status !== "idle"
    )
      return;
    inFlight.current = true;
    setBusy(true);
    let saved = Boolean(created);
    try {
      let result = created;
      if (
        result &&
        !(await subagents.exists({
          path: result.path,
          runtimeId: store.getState().runtimeId ?? "local",
        }))
      ) {
        store.getState().setToolCallSubtaskPath(messageId, toolCall.id, null);
        setCreatedResult(null);
        toast("Subtask file is no longer there", {
          description:
            "It may have been moved or deleted. You can create it again.",
        });
        return;
      }
      if (!result) {
        const state = store.getState();
        result = await subagents.create({
          parentPath,
          thread: structuredClone(state.thread),
          runtimeId: state.runtimeId ?? "local",
          arguments: parseSpawnAgentArgs(toolCall.input.arguments),
        });
        // Record success before opening the tab so navigation failure cannot duplicate it.
        saved = true;
        setCreatedResult(result);
        store
          .getState()
          .setToolCallSubtaskPath(messageId, toolCall.id, result.path);
      }
      subagents.open({
        path: result.path,
        runtimeId: store.getState().runtimeId ?? "local",
      });
    } catch (error) {
      toast.error(
        saved
          ? "Subtask saved; could not open its tab"
          : "Failed to create subtask",
        {
          description:
            error instanceof Error ? error.message : "Please try again.",
        }
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return (
    <div
      className="flex flex-col gap-2 rounded-md border p-3"
      data-slot="spawn-agent-card"
    >
      <div className="text-sm font-medium">{args?.task_name ?? "Subtask"}</div>
      <div className="text-muted-foreground text-xs">
        {args?.subagent_type ?? "general-purpose"} · {args?.description}
      </div>
      {created ? (
        <div className="text-xs break-all">{created.path}</div>
      ) : (
        <div className="text-muted-foreground text-xs">
          The run is paused. Create the subtask, then run it separately.
        </div>
      )}
      {validationError && !created ? (
        <div role="alert" className="text-destructive text-xs">
          {validationError}
        </div>
      ) : null}
      {!parentPath && !presentational ? (
        <div className="text-muted-foreground text-xs">
          Available in saved workspace threads.
        </div>
      ) : null}
      {!presentational && (
        <Button
          size="lg"
          variant="default"
          className="mt-1 gap-2 self-start shadow-sm"
          disabled={disabled}
          onClick={() => void handleCreate()}
        >
          {busy ? (
            <LoaderCircle className="animate-spin" />
          ) : created ? (
            <ArrowUpRight />
          ) : (
            <Plus />
          )}
          {busy
            ? created
              ? "Opening…"
              : "Creating…"
            : created
              ? "Open subtask"
              : "Create subtask"}
        </Button>
      )}
    </div>
  );
}
