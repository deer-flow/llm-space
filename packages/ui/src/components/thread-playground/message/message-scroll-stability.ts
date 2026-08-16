type FrameScheduler = (callback: FrameRequestCallback) => number;

interface ScrollViewport {
  scrollTop: number;
}

export interface MessageScrollTarget {
  message: HTMLElement;
  viewport: HTMLElement;
}

interface ScrollStabilizationSession {
  refresh(): void;
}

const sessions = new WeakMap<HTMLElement, ScrollStabilizationSession>();
const STABILIZATION_TIMEOUT_MS = 10_000;

/**
 * Keep the message viewport at the same offset while React and the virtualizer
 * measure an asynchronously inserted tool result. Visible message targets stay
 * anchored through delayed editor measurement; lightweight callers without a
 * DOM target get a two-frame fallback.
 */
export function preserveScrollOffsetAfterLayout(
  target: MessageScrollTarget | ScrollViewport | null,
  update: () => void,
  scheduleFrame?: FrameScheduler
) {
  const viewport = target && "viewport" in target ? target.viewport : target;
  const scrollTop = viewport?.scrollTop;
  const session =
    target && "viewport" in target
      ? _stabilizeMessageScroll(target, scheduleFrame)
      : null;
  update();
  if (!viewport || scrollTop === undefined) {
    return;
  }

  if (session) {
    session.refresh();
    return;
  }

  const schedule = scheduleFrame ?? requestAnimationFrame;
  schedule(() => {
    viewport.scrollTop = scrollTop;
    schedule(() => {
      viewport.scrollTop = scrollTop;
    });
  });
}

/** Find the visible mounted message and its owning scroll viewport. */
export function findMessageScrollTarget(
  messageId: string
): MessageScrollTarget | null {
  const messages = document.querySelectorAll<HTMLElement>("[data-message-id]");
  for (const message of messages) {
    if (message.dataset.messageId === messageId) {
      const viewport = message.closest<HTMLElement>(
        '[data-slot="scroll-area-viewport"]'
      );
      if (!viewport) {
        continue;
      }
      const messageRect = message.getBoundingClientRect();
      const viewportRect = viewport.getBoundingClientRect();
      if (
        messageRect.bottom > viewportRect.top &&
        messageRect.top < viewportRect.bottom
      ) {
        return { message, viewport };
      }
    }
  }
  return null;
}

function _stabilizeMessageScroll(
  target: MessageScrollTarget,
  scheduleFrame?: FrameScheduler
): ScrollStabilizationSession | null {
  const existing = sessions.get(target.viewport);
  if (existing) {
    return existing;
  }

  const { viewport } = target;
  const scrollTop = viewport.scrollTop;
  const schedule = scheduleFrame ?? requestAnimationFrame;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  const restore = () => {
    if (!stopped && viewport.scrollTop !== scrollTop) {
      viewport.scrollTop = scrollTop;
    }
  };
  const intervalId = setInterval(restore, 50);
  const stop = () => {
    if (stopped) {
      return;
    }
    stopped = true;
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
    clearInterval(intervalId);
    for (const type of USER_SCROLL_EVENTS) {
      window.removeEventListener(type, stop, true);
    }
    sessions.delete(viewport);
  };
  const refresh = () => {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(stop, STABILIZATION_TIMEOUT_MS);
    schedule(() => {
      restore();
      schedule(restore);
    });
  };
  const session = { refresh };

  for (const type of USER_SCROLL_EVENTS) {
    window.addEventListener(type, stop, true);
  }
  sessions.set(viewport, session);
  restore();
  return session;
}

const USER_SCROLL_EVENTS = [
  "keydown",
  "pointerdown",
  "touchstart",
  "wheel",
] as const;
