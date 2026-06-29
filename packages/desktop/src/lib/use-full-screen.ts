import { useEffect, useState } from "react";

import { electrobun } from "@/lib/electrobun";

/**
 * Track the window's OS-level (Electrobun) fullscreen state. Seeds the initial
 * value with an `isFullScreen` request, then stays in sync via the bun-pushed
 * `fullScreenChanged` messages.
 */
export function useFullScreen(): boolean {
  const [fullScreen, setFullScreen] = useState(false);

  useEffect(() => {
    const rpc = electrobun.rpc;
    if (!rpc) return;
    let cancelled = false;

    void rpc.request
      .isFullScreen({})
      .then((res) => {
        if (!cancelled) setFullScreen(res.fullScreen);
      })
      .catch(() => {
        // Ignore: fall back to the default (not fullscreen).
      });

    const onChange = ({ fullScreen }: { fullScreen: boolean }) =>
      setFullScreen(fullScreen);
    rpc.addMessageListener("fullScreenChanged", onChange);
    return () => {
      cancelled = true;
      rpc.removeMessageListener("fullScreenChanged", onChange);
    };
  }, []);

  return fullScreen;
}
