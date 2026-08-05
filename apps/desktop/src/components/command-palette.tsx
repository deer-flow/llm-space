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
import type { PluginActiveTab } from "@/client/plugins";
import { useCommands } from "@/commands";
import { electrobun } from "@/lib/electrobun";
import {
  COMMAND_META,
  type Command as AppCommand,
  type CommandType,
} from "@/shared/commands";

import {
  matchesCommandText,
  parsePluginCommandInvocation,
  pluginCommandQualifiedName,
} from "./plugin-command-input";

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
  getActiveTab,
  writeActiveTabThread,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  blacklist?: string[];
  onSaveTo?: () => void;
  onImportFrom?: () => void;
  getActiveTab: () => PluginActiveTab | null;
  writeActiveTabThread: (
    target: PluginActiveTab,
    thread: PluginActiveTab["thread"]
  ) => Promise<void>;
}) {
  const { executeCommand } = useCommands();
  const [pluginCommands, setPluginCommands] = useState<
    Awaited<ReturnType<typeof listPluginCommands>>
  >([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!open) return;
    setSearch("");
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
    (type) =>
      !blacklist.includes(type) &&
      matchesCommandText(COMMAND_META[type].label, search)
  );
  const visiblePluginCommands = pluginCommands.filter((command) => {
    try {
      return (
        parsePluginCommandInvocation(search, command) !== null ||
        matchesCommandText(
          `${command.displayName} ${command.description ?? ""} ${pluginCommandQualifiedName(command)}`,
          search
        )
      );
    } catch {
      // Keep the targeted command visible while the user finishes a quote.
      return true;
    }
  });

  const run = (type: CommandType) => {
    onOpenChange(false);
    // Palette commands run with default (empty) args; context-dependent ones
    // are expected to be filtered out via `blacklist`.
    executeCommand({ type, args: {} } as AppCommand);
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <Command shouldFilter={false}>
        <CommandInput
          placeholder="Search commands or enter arguments..."
          value={search}
          onValueChange={setSearch}
        />
        <CommandList>
          <CommandEmpty>No commands found.</CommandEmpty>
          {types.map((type) => (
            <CommandItem key={type} onSelect={() => run(type)}>
              {COMMAND_META[type].label}
            </CommandItem>
          ))}
          {onSaveTo && matchesCommandText("Save to", search) ? (
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
          {onImportFrom && matchesCommandText("Import from", search) ? (
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
          {visiblePluginCommands.map((command) => (
            <CommandItem
              key={command.id}
              value={`${command.displayName} ${command.description ?? ""} ${pluginCommandQualifiedName(command)}`}
              onSelect={() => {
                let args: string[];
                try {
                  args = parsePluginCommandInvocation(search, command) ?? [];
                } catch (error) {
                  toast.error(
                    error instanceof Error ? error.message : String(error)
                  );
                  return;
                }
                onOpenChange(false);
                const activeTab = getActiveTab();
                void executePluginCommand(
                  command.id,
                  activeTab
                    ? {
                        filename: activeTab.filename,
                        thread: activeTab.thread,
                      }
                    : null,
                  args
                )
                  .then(async ({ activeTabThreadUpdate }) => {
                    if (activeTabThreadUpdate === undefined) return;
                    if (!activeTab) {
                      throw new Error(
                        "Plugin Command cannot write without an active tab."
                      );
                    }
                    await writeActiveTabThread(
                      activeTab,
                      activeTabThreadUpdate
                    );
                  })
                  .catch((error) =>
                    toast.error(
                      error instanceof Error ? error.message : String(error)
                    )
                  );
              }}
            >
              <div className="flex min-w-0 flex-col">
                <span className="truncate">{command.displayName}</span>
                <span className="text-muted-foreground truncate text-xs">
                  {pluginCommandQualifiedName(command)}
                </span>
              </div>
            </CommandItem>
          ))}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
