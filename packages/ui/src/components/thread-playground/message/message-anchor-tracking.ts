export interface MessageRowBounds {
  index: number;
  top: number;
  bottom: number;
}

export function findClosestMessageRowIndex(
  viewportCenter: number,
  rows: readonly MessageRowBounds[]
): number | null {
  let closestIndex: number | null = null;
  let closestDistance = Number.POSITIVE_INFINITY;
  for (const row of rows) {
    const distance =
      viewportCenter < row.top
        ? row.top - viewportCenter
        : viewportCenter > row.bottom
          ? viewportCenter - row.bottom
          : 0;
    if (distance < closestDistance) {
      closestDistance = distance;
      closestIndex = row.index;
    }
  }
  return closestIndex;
}

export function findMessageRowIndexFromHitElements(
  elements: readonly Element[],
  content: HTMLElement
): number | null {
  for (const element of elements) {
    const row = element.closest<HTMLElement>("[data-message-row-index]");
    if (!row || !content.contains(row)) continue;
    const index = Number(row.dataset.messageRowIndex);
    if (Number.isInteger(index) && index >= 0) return index;
  }
  return null;
}

export function getViewportCenterProbeYs(
  viewportTop: number,
  viewportHeight: number,
  probeDistance: number
): number[] {
  if (viewportHeight <= 0) return [];
  const viewportBottom = viewportTop + viewportHeight;
  const center = viewportTop + viewportHeight / 2;
  return [
    center,
    center - probeDistance,
    center + probeDistance,
    center - probeDistance * 2,
    center + probeDistance * 2,
  ].filter((position) => position >= viewportTop && position <= viewportBottom);
}

export interface MessageAnchorTrackingScheduler {
  notifyViewportChange(): void;
  dispose(): void;
}

export function createMessageAnchorTrackingScheduler({
  requestFrame,
  cancelFrame,
  readViewportSignature,
  readProgressiveIndex,
  readExactIndex,
  onIndex,
}: {
  requestFrame: (callback: FrameRequestCallback) => number;
  cancelFrame: (handle: number) => void;
  readViewportSignature: () => unknown;
  readProgressiveIndex: () => number | null;
  readExactIndex: () => number | null;
  onIndex: (index: number | null, exact: boolean) => void;
}): MessageAnchorTrackingScheduler {
  let frameId: number | null = null;
  let disposed = false;
  let stableFrameCount = 0;
  let framesUntilProgressiveUpdate = 0;
  let lastViewportSignature = readViewportSignature();

  const scheduleFrame = () => {
    if (disposed || frameId !== null) return;
    frameId = requestFrame(runFrame);
  };

  const runFrame: FrameRequestCallback = () => {
    frameId = null;
    if (disposed) return;

    const viewportSignature = readViewportSignature();
    if (Object.is(viewportSignature, lastViewportSignature)) {
      stableFrameCount += 1;
    } else {
      lastViewportSignature = viewportSignature;
      stableFrameCount = 0;
    }

    if (framesUntilProgressiveUpdate === 0) {
      onIndex(readProgressiveIndex(), false);
      framesUntilProgressiveUpdate = 1;
    } else {
      framesUntilProgressiveUpdate -= 1;
    }

    if (stableFrameCount >= 2) {
      onIndex(readExactIndex(), true);
      return;
    }
    scheduleFrame();
  };

  return {
    notifyViewportChange() {
      if (disposed) return;
      stableFrameCount = 0;
      scheduleFrame();
    },
    dispose() {
      disposed = true;
      if (frameId !== null) {
        cancelFrame(frameId);
        frameId = null;
      }
    },
  };
}
