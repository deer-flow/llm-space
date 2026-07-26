import desktopPackageJson from "../../desktop/package.json";

import { helpText, parseArgs } from "./args";
import { startHttpServer } from "./http-server";
import { createServerRuntime } from "./runtime-factory";

async function main(): Promise<void> {
  let args;
  try {
    args = parseArgs(Bun.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    console.error(helpText());
    process.exit(1);
  }

  if (args.help) {
    console.info(helpText());
    return;
  }

  const runtime = await createServerRuntime(args.home);
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    await server.stop(true);
    await runtime.stop();
    process.exit(0);
  };

  const server = startHttpServer({
    host: args.host,
    port: args.port,
    token: args.token,
    runtime,
    version: desktopPackageJson.version,
    onShutdown: () => void stop(),
  });

  console.info(
    `llm-space-server listening on http://${server.hostname}:${server.port}`
  );
  console.info(`home: ${runtime.homePath}`);
  console.info(`workspace: ${runtime.workspacePath}`);

  process.on("SIGINT", () => void stop());
  process.on("SIGTERM", () => void stop());
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
