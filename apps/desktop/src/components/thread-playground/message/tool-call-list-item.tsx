import type { ToolCall, ToolCallInput } from "@llm-space/core";
import {
  AlertCircleIcon,
  Cable,
  CheckCircle2,
  Clock4,
  Loader2,
} from "lucide-react";
import { memo, useCallback, useMemo, useState } from "react";
import { toast } from "sonner";

import { callMcpTool } from "@/client/mcp";
import { useRenderingFidelity } from "@/components/theme-provider";
import { Marker, MarkerContent, MarkerIcon } from "@/components/ui/marker";

import { CodeEditor } from "../../code-editor";
import { Button } from "../../ui/button";
import { useThreadStore, useThreadStoreActions } from "../stores";

import { getToolCallOutputText, getToolCallStatus } from "./tool-call-status";

function _ToolCallListItem({
  messageId,
  toolCall,
  canContinue,
  onContinue,
  readonly = false,
}: {
  messageId: string;
  toolCall: ToolCall;
  canContinue: boolean;
  onContinue: () => void;
  readonly?: boolean;
}) {
  const { fidelity } = useRenderingFidelity();
  const { updateToolCallOutputText } = useThreadStoreActions();
  const mcpSource = useThreadStore((state) => {
    const tool = state.thread.context?.tools?.find(
      (item) => item.name === toolCall.input.name
    );
    return tool?.source?.type === "mcp" ? tool.source : null;
  });
  const [callingMcp, setCallingMcp] = useState(false);
  const outputText = useMemo(() => getToolCallOutputText(toolCall), [toolCall]);
  const toolCallStatus = useMemo(() => getToolCallStatus(toolCall), [toolCall]);
  const isError = toolCall.output?.isError ?? false;
  const handleOutputChange = useCallback(
    (value: string) => {
      if (readonly) {
        return;
      }
      updateToolCallOutputText(messageId, toolCall.id, value);
    },
    [messageId, readonly, toolCall.id, updateToolCallOutputText]
  );
  const toggleError = useCallback(() => {
    if (readonly) {
      return;
    }
    updateToolCallOutputText(messageId, toolCall.id, outputText, !isError);
  }, [
    isError,
    messageId,
    outputText,
    readonly,
    toolCall.id,
    updateToolCallOutputText,
  ]);
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && e.metaKey) {
        e.preventDefault();
        e.stopPropagation();
        if (canContinue) {
          onContinue();
        } else {
          toast.error("Add tool responses before continuing");
        }
      }
    },
    [canContinue, onContinue]
  );
  const handleCallMcpTool = useCallback(async () => {
    if (readonly || !mcpSource) {
      return;
    }
    setCallingMcp(true);
    try {
      const result = await callMcpTool({
        serverId: mcpSource.serverId,
        toolName: mcpSource.toolName,
        arguments: toolCall.input.arguments,
      });
      updateToolCallOutputText(
        messageId,
        toolCall.id,
        result.contentText,
        result.isError ?? false
      );
    } catch (error) {
      toast.error("Failed to call MCP tool", {
        description:
          error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setCallingMcp(false);
    }
  }, [
    messageId,
    mcpSource,
    readonly,
    toolCall.id,
    toolCall.input.arguments,
    updateToolCallOutputText,
  ]);
  return (
    <div className="bg-foreground/4 flex w-full flex-col gap-2 rounded-md px-3 pt-2 pb-3">
      <div className="flex min-w-0 items-start gap-2">
        <ToolCallInputView input={toolCall.input} />
        {mcpSource ? (
          <Button
            className="shrink-0"
            size="sm"
            variant="secondary"
            disabled={readonly || callingMcp}
            onClick={() => void handleCallMcpTool()}
          >
            {callingMcp ? <Loader2 className="animate-spin" /> : <Cable />}
            Call MCP Tool
          </Button>
        ) : null}
      </div>
      <hr />
      <div className="flex w-full flex-col gap-1">
        <div className="text-muted-foreground flex min-w-0 items-center justify-between gap-2 text-xs">
          <Marker role="status" className="gap-1">
            <MarkerContent className="text-xs">
              Response ·{" "}
              {toolCallStatus === "needsResponse"
                ? isError
                  ? "(Needs error text)"
                  : "(Needs response)"
                : toolCallStatus === "error"
                  ? "(Error result)"
                  : "(Ready)"}
            </MarkerContent>
          </Marker>
          <Button
            className="shrink-0"
            size="xs"
            variant={isError ? "destructive" : "ghost"}
            disabled={readonly}
            onClick={toggleError}
          >
            <AlertCircleIcon />
            {isError ? "Clear error" : "Mark as error"}
          </Button>
        </div>
        <CodeEditor
          className="max-h-96 min-h-9.5 px-0!"
          hideBorder
          hideFocusRing
          scrollOnFocus
          plain={fidelity === "lite"}
          placeholder={`Enter the response of ${toolCall.input.name}()`}
          readonly={readonly}
          value={outputText}
          onChange={handleOutputChange}
          onKeyDown={handleKeyDown}
        />
      </div>
    </div>
  );
}
export const ToolCallListItem = memo(_ToolCallListItem);

function _ToolCallInputView({ input }: { input: ToolCallInput }) {
  const keys = Object.keys(input.arguments);
  return (
    <div className="block w-full overflow-x-auto font-mono text-sm select-auto">
      <span className="text-primary">{input.name}</span>
      <span className="text-muted-foreground">(</span>
      {keys.length > 0 && (
        <span className="whitespace-pre">
          {JSON.stringify(input.arguments, null, 2)}
        </span>
      )}
      <span className="text-muted-foreground">{")"}</span>
    </div>
  );
}
const ToolCallInputView = memo(_ToolCallInputView);
