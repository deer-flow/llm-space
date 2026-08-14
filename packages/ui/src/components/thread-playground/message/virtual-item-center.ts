export interface VirtualItemBounds {
  index: number;
  start: number;
  end: number;
}

/** Find the rendered virtual item containing, or nearest to, viewport center. */
export function findCenteredVirtualItemIndex(
  items: readonly VirtualItemBounds[],
  scrollOffset: number,
  viewportHeight: number
): number | null {
  if (viewportHeight <= 0 || items.length === 0) return null;
  const viewportCenter = scrollOffset + viewportHeight / 2;
  let index: number | null = null;
  let closestDistance = Number.POSITIVE_INFINITY;
  for (const item of items) {
    const distance =
      viewportCenter < item.start
        ? item.start - viewportCenter
        : viewportCenter > item.end
          ? viewportCenter - item.end
          : 0;
    if (distance < closestDistance) {
      index = item.index;
      closestDistance = distance;
    }
  }
  return index;
}
