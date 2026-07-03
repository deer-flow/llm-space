import { uuid, type Message } from "@llm-space/core";
import { ChevronDown } from "lucide-react";
import { memo, useCallback, useEffect } from "react";

import { cn } from "@/lib/utils";

import { CodeEditor } from "../../code-editor";
import { Button } from "../../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../ui/dropdown-menu";
import { GeneratePopoverButton } from "../generate-popover-button";
import metaPrompt from "../prompts/meta-prompt.md?raw";
import { useThreadStore, useThreadStoreActions } from "../stores";
import { useStreamText } from "../use-stream-text";

import { PROMPT_EXAMPLES } from "./prompt-examples";

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

  return (
    <div className={cn("flex size-full flex-col", className)}>
      <div className="flex shrink-0 items-center justify-between py-2">
        <div className="text-muted-foreground text-sm">System prompt</div>
        <div className="flex items-center gap-2">
          <GeneratePopoverButton
            placeholder="Describe the assistant you want (its role, tone, and rules), and we'll generate a system prompt."
            onGenerate={handleGenerate}
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm">
                Examples
                <ChevronDown data-icon="inline-end" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {PROMPT_EXAMPLES.map((example, index) =>
                example.type === "separator" ? (
                  <DropdownMenuSeparator key={`sep-${index}`} />
                ) : (
                  (() => {
                    const Icon = example.icon;
                    return (
                      <DropdownMenuItem
                        key={example.label}
                        onSelect={() => handleExampleSelect(example.content)}
                      >
                        <Icon />
                        {example.label}
                      </DropdownMenuItem>
                    );
                  })()
                )
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <CodeEditor
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

export const SystemPromptEditor = memo(_SystemPromptEditor);
