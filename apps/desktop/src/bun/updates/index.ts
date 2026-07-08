import { Updater } from "electrobun/bun";

import type { UpdateStatus } from "../../shared/updates";
import { mainWindowRPC } from "../rpc";

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
 * Start background update polling: one delayed check shortly after launch,
 * then a slow interval. No-op on the dev channel (electrobun disables updates
 * there anyway).
 */
export async function startUpdaterService() {
  const channel = await Updater.localInfo.channel();
  if (channel === "dev") return;
  setTimeout(() => void checkForUpdates(false), INITIAL_CHECK_DELAY_MS);
  setInterval(() => void checkForUpdates(false), CHECK_INTERVAL_MS);
}
