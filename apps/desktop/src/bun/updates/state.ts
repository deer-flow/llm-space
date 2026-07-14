import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { getSettingsDir } from "@llm-space/core/server";

import { DEFAULT_UPDATE_MODE, type UpdateMode } from "../../shared/updates";

/**
 * Persisted updater state (`settings/updates.json`): the user's update-mode
 * preference and the last bundle hash we launched, used to detect "we just
 * updated" after an applyUpdate relaunch.
 */
interface UpdatesState {
  mode?: UpdateMode;
  /**
   * Last launched bundle hash, keyed by app identifier. `settings/` is shared
   * by every edition (`getLlmSpaceHomePath()` is app-name independent), but the
   * hash covers the whole bundle — so the regular and Performance editions
   * always differ, even at the same version. A single flat hash here would read
   * as "we just updated" on every switch between them and pop a false toast.
   * `mode` stays flat: it is a user preference, not bundle identity.
   */
  lastSeenHashes?: Record<string, string>;
}

const STATE_PATH = join(getSettingsDir(), "updates.json");
const VALID_MODES: readonly UpdateMode[] = ["automatic", "manual", "off"];

async function _load(): Promise<UpdatesState> {
  try {
    return JSON.parse(await readFile(STATE_PATH, "utf8")) as UpdatesState;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }
}

async function _merge(patch: UpdatesState): Promise<void> {
  const next = { ...(await _load()), ...patch };
  await mkdir(getSettingsDir(), { recursive: true });
  await writeFile(STATE_PATH, JSON.stringify(next, null, 2));
}

export async function getUpdateMode(): Promise<UpdateMode> {
  const mode = (await _load()).mode;
  return mode && VALID_MODES.includes(mode) ? mode : DEFAULT_UPDATE_MODE;
}

export async function setUpdateMode(mode: UpdateMode): Promise<void> {
  await _merge({ mode });
}

export async function getLastSeenHash(
  identifier: string
): Promise<string | undefined> {
  return (await _load()).lastSeenHashes?.[identifier];
}

export async function setLastSeenHash(
  identifier: string,
  hash: string
): Promise<void> {
  const lastSeenHashes = (await _load()).lastSeenHashes ?? {};
  await _merge({ lastSeenHashes: { ...lastSeenHashes, [identifier]: hash } });
}
