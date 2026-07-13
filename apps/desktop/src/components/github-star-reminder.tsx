import { XIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { useCommands } from "@/commands";
import { electrobun } from "@/lib/electrobun";
import { cn } from "@/lib/utils";

/** The repository we nudge users to star. */
const STAR_URL = "https://github.com/deer-flow/llm-space";

/** Wait this long after the UI is ready before sliding the card in. */
const SHOW_DELAY_MS = 5000;

/**
 * A passive "star us on GitHub" card pinned to the window's bottom-left corner.
 * Whether it appears on this launch — the 4-day throttle, the first-open grace,
 * and the 3-show cap — is decided entirely by the bun side
 * (`githubStarReminderShouldShow`); this component only renders and animates.
 *
 * The card is a single 3:2 image: clicking it opens the repo and retires the
 * reminder for good; the top-right ✕ only dismisses this one showing.
 */
export function GithubStarReminder() {
  const { executeCommand } = useCommands();
  // `open` keeps the card mounted; `leaving` plays the fade-out before unmount.
  const [open, setOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);

  // Ask the bun side once per launch whether to show. It also records the
  // decision (bumps the open count / resets the 4-day clock), so this is
  // fire-once. When it says show, wait 5s so the card slides in after the UI
  // has settled rather than fighting first paint.
  useEffect(() => {
    const rpc = electrobun.rpc;
    if (!rpc) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    void rpc.request.githubStarReminderShouldShow({}).then((result) => {
      if (cancelled || !result.show) return;
      timer = setTimeout(() => setOpen(true), SHOW_DELAY_MS);
    });
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  const close = useCallback(() => setLeaving(true), []);

  const handleStar = useCallback(() => {
    executeCommand({ type: "openLink", args: { url: STAR_URL } });
    void electrobun.rpc?.request.githubStarReminderDismissForever({});
    close();
  }, [executeCommand, close]);

  if (!open) return null;

  return (
    <div
      className={cn(
        "border-border/70 fixed bottom-4 left-4 z-50 w-80 overflow-hidden rounded-xl border shadow-2xl",
        leaving
          ? "animate-out fade-out-0 duration-200"
          : "animate-in fade-in-0 slide-in-from-bottom-4 duration-300"
      )}
      onAnimationEnd={() => {
        if (leaving) setOpen(false);
      }}
    >
      <button
        type="button"
        onClick={handleStar}
        aria-label="Star LLM Space on GitHub"
        className="block w-full"
      >
        <img
          src="/images/star-on-github.png"
          alt="Star LLM Space on GitHub"
          className="block aspect-[3/2] w-full object-cover"
        />
      </button>
      <button
        type="button"
        onClick={close}
        aria-label="Dismiss"
        className="absolute top-2 right-2 flex size-6 items-center justify-center rounded-full bg-black/50 text-white/80 transition-colors hover:bg-black/70 hover:text-white"
      >
        <XIcon className="size-3.5" />
      </button>
    </div>
  );
}
