export interface VirtualItemBounds {
  index: number;
  start: number;
  end: number;
}

/** Find the rendered virtual item closest to the viewport's visual center. */
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
    const distance = Math.abs((item.start + item.end) / 2 - viewportCenter);
    if (distance < closestDistance) {
      index = item.index;
      closestDistance = distance;
    }
  }
  return index;
}
