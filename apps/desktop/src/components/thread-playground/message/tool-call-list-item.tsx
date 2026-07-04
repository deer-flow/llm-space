import type { ToolCall, ToolCallInput } from "@llm-space/core";
import { memo, useCallback } from "react";

import { CodeEditor } from "../../code-editor";
import { useThreadStoreActions } from "../stores";

function _ToolCallListItem({
  messageId,
  toolCall,
  readonly = false,
}: {
  messageId: string;
  toolCall: ToolCall;
  readonly?: boolean;
}) {
  const { run, updateToolCallOutputText } = useThreadStoreActions();
  const handleOutputChange = useCallback(
    (value: string) => {
      if (readonly) {
        return;
      }
      updateToolCallOutputText(messageId, toolCall.id, value);
    },
    [messageId, readonly, toolCall.id, updateToolCallOutputText]
  );
  const handleRun = useCallback(async () => {
    if (readonly) {
      return;
    }
    await run(messageId);
  }, [messageId, readonly, run]);
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && e.metaKey) {
        void handleRun();
        e.preventDefault();
        e.stopPropagation();
      }
    },
    [handleRun]
  );
  return (
    <div className="bg-foreground/4 flex w-full flex-col gap-2 rounded-md px-3 pt-2 pb-3">
      <ToolCallInputView input={toolCall.input} />
      <hr />
      <div className="flex w-full flex-col gap-1">
        <div className="text-muted-foreground text-xs font-medium">Response</div>
        <CodeEditor
          className="max-h-96 min-h-9.5 px-0!"
          hideBorder
          hideFocusRing
          scrollOnFocus
          placeholder={`Enter the response of ${toolCall.input.name}()`}
          readonly={readonly}
          value={toolCall.output?.content?.map((c) => c.text).join("\n") ?? ""}
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
