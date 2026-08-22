import type {
  SharedThread,
  SharedThreadMeta,
  SharedThreadSource,
  ThreadConnector,
} from "@llm-space/core";
import { readLatestThread } from "@llm-space/core/storage";
import { ThreadPlayground } from "@llm-space/ui/components/thread-playground";
import { Tooltip } from "@llm-space/ui/components/tooltip";
import { formatString, useI18n } from "@llm-space/ui/lib/i18n";
import { Button } from "@llm-space/ui/ui/button";
import { Skeleton } from "@llm-space/ui/ui/skeleton";
import {
  ExpandIcon,
  ExternalLinkIcon,
  FileJsonIcon,
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

/** At or below this width, the viewer opens in embedded (chrome-free) mode. */
const EMBEDDED_MAX_WIDTH_PX = 850;

/**
 * Whether the URL opts into compact/embedded rendering via an `embedded` query
 * param in the hash (e.g. `#/shared/gist/threads/x?embedded`). Read straight off
 * `window.location.hash` so it's independent of how the router splits the hash.
 */
function _isEmbedded(): boolean {
  const hash = window.location.hash;
  const queryIndex = hash.indexOf("?");
  if (queryIndex < 0) return false;
  return new URLSearchParams(hash.slice(queryIndex + 1)).has("embedded");
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
  const { t } = useI18n();
  // Decide embedded/compact rendering once, at open — kept in state so later
  // resizes don't reflow (and don't flash thumbnails in) after the thread loads.
  // Embedded (strips the site chrome + collapses images) when the URL opts in
  // (`?embedded`) or the viewport is narrow.
  const [embedded] = useState(
    () => _isEmbedded() || window.innerWidth <= EMBEDDED_MAX_WIDTH_PX
  );
  const compactImages = embedded;

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
              error instanceof Error ? error.message : t.viewer.failedToLoad,
          });
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a language switch must not refetch the thread
  }, [connector, threadId]);

  // Reflect the thread title in the tab/window title while it's open.
  useEffect(() => {
    if (state.status !== "ready") return;
    const title = state.shared.meta.title ?? t.viewer.untitledThread;
    const previous = document.title;
    document.title = `${title} - LLM Space`;
    return () => {
      document.title = previous;
    };
  }, [state, t]);

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
    return <ThreadViewerSkeleton embedded={embedded} />;
  }
  if (state.status === "error") {
    // A load failure isn't "not found" — label rate limits / network errors
    // accurately so a transient error isn't mistaken for a missing thread.
    const rateLimited = /rate limit/i.test(state.message);
    return (
      <NotFound
        eyebrow={rateLimited ? t.viewer.rateLimited : t.viewer.unavailable}
        title={t.viewer.couldNotLoad}
        message={state.message}
      />
    );
  }

  const { thread, meta } = state.shared;
  const headerActions = (
    <div className="flex items-center gap-2">
      {/* Embedded has no meta block, so keep the "Open" affordance in-header. */}
      {fullscreen || embedded ? (
        <Button size="sm" onClick={openApp}>
          {t.viewer.openInApp}
          <ExternalLinkIcon className="size-3.5" />
        </Button>
      ) : null}
      {/* Full-screen toggle is redundant when already embedded/full-bleed. */}
      {embedded ? null : (
        <Tooltip
          content={fullscreen ? t.viewer.exitFullscreen : t.viewer.fullscreen}
        >
          <Button
            variant="ghost"
            size="icon-lg"
            aria-label={
              fullscreen ? t.viewer.exitFullscreen : t.viewer.enterFullscreen
            }
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
      )}
    </div>
  );
  const playground = (
    <ThreadPlayground
      className={
        fullscreen || embedded
          ? "size-full overflow-hidden"
          : "size-full overflow-hidden rounded-xl border shadow-lg"
      }
      path={`shared/${connector.connectorId}/threads/${threadId}`}
      title={meta.title}
      readonly
      compactImages={compactImages}
      initialValue={thread}
      headerActions={headerActions}
    />
  );
  // Embedded: strip the site chrome (header + meta block) and let the playground
  // fill the frame, for use inside an iframe.
  if (embedded) {
    return (
      <div className="dark h-dvh bg-[#08080a] text-[#ededf0]">{playground}</div>
    );
  }
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

/**
 * Loading placeholder that mirrors the ready layout — same header, meta block,
 * and playground shell — so the page doesn't shift once the thread arrives. In
 * embedded mode it drops the chrome to match the embedded ready view.
 */
function ThreadViewerSkeleton({ embedded = false }: { embedded?: boolean }) {
  if (embedded) {
    return (
      <div className="dark h-dvh bg-[#08080a] text-[#ededf0]">
        <Skeleton className="size-full rounded-none" />
      </div>
    );
  }
  return (
    <div className="dark flex h-dvh flex-col bg-[#08080a] text-[#ededf0]">
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col px-6 min-h-0 sm:px-10">
        <section className="flex shrink-0 flex-col gap-6 py-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-3">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-8 w-72 max-w-full" />
            <Skeleton className="h-4 w-96 max-w-full" />
            <Skeleton className="h-3 w-40" />
          </div>
          <div className="flex flex-col items-start gap-4 sm:items-end">
            <Skeleton className="h-3 w-32" />
            <div className="flex items-center gap-2">
              <Skeleton className="size-8 rounded-full" />
              <Skeleton className="h-4 w-28" />
            </div>
            <Skeleton className="h-10 w-40 rounded-md" />
          </div>
        </section>
        <div className="min-h-0 flex-1 pb-6">
          <Skeleton className="h-full w-full rounded-xl" />
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
  const { t } = useI18n();
  return (
    <section className="flex shrink-0 flex-col gap-6 py-5 sm:flex-row sm:items-start sm:justify-between">
      <div className="space-y-2">
        <div className="text-xs font-medium tracking-widest text-neutral-500 uppercase">
          {t.viewer.sharedThread}
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-white">
          {meta.title ?? t.viewer.untitledThread}
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
                ? formatString(t.viewer.created, {
                    date: formatDateTime(meta.createdAt),
                  })
                : undefined
            }
          >
            <span className="text-xs text-neutral-500">
              {formatString(t.viewer.lastUpdated, {
                date: formatDate(meta.updatedAt),
              })}
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
              {t.viewer.sharedBy}{" "}
              <span className="font-medium text-white">{meta.author.name}</span>
            </span>
          </a>
        ) : null}
        <Button size="lg" onClick={onOpenApp}>
          {t.viewer.openInApp}
          <ExternalLinkIcon className="size-4" />
        </Button>
      </div>
    </section>
  );
}
