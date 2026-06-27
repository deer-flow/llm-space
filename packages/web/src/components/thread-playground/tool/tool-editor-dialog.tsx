"use client";

import { parseJSON, type FunctionTool } from "@llm-space/core";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { CodeEditor } from "@/components/code-editor";
import { useThreadStoreActions } from "@/stores/thread-store";

import { Button } from "../../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../ui/dialog";

const DEFAULT_TOOL: FunctionTool = {
  name: "weather_report",
  description: "Get the weather report for a given location",
  parameters: {
    type: "object",
    properties: {
      location: {
        type: "string",
        description: "The location to get the weather report for",
      },
    },
    required: ["location"],
  },
};

export function ToolEditorDialog({
  open,
  onOpenChange,
  tool,
}: {
  open: boolean;
  // eslint-disable-next-line no-unused-vars
  onOpenChange: (open: boolean) => void;
  tool: FunctionTool | null;
}) {
  const { addTool, updateTool } = useThreadStoreActions();
  const [text, setText] = useState("");
  const [originalName, setOriginalName] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    if (tool) {
      setOriginalName(tool.name);
      setText(JSON.stringify(tool, null, 2));
    } else {
      setOriginalName(null);
      setText(JSON.stringify(DEFAULT_TOOL, null, 2));
    }
  }, [open, tool]);

  const handleSave = () => {
    let parsed: FunctionTool;
    try {
      parsed = parseJSON<FunctionTool>(text);
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
      <DialogContent className="flex max-h-[85vh] w-full flex-col gap-4 sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{originalName ? "Edit tool" : "Add tool"}</DialogTitle>
          <DialogDescription>
            The model will intelligently decide to call functions based on input
            it receives from the user.
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-2">
          <div className="text-sm font-medium">Definition</div>
          <CodeEditor
            className="min-h-80 flex-1 font-mono text-sm"
            language="json"
            value={text}
            autoFocus
            onChange={setText}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave}>{tool ? "Save" : "Create"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
