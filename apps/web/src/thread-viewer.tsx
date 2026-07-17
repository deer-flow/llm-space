import type { Thread } from "@llm-space/core";
import { ThreadPlayground } from "@llm-space/ui/components/thread-playground";
import { Button } from "@llm-space/ui/ui/button";
import { DownloadIcon, Loader2Icon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

interface GistFile {
  filename?: string;
  content?: string;
  truncated?: boolean;
  raw_url?: string;
}

/**
 * Fetch a shared thread from a public/secret gist. Anonymous read — no auth. The
 * GitHub API returns the file list; we pick the first `.json` file and parse it
 * (following `raw_url` when the inline content was truncated).
 */
async function fetchGistThread(gistId: string): Promise<Thread> {
  const res = await fetch(`https://api.github.com/gists/${gistId}`, {
    headers: { Accept: "application/vnd.github+json" },
  });
  if (!res.ok) {
    throw new Error(`Couldn't load this gist (HTTP ${res.status}).`);
  }
  const gist = (await res.json()) as { files?: Record<string, GistFile> };
  const files = Object.values(gist.files ?? {});
  const file = files.find((f) => f.filename?.endsWith(".json")) ?? files[0];
  if (!file) {
    throw new Error("This gist has no readable file.");
  }
  const content =
    file.truncated && file.raw_url
      ? await (await fetch(file.raw_url)).text()
      : (file.content ?? "");
  try {
    return JSON.parse(content) as Thread;
  } catch {
    throw new Error("This gist is not a valid thread file.");
  }
}

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; thread: Thread };

export function ThreadViewer({ gistId }: { gistId: string }) {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    fetchGistThread(gistId)
      .then((thread) => {
        if (!cancelled) setState({ status: "ready", thread });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({
            status: "error",
            message:
              error instanceof Error ? error.message : "Failed to load.",
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [gistId]);

  const download = useMemo(() => {
    if (state.status !== "ready") return undefined;
    return () => {
      const blob = new Blob([JSON.stringify(state.thread, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "thread.json";
      a.click();
      URL.revokeObjectURL(url);
    };
  }, [state]);

  if (state.status === "loading") {
    return (
      <div className="text-muted-foreground flex h-dvh items-center justify-center gap-2 text-sm">
        <Loader2Icon className="size-4 animate-spin" />
        Loading shared thread…
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-2 px-6 text-center">
        <div className="text-sm font-medium">
          Couldn&apos;t open this thread
        </div>
        <div className="text-muted-foreground text-xs">{state.message}</div>
      </div>
    );
  }

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex shrink-0 items-center justify-between border-b px-4 py-2">
        <span className="text-sm font-medium">Shared thread</span>
        <Button size="sm" variant="outline" onClick={download}>
          <DownloadIcon className="size-3.5" />
          Download thread.json
        </Button>
      </header>
      <div className="min-h-0 flex-1">
        <ThreadPlayground
          path={`shared/${gistId}`}
          readonly
          initialValue={state.thread}
        />
      </div>
    </div>
  );
}
