"use client";

import { useEffect } from "react";

import { electrobun } from "@/lib/electrobun";
import { isWindows } from "@/shared/platform";

/**
 * Windows-only page-zoom fallback. Electrobun's native `setPageZoom` is a
 * no-op on Windows, so the bun-side zoom commands push the desired level over
 * the `applyPageZoom` message and this hook applies it as CSS zoom. On mount
 * (first launch AND reloads) it pulls the persisted level via `getZoomState`.
 * macOS keeps the native WebKit page zoom and this hook is inert.
 */
export function useCssZoom() {
  useEffect(() => {
    if (!isWindows) return;
    const rpc = electrobun.rpc;
    if (!rpc) return;
    let cancelled = false;

    const apply = ({ zoom }: { zoom: number }) => {
      // `zoom` is a real CSS property in Chromium (which WebView2/CEF are);
      // it reflows like native page zoom, unlike `transform: scale()`.
      document.documentElement.style.zoom = zoom === 1 ? "" : String(zoom);
    };

    void rpc.request
      .getZoomState({})
      .then((state) => {
        if (!cancelled) apply(state);
      })
      .catch(() => {
        // Ignore: stay at 100% until the first zoom command arrives.
      });

    rpc.addMessageListener("applyPageZoom", apply);
    return () => {
      cancelled = true;
      rpc.removeMessageListener("applyPageZoom", apply);
    };
  }, []);
}
