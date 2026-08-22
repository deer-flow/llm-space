import { MESSAGES } from "@llm-space/ui/lib/i18n/messages";
import { Updater, type UpdateStatusEntry } from "electrobun/bun";

import type { UpdateMode, UpdateStatus } from "../../shared/updates";
import { isChineseLocale } from "../app/locales";
import { setUpdateReadyInMenu } from "../app/menu";

import {
  getLastSeenHash,
  getUpdateMode,
  setLastSeenHash,
  setUpdateMode as persistUpdateMode,
} from "./state";

const INITIAL_CHECK_DELAY_MS = 30_000;
const CHECK_INTERVAL_MS = 4 * 60 * 60_000;
const APPLY_GRACE_MS = 5_000;

/** The current locale's error templates (`t.errors`), resolved per call. */
const _errors = () => MESSAGES[isChineseLocale() ? "zh" : "en"].errors;

export interface UpdateStatusMessage {
  status: UpdateStatus;
  manual: boolean;
}

/** Process-scoped updater state and scheduling. */
export class UpdaterService {
  private _isCheckInFlight = false;
  private _isPassManual = false;
  private _lastStatus: UpdateStatus | null = null;
  private _installedVersion: string | null = null;
  private _backgroundTimer: ReturnType<typeof setTimeout> | null = null;
  private _backgroundInterval: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly _sendUpdateStatus: (message: UpdateStatusMessage) => void
  ) {}

  async checkForUpdates(manual: boolean): Promise<void> {
    if (this._isCheckInFlight) {
      if (manual && !this._isPassManual) {
        this._isPassManual = true;
        if (this._lastStatus) this._sendStatus(this._lastStatus);
      }
      return;
    }
    this._isCheckInFlight = true;
    this._isPassManual = manual;
    try {
      this._sendStatus({ state: "checking" });
      const info = await Updater.checkForUpdate();
      if (info.error) {
        this._sendStatus({ state: "error", message: info.error });
        return;
      }
      if (!info.updateAvailable) {
        setUpdateReadyInMenu(null);
        const { version } = await Updater.getLocalInfo();
        this._sendStatus({ state: "up-to-date", version });
        return;
      }
      this._sendStatus({ state: "downloading", version: info.version });
      Updater.onStatusChange((entry: UpdateStatusEntry) => {
        if (entry.status !== "download-progress") return;
        const { progress, bytesDownloaded, totalBytes } = entry.details ?? {};
        this._sendStatus({
          state: "downloading",
          version: info.version,
          progress,
          bytesDownloaded,
          totalBytes,
        });
      });
      try {
        await Updater.downloadUpdate();
      } finally {
        Updater.onStatusChange(null);
      }
      if (!Updater.updateInfo()?.updateReady) {
        const message =
          Updater.updateInfo()?.error || _errors().updatesDownloadIncomplete;
        this._sendStatus({ state: "error", message });
        return;
      }
      setUpdateReadyInMenu(info.version);
      this._sendStatus({ state: "ready", version: info.version });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this._sendStatus({ state: "error", message });
    } finally {
      this._isCheckInFlight = false;
    }
  }

  async applyUpdateAndRestart(): Promise<void> {
    try {
      await Updater.applyUpdate();
    } catch (error) {
      this._isPassManual = true;
      const message = error instanceof Error ? error.message : String(error);
      this._sendStatus({ state: "error", message });
      return;
    }
    setTimeout(() => void this.checkForUpdates(true), APPLY_GRACE_MS);
  }

  getInstalledVersion(): string | null {
    const version = this._installedVersion;
    this._installedVersion = null;
    return version;
  }

  async getUpdateModeSetting(): Promise<UpdateMode> {
    return getUpdateMode();
  }

  async setUpdateModeSetting(mode: UpdateMode): Promise<void> {
    await persistUpdateMode(mode);
    this._applySchedule(mode);
  }

  async start(): Promise<void> {
    const { channel, hash, version, identifier } = await Updater.getLocalInfo();
    if (channel === "dev") return;

    const lastSeen = await getLastSeenHash(identifier);
    if (lastSeen && lastSeen !== hash) this._installedVersion = version;
    if (lastSeen !== hash) await setLastSeenHash(identifier, hash);

    this._applySchedule(await getUpdateMode());
  }

  stop(): void {
    this._clearSchedule();
  }

  private _sendStatus(status: UpdateStatus): void {
    this._lastStatus = status;
    this._sendUpdateStatus({ status, manual: this._isPassManual });
  }

  private _clearSchedule(): void {
    if (this._backgroundTimer) clearTimeout(this._backgroundTimer);
    if (this._backgroundInterval) clearInterval(this._backgroundInterval);
    this._backgroundTimer = null;
    this._backgroundInterval = null;
  }

  private _applySchedule(mode: UpdateMode): void {
    this._clearSchedule();
    if (mode !== "automatic") return;
    this._backgroundTimer = setTimeout(
      () => void this.checkForUpdates(false),
      INITIAL_CHECK_DELAY_MS
    );
    this._backgroundInterval = setInterval(
      () => void this.checkForUpdates(false),
      CHECK_INTERVAL_MS
    );
  }
}
