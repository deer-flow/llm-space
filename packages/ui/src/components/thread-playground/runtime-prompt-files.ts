import type { FilesHost } from "../../host/types";

export interface RuntimePromptFiles {
  loadFile: (path: string) => Promise<string>;
  fileExists: (path: string) => Promise<boolean>;
}

/** Bind every prompt-file access to the runtime that owns the thread. */
export function createRuntimePromptFiles(
  files: FilesHost,
  runtimeId: string
): RuntimePromptFiles {
  if (!runtimeId) {
    throw new Error("Prompt file runtimeId is required.");
  }
  const options = { runtimeId };
  return {
    loadFile: (path) => files.readText(path, options),
    fileExists: (path) => files.exists(path, options),
  };
}
