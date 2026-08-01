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
        toast.error("Error", {
          description: "MCP tools cannot be edited as function tools",
        });
        return;
      }
      parsed = normalized;
    } catch {
      toast.error("Error", { description: "Invalid JSON" });
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
        className="flex h-[75vh]! w-full flex-col gap-4 sm:max-w-4xl"
        onInteractOutside={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>
            {originalName ? "Edit tool" : "Add function tool"}
          </DialogTitle>
          <DialogDescription>
            A function tool consists of a name, description, and parameters.
            Parameters are defined using JSON Schema. Since the tool is
            customized, you need to provide a response at runtime.
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-medium">Definition</div>
            <div className="flex items-center gap-2">
              <GeneratePopoverButton
                placeholder="Describe what your function does (or paste your function declaration code), and we'll generate a definition."
                onGenerate={handleGenerate}
              />
              <ExamplesMenu
                items={TOOL_EXAMPLES}
                onSelect={(example) => handleExampleSelect(example.tool)}
              />
            </div>
          </div>
          <CodeEditor
            className="min-h-80 flex-1 font-mono text-sm"
            language="json"
            value={text}
            autoFocus
            readonly={streaming}
            onChange={setText}
          />
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave}>{tool ? "Save" : "Create"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
