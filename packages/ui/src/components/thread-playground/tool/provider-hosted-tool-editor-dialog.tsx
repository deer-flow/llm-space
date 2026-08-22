"use client";

import {
  getToolKey,
  type ProviderHostedTool,
  type ProviderHostedToolConfig,
} from "@llm-space/core";
import { useRef, useState } from "react";
import { toast } from "sonner";

import {
  CodeEditor,
  type CodeEditorHandle,
} from "@llm-space/ui/components/code-editor";
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

import { useThreadStoreActions } from "../stores/thread-store";

import { parseProviderHostedToolConfig } from "./provider-hosted-tool-config";

const DEFAULT_PROVIDER_HOSTED_TOOL_CONFIG: ProviderHostedToolConfig = {
  type: "web_search",
};

export function ProviderHostedToolEditorDialog({
  open,
  onOpenChange,
  tool,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tool: ProviderHostedTool | null;
}) {
  const { addTool, updateTool } = useThreadStoreActions();
  const { t } = useI18n();
  const editorRef = useRef<CodeEditorHandle>(null);
  const [text, setText] = useState("");
  const [originalKey, setOriginalKey] = useState<string | null>(null);
  const [prevOpen, setPrevOpen] = useState(false);
  const [prevTool, setPrevTool] = useState(tool);

  if (open !== prevOpen || tool !== prevTool) {
    setPrevOpen(open);
    setPrevTool(tool);
    if (open) {
      setOriginalKey(tool ? getToolKey(tool) : null);
      setText(
        JSON.stringify(
          tool?.config ?? DEFAULT_PROVIDER_HOSTED_TOOL_CONFIG,
          null,
          2
        )
      );
    }
  }

  const handleSave = () => {
    let config: ProviderHostedToolConfig;
    try {
      config = parseProviderHostedToolConfig(
        editorRef.current?.getValue() ?? text
      );
    } catch (error) {
      toast.error(t.playground.tools.invalidProviderHostedConfig, {
        description:
          error instanceof Error
            ? error.message
            : t.playground.tools.invalidConfiguration,
      });
      return;
    }
    const nextTool: ProviderHostedTool = {
      type: "provider-hosted",
      config,
    };
    const saved = originalKey
      ? updateTool(originalKey, nextTool)
      : addTool(nextTool);
    if (saved) {
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex h-[65vh]! max-h-[calc(100dvh-2rem)] w-full flex-col gap-4 overflow-hidden sm:max-w-3xl"
        onInteractOutside={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
      >
        <DialogHeader className="shrink-0">
          <DialogTitle>
            {tool
              ? t.playground.tools.editProviderHostedTool
              : t.playground.tools.addProviderHostedTool}
          </DialogTitle>
          <DialogDescription>
            {t.playground.tools.providerHostedDescription}
          </DialogDescription>
        </DialogHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-2">
          <div className="text-sm font-medium">
            {t.playground.tools.configuration}
          </div>
          <CodeEditor
            ref={editorRef}
            className="min-h-0 flex-1 font-mono text-sm"
            language="json"
            value={text}
            autoFocus
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
