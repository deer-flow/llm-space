/**
 * How often streaming previews repaint. Each update makes the streaming
 * editor re-render and re-lay-out the growing document — the dominant
 * per-update cost (especially on the WebKit renderer, which also pays a
 * multi-frame compositor round trip per DOM commit) — so previews flush at
 * this cadence instead of every animation frame.
 */
export const PREVIEW_THROTTLE_MS = 100;
