import { uuid, type Message } from "@llm-space/core";
import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  type ForwardedRef,
} from "react";

import { cn } from "@/lib/utils";

import { CodeEditor, type CodeEditorHandle } from "../../code-editor";
import metaPrompt from "../examples/meta-prompt.md?raw";
import { PROMPT_EXAMPLES, resolveSeed } from "../examples/prompts";
import { ExamplesMenu } from "../examples-menu";
import { GeneratePopoverButton } from "../generate-popover-button";
import { useThreadStore, useThreadStoreActions } from "../stores";
import { useStreamText } from "../use-stream-text";

export interface SystemPromptEditorHandle {
  insertText(text: string): void;
}

interface SystemPromptEditorProps {
  className?: string;
  readonly?: boolean;
  onStreamingChange?: (streaming: boolean) => void;
}

function _SystemPromptEditor({
  className,
  readonly,
  onStreamingChange,
}: SystemPromptEditorProps, ref: ForwardedRef<SystemPromptEditorHandle>) {
  const editorRef = useRef<CodeEditorHandle>(null);
  const systemPrompt = useThreadStore(
    (s) => s.thread.context?.systemPrompt ?? ""
  );
  const tools = useThreadStore((s) => s.thread.context?.tools);
  const threadModel = useThreadStore((s) => s.thread.model);
  const { updateSystemPrompt } = useThreadStoreActions();
  const handleChange = useCallback(
    (value: string) => {
      updateSystemPrompt(value);
    },
    [updateSystemPrompt]
  );

  const {
    text: generated,
    streaming,
    run: generate,
  } = useStreamText({
    systemPrompt: metaPrompt,
    reasoning: "off",
    // Use the thread's own model (id/provider only) when it has one.
    model: threadModel
      ? { id: threadModel.id, provider: threadModel.provider }
      : undefined,
  });

  // Stream the generated prompt straight into the editor.
  useEffect(() => {
    if (generated) {
      updateSystemPrompt(generated);
    }
  }, [generated, updateSystemPrompt]);

  useEffect(() => {
    onStreamingChange?.(streaming);
  }, [onStreamingChange, streaming]);

  useEffect(() => {
    return () => onStreamingChange?.(false);
  }, [onStreamingChange]);

  const handleExampleSelect = useCallback(
    (content: string) => {
      updateSystemPrompt(content);
    },
    [updateSystemPrompt]
  );

  const handleGenerate = useCallback(
    (prompt: string) => {
      // Feed the current prompt and tools (if any) as a prior assistant turn,
      // so the model refines them in response to the user's request.
      const trimmed = systemPrompt.trim();
      const parts: string[] = [];
      if (trimmed) {
        parts.push(`<system-prompt>\n${trimmed}\n</system-prompt>`);
      }
      if (tools && tools.length > 0) {
        parts.push(`<tools>\n${JSON.stringify(tools, null, 2)}\n</tools>`);
      }
      const messages: Message[] = parts.length
        ? [
            {
              id: uuid(),
              role: "assistant",
              content: [
                {
                  type: "text",
                  text: `<original>\n${parts.join("\n")}\n</original>`,
                },
              ],
            },
          ]
        : [];
      void generate({
        messages,
        userPrompt: `<user-input>\n${prompt}\n</user-input>`,
      });
    },
    [generate, systemPrompt, tools]
  );

  const insertText = useCallback(
    (text: string) => {
      const editor = editorRef.current;
      if (editor) {
        editor.insertText(text);
        return;
      }
      updateSystemPrompt(`${systemPrompt}${text}`);
    },
    [systemPrompt, updateSystemPrompt]
  );

  useImperativeHandle(ref, () => ({ insertText }), [insertText]);

  return (
    <div className={cn("flex size-full flex-col", className)}>
      <div className="flex shrink-0 items-center justify-between py-2">
        <div className="text-muted-foreground text-sm">System prompt</div>
        <div className="flex items-center gap-2">
          <GeneratePopoverButton
            placeholder="Describe the assistant you want (its role, tone, and rules), and we'll generate a system prompt."
            onGenerate={handleGenerate}
          />
          <ExamplesMenu
            items={PROMPT_EXAMPLES}
            onSelect={(example) =>
              void resolveSeed(example.content).then((content) => {
                if (content !== undefined) handleExampleSelect(content);
              })
            }
          />
        </div>
      </div>
      <CodeEditor
        ref={editorRef}
        className="hover:border-accent-foreground/20 grow transition-[border-color]"
        value={systemPrompt ?? ""}
        language="markdown"
        readonly={readonly || streaming}
        placeholder="Enter system prompt here"
        onChange={handleChange}
      />
    </div>
  );
}

export const SystemPromptEditor = memo(forwardRef(_SystemPromptEditor));
