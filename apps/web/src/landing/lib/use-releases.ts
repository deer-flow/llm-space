import { useEffect, useState } from "react";
import { fetchReleases, RELEASES, type Releases } from "@/landing/lib/releases";

/**
 * Live release info for the download buttons.
 *
 * Seeds from the build-time bake (`RELEASES`) so a valid download URL renders
 * instantly — even with JS disabled — then lazily refreshes from the GitHub
 * Releases API after mount. A newly published stable build is therefore picked
 * up on the next visit without redeploying the site. On any failure (offline,
 * rate-limited, unmounted) the baked-in fallback stands.
 */
export function useReleases(): Releases {
  const [releases, setReleases] = useState<Releases>(RELEASES);

  useEffect(() => {
    const controller = new AbortController();
    fetchReleases(controller.signal)
      .then(setReleases)
      .catch(() => {
        // Keep the build-time fallback; a stale-but-valid link beats none.
      });
    return () => controller.abort();
  }, []);

  return releases;
}
