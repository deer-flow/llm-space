import type { RuntimeClient } from "@llm-space/runtime/runtime";

import type { RuntimeId } from "../../shared/runtime";

type PromptFileRuntime = Pick<
  RuntimeClient,
  "readTextFile" | "textFileExists"
>;

interface PromptFileParams {
  runtimeId: RuntimeId;
  path: string;
}

/** Build the exact Desktop RPC handlers for runtime-owned prompt files. */
export function createPromptFileRpcHandlers(
  getRuntime: (runtimeId: RuntimeId) => PromptFileRuntime
) {
  const getOwnedRuntime = (runtimeId: RuntimeId) => {
    if (!runtimeId) {
      throw new Error("Prompt file runtimeId is required.");
    }
    return getRuntime(runtimeId);
  };

  return {
    fsReadText: async ({ runtimeId, path }: PromptFileParams) => ({
      text: await getOwnedRuntime(runtimeId).readTextFile(path),
    }),
    fsTextFileExists: async ({ runtimeId, path }: PromptFileParams) => ({
      exists: await getOwnedRuntime(runtimeId).textFileExists(path),
    }),
  };
}
