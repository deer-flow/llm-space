"use client";


import { useState } from "react";
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

/**
 * The JSON Schema seeded into the editor when none is configured yet.
 * `additionalProperties: false` keeps it valid for OpenAI strict mode.
 */
export const DEFAULT_JSON_SCHEMA: object = {
  type: "object",
  properties: {},
  required: [],
  additionalProperties: false,
};

/**
 * A modal editor for the structured-output JSON Schema. Editing lives here
 * rather than inline in the model params popover so there is room for a real
 * `CodeEditor` — the same JSON editing experience as the tool editor: validate
 * on save, toast on invalid JSON, and commit only a well-formed object.
 */
export function JsonSchemaDialog({
  open,
  onOpenChange,
  schema,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schema: object | undefined;
  onSave: (schema: object) => void;
}) {
  const [text, setText] = useState("");
  // Reinitialize the editor when the dialog opens (adjust during render, not in
  // an effect, to avoid a stale frame). See ToolEditorDialog for the pattern.
  const [prevOpen, setPrevOpen] = useState(false);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setText(JSON.stringify(schema ?? DEFAULT_JSON_SCHEMA, null, 2));
    }
  }

  const handleSave = () => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      toast.error("Error", { description: "Invalid JSON" });
      return;
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      toast.error("Error", { description: "Schema must be a JSON object" });
      return;
    }
    onSave(parsed);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex h-[75vh]! w-full flex-col gap-4 sm:max-w-4xl"
        onInteractOutside={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Edit response schema</DialogTitle>
          <DialogDescription>
            The model constrains its response to this JSON Schema. Support and
            strictness vary by provider.
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-2">
          <CodeEditor
            className="min-h-80 flex-1 font-mono text-sm"
            language="json"
            value={text}
            autoFocus
            onChange={setText}
          />
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
