import { Updater } from "electrobun/bun";

import type { UpdateMode, UpdateStatus } from "../../shared/updates";
import { setUpdateReadyInMenu } from "../app/menu";
import { mainWindowRPC } from "../rpc";

import {
  getLastSeenHash,
  getUpdateMode,
  setLastSeenHash,
  setUpdateMode as persistUpdateMode,
} from "./state";

const INITIAL_CHECK_DELAY_MS = 30_000;
const CHECK_INTERVAL_MS = 4 * 60 * 60_000;
// electrobun's applyUpdate quits the process on success, so still being alive
// after this grace period means the update did not install.
const APPLY_GRACE_MS = 5_000;

let isCheckInFlight = false;
// Whether the in-flight pass reports full progress (menu-triggered) or only
// the final "ready" prompt (background timer).
let isPassManual = false;
let lastStatus: UpdateStatus | null = null;
// The version we launched into after an applyUpdate relaunch, if any — pulled
// once by the renderer (race-free) to show the "Updated to …" toast.
let installedVersion: string | null = null;
let backgroundTimer: ReturnType<typeof setTimeout> | null = null;
let backgroundInterval: ReturnType<typeof setInterval> | null = null;

function _sendStatus(status: UpdateStatus) {
  lastStatus = status;
  mainWindowRPC.send.updateStatusChanged({ status, manual: isPassManual });
}

/**
 * One check→download pass. Passes are serialized; a manual trigger landing
 * while a background pass is in flight upgrades that pass to manual and
 * replays its latest state, so the menu click gets immediate feedback instead
 * of being silently dropped.
 *
 * Every pass with an update available re-runs `downloadUpdate` — it is cheap
 * when the latest bundle is already on disk, it fetches the newer build when
 * the feed has moved on since a previous download, and it re-arms electrobun's
 * internal `updateReady` flag (which any `checkForUpdate` call resets, and
 * which `applyUpdate` requires). "ready" is therefore only ever reported
 * immediately after a download pass, when a restart is actually possible.
 */
export async function checkForUpdates(manual: boolean) {
  if (isCheckInFlight) {
    if (manual && !isPassManual) {
      isPassManual = true;
      if (lastStatus) _sendStatus(lastStatus);
    }
    return;
  }
  isCheckInFlight = true;
  isPassManual = manual;
  try {
    _sendStatus({ state: "checking" });
    const info = await Updater.checkForUpdate();
    if (info.error) {
      _sendStatus({ state: "error", message: info.error });
      return;
    }
    if (!info.updateAvailable) {
      // Revert a stale "Restart to Update" menu item — the ready build the
      // renderer's badge tracked may have been rolled back on the feed.
      setUpdateReadyInMenu(null);
      const { version } = await Updater.getLocalInfo();
      _sendStatus({ state: "up-to-date", version });
      return;
    }
    _sendStatus({ state: "downloading", version: info.version });
    await Updater.downloadUpdate();
    if (!Updater.updateInfo()?.updateReady) {
      const message =
        Updater.updateInfo()?.error || "download did not complete";
      _sendStatus({ state: "error", message });
      return;
    }
    setUpdateReadyInMenu(info.version);
    _sendStatus({ state: "ready", version: info.version });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    _sendStatus({ state: "error", message });
  } finally {
    isCheckInFlight = false;
  }
}

/**
 * Quit, swap in the downloaded bundle and relaunch. electrobun's applyUpdate
 * quits the process on success, so resolving (or throwing) means the install
 * did not happen — e.g. the machine is offline, or the update feed moved on
 * while the "ready" prompt sat open. Fall back to a fresh manual pass so the
 * state re-converges (re-download → new "ready", or a visible error).
 */
export async function applyUpdateAndRestart() {
  try {
    await Updater.applyUpdate();
  } catch (error) {
    isPassManual = true;
    const message = error instanceof Error ? error.message : String(error);
    _sendStatus({ state: "error", message });
    return;
  }
  setTimeout(() => void checkForUpdates(true), APPLY_GRACE_MS);
}

/**
 * The version we just updated into this launch (null if unchanged). Consumed
 * once: a webview reload re-mounts the renderer and re-pulls, so clearing here
 * keeps the "Updated to …" toast to a single show per process (also guards the
 * dev StrictMode double-mount).
 */
export function getInstalledVersion(): string | null {
  const version = installedVersion;
  installedVersion = null;
  return version;
}

export async function getUpdateModeSetting(): Promise<UpdateMode> {
  return getUpdateMode();
}

/** Persist the update mode and re-arm/tear-down the background timers live. */
export async function setUpdateModeSetting(mode: UpdateMode) {
  await persistUpdateMode(mode);
  _applySchedule(mode);
}

function _clearSchedule() {
  if (backgroundTimer) clearTimeout(backgroundTimer);
  if (backgroundInterval) clearInterval(backgroundInterval);
  backgroundTimer = null;
  backgroundInterval = null;
}

function _applySchedule(mode: UpdateMode) {
  _clearSchedule();
  // Only `automatic` polls; `manual`/`off` rely on the menu item.
  if (mode !== "automatic") return;
  backgroundTimer = setTimeout(
    () => void checkForUpdates(false),
    INITIAL_CHECK_DELAY_MS
  );
  backgroundInterval = setInterval(
    () => void checkForUpdates(false),
    CHECK_INTERVAL_MS
  );
}

/**
 * Start the updater: detect whether this launch is a just-applied update
 * (bundle hash changed since last launch) and, unless the dev channel or an
 * `off`/`manual` mode says otherwise, begin background polling. The dev
 * channel disables updates entirely (electrobun does too).
 */
export async function startUpdaterService() {
  const { channel, hash, version } = await Updater.getLocalInfo();
  if (channel === "dev") return;

  const lastSeen = await getLastSeenHash();
  if (lastSeen && lastSeen !== hash) installedVersion = version;
  if (lastSeen !== hash) await setLastSeenHash(hash);

  _applySchedule(await getUpdateMode());
}
