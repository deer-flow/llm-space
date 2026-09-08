import { beforeEach, afterEach, describe, expect, test } from "bun:test";
import { mkdirSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  VercelDeployError,
  collectSingleFile,
  collectStaticFiles,
  deploySingleFile,
  deployStaticFolder,
} from "./vercel-client";

const ORIGINAL_HOME = process.env.LLM_SPACE_HOME;
const TEMP_DIRS: string[] = [];

beforeEach(() => {
  process.env.LLM_SPACE_HOME = mkdtempSyncForTest();
});

afterEach(async () => {
  for (const dir of TEMP_DIRS.splice(0)) {
    await rm(dir, { recursive: true, force: true });
  }
  if (ORIGINAL_HOME === undefined) {
    delete process.env.LLM_SPACE_HOME;
  } else {
    process.env.LLM_SPACE_HOME = ORIGINAL_HOME;
  }
});

function mkdtempSyncForTest(): string {
  const dir = path.join(
    os.tmpdir(),
    `llm-space-vercel-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  TEMP_DIRS.push(dir);
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** Build a fetch mock that replays scripted JSON responses in order. */
function fetchScript(responses: { status: number; body: unknown }[]) {
  const calls: { url: string; init?: RequestInit; bodyText?: string }[] = [];
  const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
    calls.push({
      url: String(url),
      init,
      bodyText: typeof init?.body === "string" ? init.body : undefined,
    });
    const next = responses.shift();
    if (!next) {
      throw new Error("No scripted response left");
    }
    return new Response(JSON.stringify(next.body), {
      status: next.status,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  return { fetchImpl, calls };
}

const NO_SLEEP = () => Promise.resolve();

async function makeSite(): Promise<string> {
  const dir = path.join(os.tmpdir(), `llm-space-site-${Date.now()}`);
  TEMP_DIRS.push(dir);
  await mkdir(path.join(dir, "assets"), { recursive: true });
  await mkdir(path.join(dir, "node_modules", "left-pad"), { recursive: true });
  await writeFile(path.join(dir, "index.html"), "<h1>hi</h1>", "utf8");
  await writeFile(path.join(dir, "assets", "style.css"), "body{}", "utf8");
  await writeFile(
    path.join(dir, "node_modules", "left-pad", "index.js"),
    "x",
    "utf8"
  );
  return dir;
}

describe("collectStaticFiles", () => {
  test("collects deployable files, skipping excluded directories", async () => {
    const dir = await makeSite();
    const collected = await collectStaticFiles(dir);
    const names = collected.files.map((file) => file.file);
    expect(names).toContain("index.html");
    expect(names).toContain("assets/style.css");
    expect(names.some((name) => name.startsWith("node_modules"))).toBe(false);
    expect(collected.name).toBe(path.basename(dir));
  });

  test("rejects a folder without an index.html", async () => {
    const dir = path.join(os.tmpdir(), `llm-space-empty-${Date.now()}`);
    TEMP_DIRS.push(dir);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "about.html"), "<p>x</p>", "utf8");
    expect(collectStaticFiles(dir)).rejects.toBeInstanceOf(VercelDeployError);
  });

  test("rejects files over the per-file size limit", async () => {
    const dir = path.join(os.tmpdir(), `llm-space-big-${Date.now()}`);
    TEMP_DIRS.push(dir);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "index.html"), "<h1>hi</h1>", "utf8");
    const bigPath = path.join(dir, "assets", "huge.png");
    await mkdir(path.join(dir, "assets"), { recursive: true });
    await writeFile(bigPath, Buffer.alloc(11 * 1024 * 1024));
    expect(collectStaticFiles(dir)).rejects.toBeInstanceOf(VercelDeployError);
  });

  test("does not follow excluded or hidden directories", async () => {
    const dir = path.join(os.tmpdir(), `llm-space-hidden-${Date.now()}`);
    TEMP_DIRS.push(dir);
    await mkdir(path.join(dir, ".git"), { recursive: true });
    await mkdir(path.join(dir, ".vite"), { recursive: true });
    await writeFile(path.join(dir, "index.html"), "x", "utf8");
    await writeFile(path.join(dir, ".git", "config"), "x", "utf8");
    await writeFile(path.join(dir, ".vite", "cache.js"), "x", "utf8");
    const collected = await collectStaticFiles(dir);
    expect(collected.files).toHaveLength(1);
  });

  test("preflight mode (withContents: false) reports sizes without reading file contents", async () => {
    const dir = await makeSite();
    const collected = await collectStaticFiles(dir, { withContents: false });
    expect(collected.files).toHaveLength(2);
    const index = collected.files.find((file) => file.file === "index.html");
    expect(index?.sizeBytes).toBe("<h1>hi</h1>".length);
    // No contents: data stays empty and no base64 encoding is flagged.
    expect(index?.data).toBe("");
    expect(index?.encoding).toBeUndefined();
  });
});

describe("deployStaticFolder", () => {
  test("creates the deployment, polls until READY, and returns the URL", async () => {
    const dir = await makeSite();
    const { fetchImpl, calls } = fetchScript([
      { status: 200, body: { id: "dpl_1", readyState: "BUILDING" } },
      {
        status: 200,
        body: { id: "dpl_1", url: "my-site.vercel.app", readyState: "READY" },
      },
    ]);
    const result = await deployStaticFolder({
      token: "vercel-token-1",
      dir,
      fetchImpl,
      sleep: NO_SLEEP,
    });

    expect(result.url).toBe("https://my-site.vercel.app");
    expect(result.fileCount).toBe(2);
    expect(calls).toHaveLength(2);
    const create = JSON.parse(calls[0].bodyText!) as {
      name: string;
      files: { file: string; data: string; encoding?: string }[];
      projectSettings: { framework: null };
    };
    expect(create.name).toBe(path.basename(dir));
    expect(create.projectSettings.framework).toBeNull();
    const style = create.files.find((file) => file.file === "assets/style.css");
    expect(style?.data).toBe("body{}");
    expect(calls[0].init!.headers).toMatchObject({
      Authorization: "Bearer vercel-token-1",
    });
  });

  test("maps a 401 to a friendly token error", async () => {
    const dir = await makeSite();
    const { fetchImpl } = fetchScript([
      { status: 401, body: { message: "bad token" } },
    ]);
    expect(
      deployStaticFolder({ token: "bad", dir, fetchImpl, sleep: NO_SLEEP })
    ).rejects.toThrow(/token/i);
  });

  test("surfaces an ERROR ready state", async () => {
    const dir = await makeSite();
    const { fetchImpl } = fetchScript([
      { status: 200, body: { id: "dpl_2", readyState: "BUILDING" } },
      {
        status: 200,
        body: { id: "dpl_2", readyState: "ERROR", message: "build failed" },
      },
    ]);
    expect(
      deployStaticFolder({ token: "t", dir, fetchImpl, sleep: NO_SLEEP })
    ).rejects.toThrow(/build failed/);
  });

  test("times out when the deployment never becomes ready", async () => {
    const dir = await makeSite();
    const { fetchImpl } = fetchScript([
      { status: 200, body: { id: "dpl_3", readyState: "BUILDING" } },
      { status: 200, body: { id: "dpl_3", readyState: "BUILDING" } },
    ]);
    expect(
      deployStaticFolder({
        token: "t",
        dir,
        fetchImpl,
        sleep: NO_SLEEP,
        timeoutMs: 0,
      })
    ).rejects.toThrow(/timed out/);
  });
});

describe("collectSingleFile", () => {
  test("collects one HTML file as the deployment index page", async () => {
    const dir = path.join(os.tmpdir(), `llm-space-file-${Date.now()}`);
    TEMP_DIRS.push(dir);
    await mkdir(dir, { recursive: true });
    const file = path.join(dir, "landing.html");
    await writeFile(file, "<h1>hello</h1>", "utf8");

    const collected = await collectSingleFile(file);
    expect(collected.name).toBe("landing");
    expect(collected.files).toHaveLength(1);
    expect(collected.files[0]?.file).toBe("index.html");
    expect(collected.files[0]?.data).toBe("<h1>hello</h1>");
    expect(collected.totalBytes).toBe(14);
  });

  test("preflight mode reports size without reading contents", async () => {
    const dir = path.join(os.tmpdir(), `llm-space-file-${Date.now()}`);
    TEMP_DIRS.push(dir);
    await mkdir(dir, { recursive: true });
    const file = path.join(dir, "page.html");
    await writeFile(file, "<p>x</p>", "utf8");

    const collected = await collectSingleFile(file, { withContents: false });
    expect(collected.files[0]?.data).toBe("");
    expect(collected.totalBytes).toBe(8);
  });

  test("rejects a directory target", async () => {
    const dir = path.join(os.tmpdir(), `llm-space-file-${Date.now()}`);
    TEMP_DIRS.push(dir);
    await mkdir(dir, { recursive: true });
    expect(collectSingleFile(dir)).rejects.toThrow(VercelDeployError);
  });
});

describe("deploySingleFile", () => {
  test("uploads the file as index.html and returns the URL", async () => {
    const dir = path.join(os.tmpdir(), `llm-space-file-${Date.now()}`);
    TEMP_DIRS.push(dir);
    await mkdir(dir, { recursive: true });
    const file = path.join(dir, "demo.html");
    await writeFile(file, "<h1>deploy me</h1>", "utf8");

    const { fetchImpl, calls } = fetchScript([
      { status: 200, body: { id: "dpl_1", url: "demo.vercel.app" } },
      { status: 200, body: { readyState: "READY", url: "demo.vercel.app" } },
    ]);
    const result = await deploySingleFile({
      token: "tok",
      file,
      fetchImpl,
      sleep: NO_SLEEP,
    });
    expect(result.url).toBe("https://demo.vercel.app");
    expect(result.fileCount).toBe(1);
    const body = JSON.parse(calls[0]?.bodyText ?? "{}") as {
      name?: string;
      files?: { file: string; data: string }[];
    };
    expect(body.name).toBe("demo");
    expect(body.files).toEqual([
      { file: "index.html", data: "<h1>deploy me</h1>" },
    ]);
  });
});
