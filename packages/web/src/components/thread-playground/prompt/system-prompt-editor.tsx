import React, { memo, useCallback } from "react";

import { cn } from "@/lib/utils";
import { useThreadStore, useThreadStoreActions } from "@/stores/thread-store";

import { CodeEditor } from "../../code-editor";

function _SystemPromptEditor({
  className,
  readonly,
}: {
  className?: string;
  readonly?: boolean;
}) {
  const systemPrompt = useThreadStore(
    (s) => s.thread.context?.systemPrompt ?? ""
  );
  const { updateSystemPrompt } = useThreadStoreActions();
  const handleChange = useCallback(
    (value: string) => {
      updateSystemPrompt(value);
    },
    [updateSystemPrompt]
  );
  return (
    <CodeEditor
      className={cn("", className)}
      value={systemPrompt ?? ""}
      language="markdown"
      readonly={readonly}
      placeholder="Enter system prompt here"
      onChange={handleChange}
    />
  );
}

export const SystemPromptEditor = memo(_SystemPromptEditor);
