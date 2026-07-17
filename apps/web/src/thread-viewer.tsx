import type {
  SharedThread,
  SharedThreadMeta,
  SharedThreadSource,
  ThreadConnector,
} from "@llm-space/core";
import { readLatestThread } from "@llm-space/core/storage";
import { ThreadPlayground } from "@llm-space/ui/components/thread-playground";
import { Tooltip } from "@llm-space/ui/components/tooltip";
import { Button } from "@llm-space/ui/ui/button";
import {
  ExpandIcon,
  ExternalLinkIcon,
  FileJsonIcon,
  Loader2Icon,
  ShrinkIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { SiteHeader } from "@/components/site-header";
import { openInApp } from "@/lib/open-in-app";
import { NotFound } from "@/not-found";

/** `llm-space://shared/{connectorId}/threads/{threadId}` — desktop deep link. */
function deepLink(connectorId: string, threadId: string): string {
  return `llm-space://shared/${connectorId}/threads/${threadId}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function hasReadShared(
  storage: ThreadConnector["storage"]
): storage is ThreadConnector["storage"] & SharedThreadSource {
  return "readShared" in storage;
}

/** Read the shared thread + display metadata through the connector. */
async function loadShared(
  connector: ThreadConnector,
  threadId: string
): Promise<SharedThread> {
  if (hasReadShared(connector.storage)) {
    return connector.storage.readShared(threadId);
  }
  // Fallback: a connector without shared metadata still yields the thread.
  const thread = await readLatestThread(connector.storage, threadId);
  return {
    thread,
    meta: { connectorId: connector.connectorId, threadId, title: thread.title },
  };
}

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; shared: SharedThread };

export function ThreadViewer({
  connector,
  threadId,
}: {
  connector: ThreadConnector;
  threadId: string;
}) {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [fullscreen, setFullscreen] = useState(false);
  const navigate = useNavigate();

  // Try to hand off to the installed desktop app; if it doesn't take over
  // within the timeout, fall back to the homepage (where the download lives).
  const openApp = () =>
    openInApp(deepLink(connector.connectorId, threadId), () => navigate("/"));

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    loadShared(connector, threadId)
      .then((shared) => {
        if (!cancelled) setState({ status: "ready", shared });
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
  }, [connector, threadId]);

  // Let Escape leave full screen.
  useEffect(() => {
    if (!fullscreen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFullscreen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [fullscreen]);

  if (state.status === "loading") {
    return (
      <div className="dark flex h-dvh items-center justify-center gap-2 bg-[#08080a] text-sm text-neutral-400">
        <Loader2Icon className="size-4 animate-spin" />
        Loading shared thread…
      </div>
    );
  }
  if (state.status === "error") {
    return <NotFound message={state.message} />;
  }

  const { thread, meta } = state.shared;
  const headerActions = (
    <div className="flex items-center gap-2">
      {fullscreen ? (
        <Button size="sm" onClick={openApp}>
          Open in LLM Space
          <ExternalLinkIcon className="size-3.5" />
        </Button>
      ) : null}
      <Tooltip content={fullscreen ? "Exit full screen" : "Full screen"}>
        <Button
          variant="ghost"
          size="icon-lg"
          aria-label={fullscreen ? "Exit full screen" : "Enter full screen"}
          aria-pressed={fullscreen}
          onClick={() => setFullscreen((value) => !value)}
        >
          {fullscreen ? (
            <ShrinkIcon className="size-4" />
          ) : (
            <ExpandIcon className="size-4" />
          )}
        </Button>
      </Tooltip>
    </div>
  );
  const playground = (
    <ThreadPlayground
      className={
        fullscreen
          ? "size-full overflow-hidden"
          : "size-full overflow-hidden rounded-xl border shadow-lg"
      }
      path={`shared/${connector.connectorId}/threads/${threadId}`}
      title={meta.title}
      readonly
      initialValue={thread}
      headerActions={headerActions}
    />
  );
  return (
    <div className="dark flex h-dvh flex-col bg-[#08080a] text-[#ededf0]">
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col px-6 min-h-0 sm:px-10">
        <SharedThreadMetaBlock meta={meta} onOpenApp={openApp} />
        <div className="min-h-0 flex-1 pb-6">
          <div
            className={
              fullscreen ? "fixed inset-0 z-50 bg-[#08080a]" : "h-full"
            }
          >
            {playground}
          </div>
        </div>
      </main>
    </div>
  );
}

function SharedThreadMetaBlock({
  meta,
  onOpenApp,
}: {
  meta: SharedThreadMeta;
  onOpenApp: () => void;
}) {
  return (
    <section className="flex shrink-0 flex-col gap-6 py-5 sm:flex-row sm:items-start sm:justify-between">
      <div className="space-y-2">
        <div className="text-xs font-medium tracking-widest text-neutral-500 uppercase">
          Shared thread
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-white">
          {meta.title ?? "Untitled thread"}
        </h1>
        {meta.description ? (
          <p className="max-w-2xl text-sm text-neutral-400">
            {meta.description}
          </p>
        ) : null}
        {meta.filename ? (
          meta.rawUrl ? (
            <a
              href={meta.rawUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-neutral-500 hover:text-neutral-300 hover:underline"
            >
              <FileJsonIcon className="size-3.5" />
              {meta.filename}
            </a>
          ) : (
            <div className="flex items-center gap-1.5 text-xs text-neutral-500">
              <FileJsonIcon className="size-3.5" />
              {meta.filename}
            </div>
          )
        ) : null}
      </div>

      <div className="flex flex-col items-start gap-4 sm:items-end">
        {meta.updatedAt ? (
          <Tooltip
            content={
              meta.createdAt
                ? `Created ${formatDateTime(meta.createdAt)}`
                : undefined
            }
          >
            <span className="text-xs text-neutral-500">
              Last updated {formatDate(meta.updatedAt)}
            </span>
          </Tooltip>
        ) : null}
        {meta.author ? (
          <a
            href={meta.author.profileUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 text-sm text-neutral-300 hover:text-white"
          >
            {meta.author.avatarUrl ? (
              <img
                src={meta.author.avatarUrl}
                alt=""
                className="size-8 rounded-full border border-white/10"
              />
            ) : null}
            <span>
              Shared by{" "}
              <span className="font-medium text-white">{meta.author.name}</span>
            </span>
          </a>
        ) : null}
        <Button size="lg" onClick={onOpenApp}>
          Open in LLM Space
          <ExternalLinkIcon className="size-4" />
        </Button>
      </div>
    </section>
  );
}
