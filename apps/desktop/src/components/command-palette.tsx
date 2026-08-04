"use client";

import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@llm-space/ui/ui/command";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { executePluginCommand, listPluginCommands } from "@/client/plugins";
import { useCommands } from "@/commands";
import { electrobun } from "@/lib/electrobun";
import {
  COMMAND_META,
  type Command as AppCommand,
  type CommandType,
} from "@/shared/commands";

/**
 * The ⌘⇧P command palette. Lists every registered command (from
 * {@link COMMAND_META}) and runs the selected one. Commands are shown by
 * label only — no icons, no shortcuts. Pass `blacklist` to hide commands that
 * need context the palette can't provide (e.g. a file path).
 */
export function CommandPalette({
  open,
  onOpenChange,
  blacklist = [],
  onSaveTo,
  onImportFrom,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  blacklist?: string[];
  onSaveTo?: () => void;
  onImportFrom?: () => void;
}) {
  const { executeCommand } = useCommands();
  const [pluginCommands, setPluginCommands] = useState<
    Awaited<ReturnType<typeof listPluginCommands>>
  >([]);

  useEffect(() => {
    if (!open) return;
    const refresh = () => {
      void listPluginCommands()
        .then(setPluginCommands)
        .catch((error) =>
          toast.error(error instanceof Error ? error.message : String(error))
        );
    };
    refresh();
    const rpc = electrobun.rpc;
    rpc?.addMessageListener("pluginsChanged", refresh);
    return () => rpc?.removeMessageListener("pluginsChanged", refresh);
  }, [open]);

  const types = (Object.keys(COMMAND_META) as CommandType[]).filter(
    (type) => !blacklist.includes(type)
  );

  const run = (type: CommandType) => {
    onOpenChange(false);
    // Palette commands run with default (empty) args; context-dependent ones
    // are expected to be filtered out via `blacklist`.
    executeCommand({ type, args: {} } as AppCommand);
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <Command>
        <CommandInput placeholder="Search commands..." />
        <CommandList>
          <CommandEmpty>No commands found.</CommandEmpty>
          {types.map((type) => (
            <CommandItem key={type} onSelect={() => run(type)}>
              {COMMAND_META[type].label}
            </CommandItem>
          ))}
          {onSaveTo ? (
            <CommandItem
              value="Save to Thread Storage"
              onSelect={() => {
                onOpenChange(false);
                onSaveTo();
              }}
            >
              Save to…
            </CommandItem>
          ) : null}
          {onImportFrom ? (
            <CommandItem
              value="Import from Thread Storage"
              onSelect={() => {
                onOpenChange(false);
                onImportFrom();
              }}
            >
              Import from…
            </CommandItem>
          ) : null}
          {pluginCommands.map((command) => (
            <CommandItem
              key={command.id}
              value={`${command.displayName} ${command.description ?? ""}`}
              onSelect={() => {
                onOpenChange(false);
                void executePluginCommand(command.id).catch((error) =>
                  toast.error(
                    error instanceof Error ? error.message : String(error)
                  )
                );
              }}
            >
              {command.displayName}
            </CommandItem>
          ))}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
