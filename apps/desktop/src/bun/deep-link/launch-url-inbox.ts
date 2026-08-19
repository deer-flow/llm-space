import { readFileSync, watchFile, unwatchFile } from "node:fs";

export interface LaunchUrlInbox {
  close(): void;
}

/**
 * Consume base64-encoded URLs written by the macOS bundle launcher.
 *
 * The launcher owns the initial Apple Event during a cold start, before Bun
 * exists. It persists each URL to a process-private file and passes its path in
 * the environment. Reading from byte zero both replays cold-start URLs and
 * follows later events without relying on renderer readiness.
 */
export function openLaunchUrlInbox(
  filePath: string | undefined,
  onUrl: (url: string) => void
): LaunchUrlInbox {
  if (!filePath) return { close: () => undefined };

  let consumedBytes = 0;
  let remainder = "";
  const consume = () => {
    let contents: Buffer;
    try {
      contents = readFileSync(filePath);
    } catch {
      return;
    }
    if (contents.length < consumedBytes) {
      consumedBytes = 0;
      remainder = "";
    }
    const next = contents.subarray(consumedBytes).toString("utf8");
    consumedBytes = contents.length;
    const lines = `${remainder}${next}`.split("\n");
    remainder = lines.pop() ?? "";
    for (const line of lines) {
      const url = decodeLaunchUrl(line);
      if (url) onUrl(url);
    }
  };

  consume();
  watchFile(filePath, { interval: 50 }, consume);
  return {
    close() {
      unwatchFile(filePath, consume);
    },
  };
}

export function decodeLaunchUrl(value: string): string | null {
  if (!value) return null;
  try {
    const url = Buffer.from(value, "base64").toString("utf8");
    return url.includes("://") ? url : null;
  } catch {
    return null;
  }
}
