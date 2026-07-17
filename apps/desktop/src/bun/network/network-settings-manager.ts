import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  DEFAULT_NETWORK_SETTINGS,
  isSupportedProxyUrl,
  type NetworkSettings,
  type SystemProxyDetection,
} from "@llm-space/core";
import { getSettingsDir } from "@llm-space/core/server";

/**
 * Proxy environment variables we own. Both cases are managed because Bun's
 * global `fetch` and pi-ai's resolver each read a mix of upper- and lower-case.
 * `ALL_PROXY` is only ever cleared — we express intent through the explicit
 * `HTTP_PROXY`/`HTTPS_PROXY`/`NO_PROXY` trio so a leftover shell `ALL_PROXY`
 * can't override us.
 */
const HTTP_PROXY_KEYS = ["HTTP_PROXY", "http_proxy"] as const;
const HTTPS_PROXY_KEYS = ["HTTPS_PROXY", "https_proxy"] as const;
const ALL_PROXY_KEYS = ["ALL_PROXY", "all_proxy"] as const;
const NO_PROXY_KEYS = ["NO_PROXY", "no_proxy"] as const;

/**
 * Owns `settings/network.json`: the in-memory source of truth for the Bun
 * process's outbound proxy. Mirrors `SearchSettingsManager`'s eager,
 * synchronous load-and-seed pattern, and additionally reflects the resolved
 * settings onto `process.env` on construction and on every `set()` so pi-ai /
 * Bun's global `fetch` route (or don't route) through the proxy.
 */
export class NetworkSettingsManager {
  private _settings: NetworkSettings;

  constructor() {
    this._settings = this._loadConfig();
    this._applyToEnv();
  }

  get(): NetworkSettings {
    return { ...this._settings };
  }

  set(next: NetworkSettings): NetworkSettings {
    this._settings = this._normalize(next);
    this._saveConfig();
    this._applyToEnv();
    return this.get();
  }

  /**
   * Probe the operating system for its configured proxy. macOS is read via
   * `scutil --proxy`; other platforms fall back to the process environment.
   */
  detectSystemProxy(): SystemProxyDetection {
    if (process.platform === "darwin") {
      return this._detectDarwinProxy();
    }
    return this._detectEnvProxy();
  }

  private get _configPath(): string {
    return path.join(getSettingsDir(), "network.json");
  }

  private _saveConfig(): void {
    mkdirSync(getSettingsDir(), { recursive: true });
    writeFileSync(
      this._configPath,
      `${JSON.stringify(this._settings, null, 2)}\n`,
      "utf8"
    );
  }

  /**
   * Read `settings/network.json`, merging against defaults so partial or missing
   * files stay valid. When the file is absent this is a first run: seed from any
   * proxy the login shell already exported so existing shell-proxy users aren't
   * silently forced direct by the new authoritative-off behavior.
   */
  private _loadConfig(): NetworkSettings {
    try {
      const parsed = JSON.parse(
        readFileSync(this._configPath, "utf8")
      ) as Partial<NetworkSettings>;
      return this._normalize(parsed);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
      const seeded = this._seedFromEnv();
      mkdirSync(getSettingsDir(), { recursive: true });
      writeFileSync(
        this._configPath,
        `${JSON.stringify(seeded, null, 2)}\n`,
        "utf8"
      );
      return seeded;
    }
  }

  private _normalize(input: Partial<NetworkSettings>): NetworkSettings {
    return {
      enabled:
        typeof input.enabled === "boolean"
          ? input.enabled
          : DEFAULT_NETWORK_SETTINGS.enabled,
      useSystemProxy:
        typeof input.useSystemProxy === "boolean"
          ? input.useSystemProxy
          : DEFAULT_NETWORK_SETTINGS.useSystemProxy,
      httpProxy:
        typeof input.httpProxy === "string"
          ? input.httpProxy
          : DEFAULT_NETWORK_SETTINGS.httpProxy,
      httpsProxy:
        typeof input.httpsProxy === "string"
          ? input.httpsProxy
          : DEFAULT_NETWORK_SETTINGS.httpsProxy,
      noProxy:
        typeof input.noProxy === "string"
          ? input.noProxy
          : DEFAULT_NETWORK_SETTINGS.noProxy,
    };
  }

  /**
   * First-run migration: if the environment already carries an HTTP/HTTPS proxy
   * (from the login shell, backfilled by `env/hydrate`), adopt it as the initial
   * enabled config. Only usable `http(s)://` values are adopted.
   */
  private _seedFromEnv(): NetworkSettings {
    const httpProxy = this._readEnv(HTTP_PROXY_KEYS);
    const httpsProxy = this._readEnv(HTTPS_PROXY_KEYS);
    const usableHttp = httpProxy && isSupportedProxyUrl(httpProxy) ? httpProxy : "";
    const usableHttps =
      httpsProxy && isSupportedProxyUrl(httpsProxy) ? httpsProxy : "";
    if (!usableHttp && !usableHttps) {
      return { ...DEFAULT_NETWORK_SETTINGS };
    }
    return {
      enabled: true,
      useSystemProxy: false,
      httpProxy: usableHttp,
      httpsProxy: usableHttps,
      noProxy:
        this._readEnv(NO_PROXY_KEYS) || DEFAULT_NETWORK_SETTINGS.noProxy,
    };
  }

  /**
   * Reflect the resolved settings onto `process.env`. Disabled is authoritative:
   * every proxy variable is cleared so egress goes direct. Enabled sets the
   * effective (system or manual) `http(s)://` proxies and bypass list, clearing
   * any it doesn't set.
   */
  private _applyToEnv(): void {
    // `ALL_PROXY` is always cleared so it can never shadow our explicit values.
    this._clearEnv(ALL_PROXY_KEYS);

    if (!this._settings.enabled) {
      this._clearEnv(HTTP_PROXY_KEYS);
      this._clearEnv(HTTPS_PROXY_KEYS);
      this._clearEnv(NO_PROXY_KEYS);
      return;
    }

    const effective = this._resolveEffective();
    this._writeProxyEnv(HTTP_PROXY_KEYS, effective.httpProxy);
    this._writeProxyEnv(HTTPS_PROXY_KEYS, effective.httpsProxy);
    this._writeRawEnv(NO_PROXY_KEYS, effective.noProxy);
  }

  /** The proxy values to apply, drawn from the system or the manual fields. */
  private _resolveEffective(): {
    httpProxy: string;
    httpsProxy: string;
    noProxy: string;
  } {
    if (this._settings.useSystemProxy) {
      const detected = this.detectSystemProxy();
      return {
        httpProxy: detected.httpProxy ?? "",
        httpsProxy: detected.httpsProxy ?? "",
        noProxy: detected.noProxy ?? "",
      };
    }
    return {
      httpProxy: this._settings.httpProxy,
      httpsProxy: this._settings.httpsProxy,
      noProxy: this._settings.noProxy,
    };
  }

  /** Set both env-var casings to a usable `http(s)://` URL; otherwise clear. */
  private _writeProxyEnv(keys: readonly string[], value: string): void {
    const trimmed = value.trim();
    if (trimmed && isSupportedProxyUrl(trimmed)) {
      this._writeRawEnv(keys, trimmed);
    } else {
      this._clearEnv(keys);
    }
  }

  /** Set both env-var casings verbatim (for the bypass list); clear if empty. */
  private _writeRawEnv(keys: readonly string[], value: string): void {
    const trimmed = value.trim();
    if (!trimmed) {
      this._clearEnv(keys);
      return;
    }
    for (const key of keys) {
      process.env[key] = trimmed;
    }
  }

  private _clearEnv(keys: readonly string[]): void {
    for (const key of keys) {
      delete process.env[key];
    }
  }

  private _readEnv(keys: readonly string[]): string {
    for (const key of keys) {
      const value = process.env[key];
      if (typeof value === "string" && value.trim()) {
        return value.trim();
      }
    }
    return "";
  }

  /** Build a detection result from the current process environment. */
  private _detectEnvProxy(): SystemProxyDetection {
    const httpProxy = this._readEnv(HTTP_PROXY_KEYS);
    const httpsProxy = this._readEnv(HTTPS_PROXY_KEYS);
    const noProxy = this._readEnv(NO_PROXY_KEYS);
    return {
      httpProxy: httpProxy || null,
      httpsProxy: httpsProxy || null,
      noProxy: noProxy || null,
      socksOnly: false,
    };
  }

  /** Read macOS proxy configuration via `scutil --proxy`. */
  private _detectDarwinProxy(): SystemProxyDetection {
    let output: string;
    try {
      const result = Bun.spawnSync(["scutil", "--proxy"], {
        stdout: "pipe",
        stderr: "ignore",
      });
      if (!result.success) {
        return this._detectEnvProxy();
      }
      output = result.stdout.toString();
    } catch {
      return this._detectEnvProxy();
    }

    const scalars = _parseScutilScalars(output);
    const httpProxy = _buildProxyUrl(
      scalars.HTTPEnable,
      scalars.HTTPProxy,
      scalars.HTTPPort
    );
    const httpsProxy = _buildProxyUrl(
      scalars.HTTPSEnable,
      scalars.HTTPSProxy,
      scalars.HTTPSPort
    );
    const socksEnabled = scalars.SOCKSEnable === "1" && !!scalars.SOCKSProxy;
    const exceptions = _parseScutilExceptions(output);

    return {
      httpProxy,
      httpsProxy,
      noProxy: exceptions.length > 0 ? exceptions.join(", ") : null,
      socksOnly: socksEnabled && !httpProxy && !httpsProxy,
    };
  }
}

/** Parse flat `Key : value` scalar lines from `scutil --proxy` output. */
function _parseScutilScalars(output: string): Record<string, string> {
  const scalars: Record<string, string> = {};
  for (const line of output.split("\n")) {
    const match = /^\s*([A-Za-z]+)\s*:\s*(\S.*?)\s*$/.exec(line);
    // Skip container markers like `ExceptionsList : <array> {`.
    if (match && !match[2].startsWith("<")) {
      scalars[match[1]] = match[2];
    }
  }
  return scalars;
}

/**
 * Extract the `ExceptionsList` array entries (bypass hostnames) from
 * `scutil --proxy` output. Entries look like `  0 : *.local` and live between
 * the `ExceptionsList : <array> {` marker and its closing `}`.
 */
function _parseScutilExceptions(output: string): string[] {
  const lines = output.split("\n");
  const start = lines.findIndex((line) => /ExceptionsList\s*:/.test(line));
  if (start === -1) {
    return [];
  }
  const entries: string[] = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i].includes("}")) {
      break;
    }
    const match = /^\s*\d+\s*:\s*(\S.*?)\s*$/.exec(lines[i]);
    if (match) {
      entries.push(match[1]);
    }
  }
  return entries;
}

/** Assemble an `http://host:port` URL when the proxy is enabled and present. */
function _buildProxyUrl(
  enable: string | undefined,
  host: string | undefined,
  port: string | undefined
): string | null {
  if (enable !== "1" || !host) {
    return null;
  }
  return port ? `http://${host}:${port}` : `http://${host}`;
}
