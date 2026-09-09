import { DropdownMenuItem } from "@llm-space/ui/ui/dropdown-menu";
import { Share2 } from "lucide-react";

import type { Command } from "@/shared/commands";
import type { RuntimeId } from "@/shared/runtime";
import { buildShareThreadCommand } from "@/shared/share";

/**
 * The file-tree consumer that binds a selected path to its owning runtime.
 * Hook-free by design (tests invoke it directly); the label arrives from the
 * localized parent menu.
 */
export function ShareThreadMenuItem({
  path,
  runtimeId,
  label,
  executeCommand,
}: {
  path: string;
  runtimeId: RuntimeId;
  label: string;
  executeCommand: (command: Command) => void;
}) {
  return (
    <DropdownMenuItem
      onSelect={() => executeCommand(buildShareThreadCommand(path, runtimeId))}
    >
      <Share2 />
      {label}
    </DropdownMenuItem>
  );
}
