import {
  isExecutableTool,
  type ToolCall,
  type ToolCallInput,
} from "@llm-space/core";
import { AlertCircleIcon, Loader2, PlayCircleIcon } from "lucide-react";
import { memo, useCallback, useMemo, useState } from "react";
import { toast } from "sonner";

import { openFirecrawlLimitDialog } from "@/components/firecrawl-limit-dialog";
import { useRenderingFidelity } from "@/components/theme-provider";
import { Marker, MarkerContent } from "@/components/ui/marker";

import { CodeEditor } from "../../code-editor";
import { Button } from "../../ui/button";
import { useThreadStoreActions } from "../stores";

import { getToolCallOutputText, getToolCallStatus } from "./tool-call-status";
import { useToolCallRunner } from "./use-tool-call-runner";

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
  const { resolveTool, runToolCall } = useToolCallRunner(messageId);
  const tool = resolveTool(toolCall.input.name);
  const executable = tool !== undefined && isExecutableTool(tool);
  const [calling, setCalling] = useState(false);
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
  const handleCall = useCallback(async () => {
    if (readonly || !executable) {
      return;
    }
    setCalling(true);
    try {
      const outcome = await runToolCall(toolCall);
      if (outcome?.isError) {
        if (outcome.isFirecrawlLimit) {
          openFirecrawlLimitDialog();
        } else {
          toast.error(`Failed to call ${toolCall.input.name}()`);
        }
      }
    } finally {
      setCalling(false);
    }
  }, [executable, readonly, runToolCall, toolCall]);
  return (
    <div className="bg-foreground/4 flex w-full flex-col gap-2 rounded-md px-3 pt-2 pb-3">
      <div className="flex min-w-0 items-start gap-2">
        <ToolCallInputView input={toolCall.input} />
        {executable ? (
          <Button
            className="invisible shrink-0 group-hover/message:visible"
            size="sm"
            variant="secondary"
            disabled={readonly || calling}
            onClick={() => void handleCall()}
          >
            {calling ? <Loader2 className="animate-spin" /> : <PlayCircleIcon />}
            Call {toolCall.input.name}()
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
            className="invisible shrink-0 group-hover/message:visible"
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
