type FrameScheduler = (callback: FrameRequestCallback) => number;
type FrameCanceler = (frameId: number) => void;

type ResizeObserverFactory = (
  callback: ResizeObserverCallback
) => Pick<ResizeObserver, "disconnect" | "observe">;

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
const AUTO_SCROLL_BOTTOM_THRESHOLD_PX = 48;

/**
 * Follow layout growth at the bottom of an active run without subscribing the
 * full message list to every streaming update. Scrolling upward opts out until
 * the viewport reaches the bottom again.
 */
export function followMessageViewportBottom(
  viewport: HTMLElement,
  content: HTMLElement,
  options: {
    cancelFrame?: FrameCanceler;
    createResizeObserver?: ResizeObserverFactory;
    scheduleFrame?: FrameScheduler;
  } = {}
) {
  const scheduleFrame = options.scheduleFrame ?? requestAnimationFrame;
  const cancelFrame = options.cancelFrame ?? cancelAnimationFrame;
  let following = true;
  let frameId: number | null = null;
  let previousScrollTop = viewport.scrollTop;

  const isNearBottom = () =>
    viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop <=
    AUTO_SCROLL_BOTTOM_THRESHOLD_PX;
  const scrollToBottom = () => {
    frameId = null;
    if (!following) {
      return;
    }
    viewport.scrollTop = viewport.scrollHeight;
    previousScrollTop = viewport.scrollTop;
  };
  const scheduleScrollToBottom = () => {
    if (following && frameId === null) {
      frameId = scheduleFrame(scrollToBottom);
    }
  };
  const handleScroll = () => {
    const scrollTop = viewport.scrollTop;
    if (isNearBottom()) {
      following = true;
    } else if (scrollTop < previousScrollTop - 1) {
      following = false;
    }
    previousScrollTop = scrollTop;
  };

  const observer = (
    options.createResizeObserver ??
    ((callback: ResizeObserverCallback) => new ResizeObserver(callback))
  )(scheduleScrollToBottom);
  viewport.addEventListener("scroll", handleScroll, { passive: true });
  observer.observe(content);
  viewport.scrollTop = viewport.scrollHeight;
  previousScrollTop = viewport.scrollTop;

  return () => {
    observer.disconnect();
    viewport.removeEventListener("scroll", handleScroll);
    if (frameId !== null) {
      cancelFrame(frameId);
    }
  };
}

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
