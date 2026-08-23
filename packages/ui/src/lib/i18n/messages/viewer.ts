/**
 * Shared-thread web viewer chrome (`apps/web/src/thread-viewer.tsx` + the
 * not-found page). The viewer renders the shared `ThreadPlayground`, so it
 * speaks the shared messages tree — its own chrome gets a top-level section.
 */
export const viewer = {
  sharedThread: "Shared thread",
  untitledThread: "Untitled thread",
  failedToLoad: "Failed to load.",
  rateLimited: "Rate limited",
  unavailable: "Unavailable",
  couldNotLoad: "We couldn't load this shared thread",
  openInApp: "Open in LLM Space",
  fullscreen: "Full screen",
  enterFullscreen: "Enter full screen",
  exitFullscreen: "Exit full screen",
  created: "Created {date}",
  lastUpdated: "Last updated {date}",
  sharedBy: "Shared by",
  notFound: "Not found",
  couldNotOpen: "We couldn't open this shared thread",
  linkMayBeBroken:
    "The link may be broken, private, or the thread no longer exists.",
  backToLlmSpace: "Back to LLM Space",
};
