import { afterEach, describe, expect, test } from "bun:test";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { getWindowStatePath } from "../../../src/server/paths";
import { WindowStateStore } from "../../../src/server/window-state";

const ORIGINAL_HOME = process.env.LLM_SPACE_HOME;
const TEMP_DIRS: string[] = [];

afterEach(async () => {
  process.env.LLM_SPACE_HOME = ORIGINAL_HOME;
  await Promise.all(
    TEMP_DIRS.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true })
    )
  );
});

describe("WindowStateStore", () => {
  test("recovers the reported truncated window state and rewrites valid JSON", async () => {
    const homePath = await mkdtemp(path.join(os.tmpdir(), "llm-space-window-"));
    TEMP_DIRS.push(homePath);
    process.env.LLM_SPACE_HOME = homePath;
    const filePath = getWindowStatePath();
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(
      filePath,
      '{"frame":{"x":2560,"y":1871,"width":1440,"height":1265},"isMaximized":false,"isFullScree'
    );

    const store = await WindowStateStore.load();
    expect(store.state).toEqual({
      frame: { x: 2560, y: 1871, width: 1440, height: 1265 },
      isMaximized: false,
    });
    const repaired = await readFile(filePath, "utf8");
    expect(() => {
      JSON.parse(repaired);
    }).not.toThrow();
    expect(
      (await readdir(path.dirname(filePath))).some((name) =>
        name.startsWith("window.json.corrupt-")
      )
    ).toBe(true);
  });

  test("serializes frame and zoom updates without dropping fields", async () => {
    const homePath = await mkdtemp(path.join(os.tmpdir(), "llm-space-window-"));
    TEMP_DIRS.push(homePath);
    process.env.LLM_SPACE_HOME = homePath;
    const store = await WindowStateStore.load();

    void store.update({
      frame: { x: 10, y: 20, width: 1000, height: 700 },
    });
    void store.update({ zoom: 1.2 });
    await store.flush();

    expect(JSON.parse(await readFile(getWindowStatePath(), "utf8"))).toEqual({
      frame: { x: 10, y: 20, width: 1000, height: 700 },
      zoom: 1.2,
    });
  });
});
