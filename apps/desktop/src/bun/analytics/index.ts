import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { getSettingsDir } from "@llm-space/core/server";
import { PostHog } from "posthog-node";

import electrobunConfig from "../../../electrobun.config";
import type {
  AnalyticsEventMap,
  AnalyticsEventName,
  AnalyticsSettings,
  AnalyticsStatus,
} from "../../shared/analytics";
import { DEFAULT_ANALYTICS_SETTINGS } from "../../shared/analytics";

import { ANALYTICS_DISABLED, POSTHOG_HOST, POSTHOG_KEY } from "./config";

/**
 * Merged into every event so metrics can be sliced by release and OS. Only
 * anonymous build/platform facts - never anything user- or machine-identifying.
 */
const COMMON_PROPERTIES = {
  appVersion: electrobunConfig.app.version,
  platform: process.platform,
  arch: process.arch,
} as const;

/** On-disk shape of `settings/analytics.json`. */
interface PersistedAnalytics extends AnalyticsSettings {
  /**
   * A random, per-install id used as the analytics `distinctId`. Not a user
   * identity — it never leaves this machine except as an anonymous event key,
   * and deleting the file (or the whole llm-space root) resets it.
   */
  anonymousId: string;
}

/**
 * Anonymous, behaviour-only product analytics — the single network egress for
 * telemetry. See `shared/analytics.ts` for the privacy contract.
 *
 * Owns `settings/analytics.json` (the install id + the user's opt-out
 * preference), mirroring `SearchSettingsManager`'s eager load-and-seed pattern.
 * Nothing is ever sent unless a key is configured, the env opt-out is unset,
 * *and* the user hasn't turned analytics off in Settings; otherwise every
 * `capture` is a silent no-op. Capture is fire-and-forget and defensively
 * wrapped so telemetry can never crash the app.
 */
export class Analytics {
  /** True when this launch minted the install id (first run, or an id reset). */
  readonly isFirstRun: boolean;
  private readonly _anonymousId: string;
  private _enabled: boolean;
  private _client: PostHog | null = null;
  /** Hard gate fixed for the process lifetime: key present and not env-disabled. */
  private readonly _available = Boolean(POSTHOG_KEY) && !ANALYTICS_DISABLED;

  constructor() {
    const { persisted, isFirstRun } = this._loadConfig();
    this._anonymousId = persisted.anonymousId;
    this._enabled = persisted.enabled;
    this.isFirstRun = isFirstRun;
  }

  /** The user's preference plus availability; see {@link AnalyticsStatus}. */
  getSettings(): AnalyticsStatus {
    return { enabled: this._enabled, available: this._available };
  }

  /**
   * Toggle the user's opt-out preference and persist it. Turning it off flushes
   * and tears down the client so nothing further is sent; turning it back on
   * lets the next `capture` re-create it lazily.
   */
  setEnabled(enabled: boolean): AnalyticsStatus {
    if (enabled === this._enabled) return this.getSettings();
    this._enabled = enabled;
    this._saveConfig();
    if (!enabled && this._client) {
      const client = this._client;
      this._client = null;
      void client.shutdown().catch(() => {
        // Best-effort teardown on opt-out.
      });
    }
    return this.getSettings();
  }

  /**
   * Record an anonymous event. Extra PostHog magic properties keep this from
   * ever building a person profile — events stay strictly anonymous.
   */
  capture<K extends AnalyticsEventName>(
    event: K,
    properties: AnalyticsEventMap[K]
  ): void {
    if (!this._available || !this._enabled) return;
    try {
      // Desktop app: flush eagerly so events aren't lost when the window closes.
      this._client ??= new PostHog(POSTHOG_KEY, {
        host: POSTHOG_HOST,
        flushAt: 1,
        flushInterval: 5_000,
      });
      this._client.capture({
        distinctId: this._anonymousId,
        event,
        properties: {
          ...COMMON_PROPERTIES,
          ...properties,
          // Never materialize a person profile for an anonymous install id.
          $process_person_profile: false,
        },
        // Don't infer location from the ingestion IP.
        disableGeoip: true,
      });
    } catch {
      // Telemetry must never break the app.
    }
  }

  /** Flush and tear down the client on shutdown. Best-effort. */
  async shutdown(): Promise<void> {
    try {
      await this._client?.shutdown();
    } catch {
      // Ignore — we're exiting anyway.
    }
  }

  private get _configPath(): string {
    return path.join(getSettingsDir(), "analytics.json");
  }

  private _saveConfig(): void {
    this._writeConfig({
      anonymousId: this._anonymousId,
      enabled: this._enabled,
    });
  }

  private _writeConfig(config: PersistedAnalytics): void {
    mkdirSync(getSettingsDir(), { recursive: true });
    writeFileSync(
      this._configPath,
      `${JSON.stringify(config, null, 2)}\n`,
      "utf8"
    );
  }

  /**
   * Read `settings/analytics.json`, minting an install id and seeding the file
   * on first run. A missing/partial file falls back to defaults; a corrupt or
   * unreadable file is best-effort and never blocks startup.
   */
  private _loadConfig(): {
    persisted: PersistedAnalytics;
    isFirstRun: boolean;
  } {
    let parsed: Partial<PersistedAnalytics> = {};
    try {
      parsed = JSON.parse(
        readFileSync(this._configPath, "utf8")
      ) as Partial<PersistedAnalytics>;
    } catch {
      // Missing, corrupt, or unreadable - treat as empty and reseed below.
    }

    // Honour a persisted opt-out independently of the install id: a partial
    // file (e.g. a hand-edited or truncated one that lost its id) must never
    // silently re-enroll a user who turned analytics off.
    const enabled =
      typeof parsed.enabled === "boolean"
        ? parsed.enabled
        : DEFAULT_ANALYTICS_SETTINGS.enabled;

    if (parsed.anonymousId) {
      return {
        persisted: { anonymousId: parsed.anonymousId, enabled },
        isFirstRun: false,
      };
    }

    const seeded: PersistedAnalytics = { anonymousId: randomUUID(), enabled };
    try {
      this._writeConfig(seeded);
    } catch {
      // Non-fatal: we'll just mint a fresh id again next launch.
    }
    return { persisted: seeded, isFirstRun: true };
  }
}
