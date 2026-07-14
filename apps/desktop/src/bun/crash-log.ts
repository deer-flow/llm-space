/* Crash visibility for GUI launches. Electrobun's own `uncaughtException`
   handler prints to stderr — which GUI launches discard (the Windows launcher
   spawns bun.exe with no console and no redirection) — and then force-exits,
   so a startup crash leaves no trace anywhere. `prependListener` runs these
   loggers BEFORE that handler regardless of registration order.

   This module must stay self-contained (node builtins only) and inert on
   import beyond registering the listeners: it is the very first import in
   `bun/index.ts`, so it cannot rely on `env/hydrate` having run (paths resolve
   lazily at crash time, never at import time), and it must survive the rest of
   the module graph failing to load — that is exactly the crash class it exists
   to record. The home resolution mirrors `getLlmSpaceHomePath()` in
   `@llm-space/core/server`; importing that would put the whole server graph in
   front of both this logger and `env/hydrate`. The log lives under the user
   data root, outside the install dir, so it survives self-updates and
   uninstalls. */
import { appendFileSync, mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";

function logsDir(): string {
  if (process.env.LLM_SPACE_HOME) {
    return path.join(process.env.LLM_SPACE_HOME, "logs");
  }
  if (process.platform === "win32") {
    const appData =
      process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming");
    return path.join(appData, "llm-space", "logs");
  }
  return path.join(os.homedir(), ".llm-space", "logs");
}

function logCrash(kind: string, error: unknown): void {
  try {
    const dir = logsDir();
    mkdirSync(dir, { recursive: true });
    const detail =
      error instanceof Error ? (error.stack ?? String(error)) : String(error);
    appendFileSync(
      path.join(dir, "startup-crash.log"),
      `${new Date().toISOString()} ${kind}: ${detail}\n`,
      "utf8"
    );
  } catch {
    // The logger must never become the crash: an unwritable log dir just
    // loses the entry.
  }
}

process.prependListener("uncaughtException", (error) => {
  logCrash("uncaughtException", error);
});

process.prependListener("unhandledRejection", (reason) => {
  logCrash("unhandledRejection", reason);
});
