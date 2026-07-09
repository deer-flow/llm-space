"use client";

import { memo } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../../ui/dialog";

import {
  SystemPromptVariablesPanel,
  type PromptVariableSelection,
} from "./system-prompt-variables-panel";

interface SystemPromptVariablesDialogProps {
  open: boolean;
  disabled?: boolean;
  initialSelection?: PromptVariableSelection | null;
  onOpenChange: (open: boolean) => void;
}

function _SystemPromptVariablesDialog({
  open,
  disabled,
  initialSelection,
  onOpenChange,
}: SystemPromptVariablesDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex h-[620px] max-h-[calc(100vh-4rem)] w-[min(920px,calc(100vw-2rem))] max-w-none! flex-col gap-0 overflow-hidden p-0"
        onInteractOutside={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <DialogHeader className="border-border/70 shrink-0 border-b px-4 py-3 pr-10">
          <DialogTitle>Variables</DialogTitle>
          <DialogDescription>
            Use `{"{{variable_name}}"}` as placeholder in your prompt, messages
            and tool results to reference the variable. e.g. `
            {"{{current_date}}"}` will be replaced with the current date.
          </DialogDescription>
        </DialogHeader>
        <SystemPromptVariablesPanel
          className="min-h-0 grow"
          disabled={disabled}
          initialSelection={initialSelection}
        />
      </DialogContent>
    </Dialog>
  );
}

export const SystemPromptVariablesDialog = memo(_SystemPromptVariablesDialog);
