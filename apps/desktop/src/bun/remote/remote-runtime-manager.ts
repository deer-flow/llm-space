import type { RuntimeRouter } from "@llm-space/runtime/runtime";

import { RemoteRuntimeClient } from "./remote-runtime-client";
import { readManualRemoteRuntimeConfig } from "./remote-runtime-config";
import { readSshRemoteRuntimeConfig } from "./ssh-bootstrap-config";
import { startSshRemoteRuntime } from "./ssh-remote-runtime";

export interface RegisteredRemoteRuntime {
  client: RemoteRuntimeClient;
  stop(): Promise<void> | void;
}

export async function registerConfiguredRemoteRuntime({
  env,
  runtimeRouter,
}: {
  env: NodeJS.ProcessEnv;
  runtimeRouter: RuntimeRouter;
}): Promise<RegisteredRemoteRuntime | null> {
  const sshConfig = readSshRemoteRuntimeConfig(env);
  if (sshConfig) {
    const handle = await startSshRemoteRuntime(sshConfig);
    runtimeRouter.register(sshConfig.id, handle.client);
    if (sshConfig.makeDefault) {
      runtimeRouter.setDefaultRuntime(sshConfig.id);
    }
    return handle;
  }

  const config = readManualRemoteRuntimeConfig(env);
  if (!config) {
    return null;
  }
  const client = new RemoteRuntimeClient(config);
  try {
    await client.connect();
  } catch (error) {
    throw new Error(
      `Failed to connect remote runtime ${config.id} at ${config.baseUrl}: ${
        error instanceof Error ? error.message : String(error)
      }`,
      { cause: error }
    );
  }
  runtimeRouter.register(config.id, client);
  if (config.makeDefault) {
    runtimeRouter.setDefaultRuntime(config.id);
  }
  return { client, stop: () => client.shutdown() };
}
