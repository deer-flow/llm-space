export const REPO = "deer-flow/llm-space";
export const RELEASES_URL = `https://github.com/${REPO}/releases`;
export const RELEASES_API = `https://api.github.com/repos/${REPO}/releases?per_page=30`;

// The rolling update-feed releases (`updates`, `updates-performance`) are
// machine-readable feeds the in-app updater polls — never human download
// targets. They ship as prereleases (so the stable filter below already skips
// them), but guard by tag too in case one is ever published as a full release.
const isUpdateFeed = (tag: string) => tag.startsWith("updates");

export interface Build {
  url: string;
  size: number;
}

export interface Channel {
  version: string;
  appleSilicon?: Build;
  intel?: Build;
}

export interface Releases {
  /** Latest non-prerelease build, if any has shipped. */
  stable?: Channel;
}

// Used when the build-time fetch is unavailable (local dev, offline CI, API
// rate-limit) or the live refresh fails. Real values at time of writing — the
// Performance edition DMGs of the latest stable, matching what `toChannel`
// picks from the API. Keep in sync when a new stable ships.
export const FALLBACK_RELEASES: Releases = {
  stable: {
    version: "v4.4.4",
    appleSilicon: {
      url: `${RELEASES_URL}/download/v4.4.4/LLMSpace-performance-v4.4.4-macos-arm64.dmg`,
      size: 133_710_812,
    },
    intel: {
      url: `${RELEASES_URL}/download/v4.4.4/LLMSpace-performance-v4.4.4-macos-x64.dmg`,
      size: 143_486_440,
    },
  },
};

interface GhAsset {
  name: string;
  size: number;
  browser_download_url: string;
}

interface GhRelease {
  tag_name: string;
  prerelease: boolean;
  draft: boolean;
  assets: GhAsset[];
}

function toChannel(rel: GhRelease): Channel {
  // A versioned release carries both editions' DMGs (regular + Performance/CEF,
  // per arch). The landing page offers the Performance edition (embeds
  // Chromium/CEF — the more capable, consistent renderer), so prefer the
  // `performance` DMGs and only fall back to the regular build per arch when a
  // Performance DMG for that arch is missing (e.g. an older release).
  const dmgs = rel.assets.filter((a) => a.name.endsWith(".dmg"));
  const pick = (arch: string): Build | undefined => {
    const forArch = dmgs.filter((d) => d.name.includes(arch));
    const asset =
      forArch.find((d) => /performance/i.test(d.name)) ?? forArch[0];
    return asset
      ? { url: asset.browser_download_url, size: asset.size }
      : undefined;
  };
  return {
    version: rel.tag_name,
    appleSilicon: pick("arm64"),
    intel: pick("x64"),
  };
}

/** Shape the raw GitHub Releases API payload into the latest stable build. */
export function parseReleases(data: unknown): Releases {
  if (!Array.isArray(data)) return FALLBACK_RELEASES;
  // The API returns releases newest-first, so the first non-prerelease is the
  // latest stable. Prereleases (canary, update feeds) are never download
  // targets on the site, so they're skipped outright.
  const stable = (data as GhRelease[]).find(
    (r) => !r.draft && !r.prerelease && !isUpdateFeed(r.tag_name)
  );
  return stable ? { stable: toChannel(stable) } : FALLBACK_RELEASES;
}

/**
 * Fetch and shape the latest releases at runtime, from the browser. This is the
 * site's source of truth for download links and version — the page seeds from
 * FALLBACK_RELEASES for instant/no-JS render, then this refreshes it on mount,
 * so a newly published stable build is picked up on the next visit with no
 * redeploy. Unauthenticated (GitHub's 60 req/hr/IP is ample for one call per
 * page view).
 */
export async function fetchReleases(signal?: AbortSignal): Promise<Releases> {
  const res = await fetch(RELEASES_API, {
    headers: { Accept: "application/vnd.github+json" },
    signal,
  });
  if (!res.ok) throw new Error(`GitHub API responded ${res.status}`);
  return parseReleases(await res.json());
}

// The instant, no-JS seed rendered before the browser fetch resolves.
export const RELEASES: Releases = FALLBACK_RELEASES;
