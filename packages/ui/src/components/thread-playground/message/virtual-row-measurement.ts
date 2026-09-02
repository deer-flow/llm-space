/**
 * Measure a virtual row in layout pixels rather than transformed visual pixels.
 *
 * The CEF edition implements page zoom by scaling the document root. A
 * `getBoundingClientRect()` measurement therefore already includes that scale;
 * feeding it back into a CSS translate applies the scale a second time and
 * creates progressively larger gaps between rows.
 */
export function measureVirtualRowHeight(
  element: HTMLElement,
  entry?: ResizeObserverEntry
) {
  const borderBox = entry?.borderBoxSize?.[0];
  return borderBox ? Math.round(borderBox.blockSize) : element.offsetHeight;
}
