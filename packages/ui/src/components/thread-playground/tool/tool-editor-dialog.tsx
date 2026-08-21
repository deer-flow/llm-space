"use client";

import {
  parseJSON,
  normalizeTool,
  uuid,
  type FunctionTool,
  type Message,
} from "@llm-space/core";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { CodeEditor } from "@llm-space/ui/components/code-editor";
import { useI18n } from "@llm-space/ui/lib/i18n";
import { Button } from "@llm-space/ui/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@llm-space/ui/ui/dialog";

import metaToolPrompt from "../examples/meta-tool.md?raw";
import { DEFAULT_TOOL, TOOL_EXAMPLES } from "../examples/tools";
import { ExamplesMenu } from "../examples-menu";
import { GeneratePopoverButton } from "../generate-popover-button";
import {
  useThreadStore,
  useThreadStoreActions,
} from "../stores/thread-store";
import { useStreamText } from "../use-stream-text";


export function ToolEditorDialog({
  open,
  onOpenChange,
  tool,
}: {
  open: boolean;

  onOpenChange: (open: boolean) => void;
  tool: FunctionTool | null;
}) {
  const { addTool, updateTool } = useThreadStoreActions();
  const { t } = useI18n();
  const threadModel = useThreadStore((s) => s.thread.model);
  const [text, setText] = useState("");
  const [originalName, setOriginalName] = useState<string | null>(null);
  // Track the last (open, tool) we initialized from so we can reinitialize
  // during render instead of in an effect.
  const [prevOpen, setPrevOpen] = useState(false);
  const [prevTool, setPrevTool] = useState(tool);

  // Reinitialize the editor when the dialog opens or the edited tool changes.
  // Adjusting during render (not via useEffect) avoids a stale frame between
  // the two commits. See https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  if (open !== prevOpen || tool !== prevTool) {
    setPrevOpen(open);
    setPrevTool(tool);
    if (open) {
      setOriginalName(tool ? tool.name : null);
      setText(JSON.stringify(tool ?? DEFAULT_TOOL, null, 2));
    }
  }

  const {
    text: generated,
    streaming,
    run: generate,
  } = useStreamText({
    systemPrompt: metaToolPrompt,
    reasoning: "off",
    // Use the thread's own model (id/provider only) when it has one.
    model: threadModel
      ? { id: threadModel.id, provider: threadModel.provider }
      : undefined,
  });

  // Stream the generated definition straight into the editor.
  useEffect(() => {
    if (generated) {
      setText(generated);
    }
  }, [generated]);

  const handleExampleSelect = (example: FunctionTool) => {
    setText(JSON.stringify(example, null, 2));
  };

  const handleGenerate = (prompt: string) => {
    // Feed the current definition (if any) as a prior assistant turn, so the
    // model refines it in response to the user's request.
    const original = text.trim();
    const messages: Message[] = original
      ? [
          {
            id: uuid(),
            role: "assistant",
            content: [
              { type: "text", text: `<original>\n${original}\n</original>` },
            ],
          },
        ]
      : [];
    void generate({
      messages,
      userPrompt: `<user-input>\n${prompt}\n</user-input>`,
    });
  };

  const handleSave = () => {
    let parsed: FunctionTool;
    try {
      const normalized = normalizeTool(parseJSON(text));
      if (normalized.type !== "function") {
        toast.error(t.playground.tools.error, {
          description: t.playground.tools.mcpToolsCannotBeEdited,
        });
        return;
      }
      parsed = normalized;
    } catch {
      toast.error(t.playground.tools.error, {
        description: t.playground.tools.invalidJson,
      });
      return;
    }

    const success = originalName
      ? updateTool(originalName, parsed)
      : addTool(parsed);

    if (success) {
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex h-[75vh]! max-h-[calc(100dvh-2rem)] w-full flex-col gap-4 overflow-hidden sm:max-w-4xl"
        onInteractOutside={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <DialogHeader className="shrink-0">
          <DialogTitle>
            {originalName
              ? t.playground.tools.editFunctionTool
              : t.playground.tools.addFunctionTool}
          </DialogTitle>
          <DialogDescription>
            {t.playground.tools.functionToolDescription}
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-medium">
              {t.playground.tools.definition}
            </div>
            <div className="flex items-center gap-2">
              <GeneratePopoverButton
                placeholder={t.playground.tools.generateFunctionPlaceholder}
                onGenerate={handleGenerate}
              />
              <ExamplesMenu
                items={TOOL_EXAMPLES}
                onSelect={(example) => handleExampleSelect(example.tool)}
              />
            </div>
          </div>
          <CodeEditor
            className="min-h-0 flex-1 font-mono text-sm"
            language="json"
            value={text}
            autoFocus
            readonly={streaming}
            onChange={setText}
          />
        </div>

        <DialogFooter className="shrink-0">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t.playground.tools.cancel}
          </Button>
          <Button onClick={handleSave}>
            {tool ? t.playground.tools.save : t.playground.tools.create}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
