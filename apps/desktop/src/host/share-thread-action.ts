import type { Command } from "@/shared/commands";
import type { RuntimeId } from "@/shared/runtime";
import { buildShareThreadCommand } from "@/shared/share";

interface HostShareThreadInput {
  path: string;
  runtimeId: RuntimeId;
}

function _isRuntimeId(value: unknown): value is RuntimeId {
  return (
    value === "local" ||
    (typeof value === "string" &&
      value.startsWith("remote:") &&
      value.length > "remote:".length)
  );
}

function _isHostShareThreadInput(
  input: unknown
): input is HostShareThreadInput {
  if (typeof input !== "object" || input === null) return false;
  const candidate = input as { path?: unknown; runtimeId?: unknown };
  return (
    typeof candidate.path === "string" && _isRuntimeId(candidate.runtimeId)
  );
}

/** Adapt the shared UI HostAction into the desktop command boundary. */
export function createDesktopShareThreadAction(
  executeCommand: (command: Command) => void
): (input: unknown) => void {
  return (input) => {
    if (!_isHostShareThreadInput(input)) {
      throw new Error("Invalid Share thread host action");
    }
    executeCommand(buildShareThreadCommand(input.path, input.runtimeId));
  };
}
