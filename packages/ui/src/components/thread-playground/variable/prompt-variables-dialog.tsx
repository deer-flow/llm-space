"use client";

import { CircleHelpIcon } from "lucide-react";
import { memo } from "react";

import { useHostServices } from "@llm-space/ui/host";
import { docsUrl } from "@llm-space/ui/lib/docs-url";
import { Button } from "@llm-space/ui/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@llm-space/ui/ui/dialog";

import {
  PromptVariablesPanel,
  type PromptVariableSelection,
} from "./prompt-variables-panel";

interface PromptVariablesDialogProps {
  open: boolean;
  disabled?: boolean;
  initialSelection?: PromptVariableSelection | null;
  onOpenChange: (open: boolean) => void;
}

function _PromptVariablesDialog({
  open,
  disabled,
  initialSelection,
  onOpenChange,
}: PromptVariablesDialogProps) {
  const { actions } = useHostServices();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex h-[728px] max-h-[calc(100vh-4rem)] w-[min(1080px,calc(100vw-2rem))] max-w-none! flex-col gap-0 overflow-hidden p-0"
        onInteractOutside={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <DialogHeader className="shrink-0 border-b px-4 py-3">
          <DialogTitle>Variables</DialogTitle>
          <DialogDescription>
            Use `{"{{variable_name}}"}` as placeholder in your prompt, messages
            and tool results to reference the variable. e.g. `
            {"{{current_date}}"}` will be replaced with the current date.
          </DialogDescription>
        </DialogHeader>
        <PromptVariablesPanel
          className="min-h-0 grow"
          disabled={disabled}
          initialSelection={initialSelection}
        />
        <DialogFooter className="shrink-0 border-t px-4 py-3 sm:justify-start">
          <Button
            variant="ghost"
            onClick={() =>
              actions.openLink(docsUrl("variables-and-templates"))
            }
          >
            <CircleHelpIcon className="size-4" />
            Help
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export const PromptVariablesDialog = memo(_PromptVariablesDialog);
