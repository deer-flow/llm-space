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

import { listPluginCommands } from "@/client/plugins";
import type { PluginActiveTab } from "@/client/plugins";
import { useCommands } from "@/commands";
import { useI18n } from "@/i18n/i18n-provider";
import { electrobun } from "@/lib/electrobun";
import { commandLabel, commandLabels } from "@/shared/command-labels";
import {
  COMMAND_META,
  type Command as AppCommand,
  type CommandType,
} from "@/shared/commands";

import { usePluginCommandExecution } from "./plugin-command-execution-provider";
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
  const { lang, t } = useI18n();
  const { runPluginCommand } = usePluginCommandExecution();
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
      // Match in either language so an English query still finds a command
      // while the UI is in Chinese, and vice versa.
      commandLabels(type).some((label) => matchesCommandText(label, search))
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
          placeholder={t.palette.placeholder}
          value={search}
          onValueChange={setSearch}
        />
        <CommandList>
          <CommandEmpty>{t.palette.empty}</CommandEmpty>
          {types.map((type) => (
            <CommandItem key={type} onSelect={() => run(type)}>
              {commandLabel(type, lang)}
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
              {t.palette.saveTo}
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
              {t.palette.importFrom}
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
                runPluginCommand({
                  command,
                  activeTab,
                  arguments: args,
                  writeActiveTabThread,
                });
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
