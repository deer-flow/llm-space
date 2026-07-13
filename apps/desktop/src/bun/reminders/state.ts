import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { getSettingsDir } from "@llm-space/core/server";

/**
 * Persisted reminder state (`settings/reminders.json`). Today it backs the
 * GitHub-star nudge; the file is namespaced per reminder so future pushes
 * (changelog, etc.) can slot in beside `githubStar` without reshaping it.
 */
interface GithubStarReminder {
  // How many times the app has been opened (bumped once per launch). The very
  // first appearance is gated on this reaching 2 — i.e. the second open.
  openCount?: number;
  // When we last decided to show the reminder (ms epoch); anchors the 2-day
  // throttle for every appearance after the first.
  lastShownDate?: number;
  // How many times the reminder has been shown; capped at MAX_SHOWN_COUNT.
  shownCount?: number;
  // Retired for good — set when the user clicks through to GitHub, or once the
  // nag cap is reached. Never shown again after this.
  dismissedForever?: boolean;
}

interface RemindersState {
  githubStar?: GithubStarReminder;
}

const STATE_PATH = join(getSettingsDir(), "reminders.json");

/** Show the star nudge at most once every 2 days. */
const REMINDER_INTERVAL_MS = 2 * 24 * 60 * 60 * 1000;
/** Give up (retire the reminder) after this many shows, click or no click. */
const MAX_SHOWN_COUNT = 3;

async function _load(): Promise<RemindersState> {
  try {
    return JSON.parse(await readFile(STATE_PATH, "utf8")) as RemindersState;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }
}

async function _saveGithubStar(patch: GithubStarReminder): Promise<void> {
  const state = await _load();
  const next: RemindersState = {
    ...state,
    githubStar: { ...state.githubStar, ...patch },
  };
  await mkdir(getSettingsDir(), { recursive: true });
  await writeFile(STATE_PATH, JSON.stringify(next, null, 2));
}

/** Whether the reminder should appear on this open (pure; no side effects). */
function _shouldShow(
  star: GithubStarReminder,
  openCount: number,
  now: number
): boolean {
  if (star.dismissedForever) return false;
  // First appearance is gated on the *second* open of the whole lifetime, not
  // on elapsed time — the first launch just counts and stays silent.
  if (star.lastShownDate == null) return openCount >= 2;
  // Every appearance after the first is throttled to once every 2 days.
  return now - star.lastShownDate >= REMINDER_INTERVAL_MS;
}

/**
 * Decide whether to show the GitHub-star reminder on this app open, and record
 * the decision atomically so the caller only has to render.
 *
 * Rules (checked once per launch):
 * - Every launch bumps `openCount`; the first launch stays silent.
 * - The reminder first appears on the second open, regardless of elapsed time.
 * - Later appearances are throttled to once every 2 days since the last show.
 * - Retire permanently once the user clicks through, or after 3 shows.
 */
export async function resolveGithubStarReminder(): Promise<{ show: boolean }> {
  const star = (await _load()).githubStar ?? {};
  const now = Date.now();
  const openCount = (star.openCount ?? 0) + 1;
  const show = _shouldShow(star, openCount, now);

  await _saveGithubStar(
    show
      ? {
          openCount,
          lastShownDate: now,
          shownCount: (star.shownCount ?? 0) + 1,
          dismissedForever: (star.shownCount ?? 0) + 1 >= MAX_SHOWN_COUNT,
        }
      : { openCount }
  );

  return { show };
}

/** Retire the star reminder for good (the user clicked through to GitHub). */
export async function dismissGithubStarReminder(): Promise<void> {
  await _saveGithubStar({ dismissedForever: true });
}
