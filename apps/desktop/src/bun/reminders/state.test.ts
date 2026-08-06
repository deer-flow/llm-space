import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { resolveGithubStarReminder } from "./state";

const ORIGINAL_HOME = process.env.LLM_SPACE_HOME;
let testHome = "";

beforeEach(async () => {
  testHome = await mkdtemp(path.join(os.tmpdir(), "llm-space-reminders-"));
  process.env.LLM_SPACE_HOME = testHome;
});

afterEach(async () => {
  process.env.LLM_SPACE_HOME = ORIGINAL_HOME;
  await rm(testHome, { recursive: true, force: true });
});

async function _readGithubStarState(): Promise<Record<string, unknown>> {
  const content = await readFile(
    path.join(testHome, "settings", "reminders.json"),
    "utf8"
  );
  const parsed: unknown = JSON.parse(content);
  if (!parsed || typeof parsed !== "object" || !("githubStar" in parsed)) {
    throw new Error("GitHub star reminder state was not persisted.");
  }
  const githubStar = parsed.githubStar;
  if (!githubStar || typeof githubStar !== "object") {
    throw new Error("GitHub star reminder state is invalid.");
  }
  return githubStar as Record<string, unknown>;
}

describe("resolveGithubStarReminder", () => {
  test("counts repeated renderer requests only once per app launch", async () => {
    expect(await resolveGithubStarReminder("first-launch")).toEqual({
      show: false,
    });
    expect(await resolveGithubStarReminder("first-launch")).toEqual({
      show: false,
    });

    expect(await _readGithubStarState()).toMatchObject({
      openCount: 1,
      lastResolvedLaunchId: "first-launch",
      lastResolvedShow: false,
    });
  });

  test("first shows on a distinct second app launch and stays idempotent", async () => {
    expect(await resolveGithubStarReminder("first-launch")).toEqual({
      show: false,
    });
    expect(await resolveGithubStarReminder("second-launch")).toEqual({
      show: true,
    });
    expect(await resolveGithubStarReminder("second-launch")).toEqual({
      show: true,
    });

    expect(await _readGithubStarState()).toMatchObject({
      openCount: 2,
      shownCount: 1,
      lastResolvedLaunchId: "second-launch",
      lastResolvedShow: true,
    });
  });
});
