"use client";

import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@llm-space/ui/ui/command";

import { useCommands } from "@/commands";
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
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  blacklist?: string[];
}) {
  const { executeCommand } = useCommands();

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
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
