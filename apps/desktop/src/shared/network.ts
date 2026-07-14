/**
 * User-configured proxy settings, persisted to `settings/network.json`. These
 * drive the Bun process's outbound HTTP egress: the `NetworkSettingsManager`
 * translates them into `HTTP_PROXY` / `HTTPS_PROXY` / `NO_PROXY` on
 * `process.env`, which Bun's global `fetch` (and pi-ai's own proxy resolver)
 * read live per request. Disabling the proxy is authoritative — it clears those
 * variables so egress goes direct, even if the login shell exported a proxy.
 */
export interface NetworkSettings {
  /** Master switch. When off, proxy env vars are cleared (force direct). */
  enabled: boolean;
  /** When on, ignore the manual fields and use the OS-detected proxy. */
  useSystemProxy: boolean;
  /** Manual HTTP proxy URL, e.g. `http://127.0.0.1:7890`. */
  httpProxy: string;
  /** Manual HTTPS proxy URL, e.g. `http://127.0.0.1:7890`. */
  httpsProxy: string;
  /** Comma/space-separated bypass list, mapped to `NO_PROXY`. */
  noProxy: string;
}

export const DEFAULT_NETWORK_SETTINGS: NetworkSettings = {
  enabled: true,
  useSystemProxy: true,
  httpProxy: "",
  httpsProxy: "",
  noProxy: "localhost, 127.0.0.1, .local",
};

/** Result of probing the operating system for its configured proxy. */
export interface SystemProxyDetection {
  /** Detected HTTP proxy URL, or `null` when none is configured. */
  httpProxy: string | null;
  /** Detected HTTPS proxy URL, or `null` when none is configured. */
  httpsProxy: string | null;
  /** Detected bypass list, or `null` when none is configured. */
  noProxy: string | null;
  /**
   * True when the OS has a SOCKS proxy enabled but no usable HTTP/HTTPS proxy.
   * SOCKS/PAC is unsupported by pi-ai (it throws), so the UI warns instead of
   * silently applying an unusable proxy.
   */
  socksOnly: boolean;
}

/**
 * A proxy URL is usable only if it is empty (unset) or an `http(s)://` URL.
 * SOCKS/PAC and malformed values are rejected. Shared by the manager (to decide
 * what to apply) and the settings page (to show an inline warning).
 */
export function isSupportedProxyUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) {
    return true;
  }
  try {
    const { protocol } = new URL(trimmed);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}
