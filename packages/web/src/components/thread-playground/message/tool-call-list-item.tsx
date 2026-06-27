import type { ToolCall, ToolCallInput } from "@llm-space/core";
import { memo, useCallback } from "react";

import { useThreadStoreActions } from "@/stores/thread-store";

import { CodeEditor } from "../../code-editor";

export function ToolCallListItem({
  messageId,
  toolCall,
}: {
  messageId: string;
  toolCall: ToolCall;
}) {
  const { run, updateToolCallOutputText } = useThreadStoreActions();
  const handleOutputChange = useCallback((value: string) => {
    updateToolCallOutputText(messageId, toolCall.id, value);
  }, []);
  const handleRun = useCallback(async () => {
    await run(messageId);
  }, [run, messageId]);
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
    <div className="bg-foreground/4 flex w-full flex-col gap-2 rounded-md px-3 pb-3 pt-2 shadow-md">
      <ToolCallInputView input={toolCall.input} />
      <hr />
      <div className="flex w-full flex-col gap-1">
        <div className="flex w-full flex-col">
          <div className="text-sm text-purple-400">Response</div>
        </div>
        <div className="flex w-full flex-col">
          <CodeEditor
            className="px-0! min-h-9.5 max-h-96"
            hideBorder
            hideFocusRing
            placeholder={`Enter the response of ${toolCall.input.name}()`}
            value={
              toolCall.output?.content?.map((c) => c.text).join("\n") ?? ""
            }
            onChange={handleOutputChange}
            onKeyDown={handleKeyDown}
          />
        </div>
      </div>
    </div>
  );
}

function _ToolCallInputView({ input }: { input: ToolCallInput }) {
  const keys = Object.keys(input.arguments);
  return (
    <div className="block w-full overflow-x-auto font-mono">
      <span className="text-purple-400">{input.name}(</span>
      {keys.length > 0 && (
        <span className="whitespace-pre">
          {JSON.stringify(input.arguments, null, 2)}
        </span>
      )}
      <span className="text-purple-400">{")"}</span>
    </div>
  );
}
const ToolCallInputView = memo(_ToolCallInputView);
