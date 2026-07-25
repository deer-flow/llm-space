import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { getOrDownloadServerPackage } from "./server-package-cache";

function _response(body: string | Uint8Array, status = 200): Response {
  return new Response(body instanceof Uint8Array ? Buffer.from(body) : body, {
    status,
  });
}

function _sha256(bytes: string | Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function _url(value: string | URL | Request): string {
  if (typeof value === "string") return value;
  if (value instanceof URL) return value.toString();
  return value.url;
}

describe("server package cache", () => {
  test("downloads archive and verifies checksum", async () => {
    const home = await mkdtemp(path.join(tmpdir(), "llm-space-cache-test-"));
    process.env.LLM_SPACE_HOME = home;
    const bytes = new TextEncoder().encode("archive");
    const calls: string[] = [];

    const result = await getOrDownloadServerPackage(
      {
        assetName: "server.tar.gz",
        assetUrl: "https://example.test/server.tar.gz",
        checksumUrl: "https://example.test/server.tar.gz.sha256",
      },
      ((url) => {
        const urlText = _url(url);
        calls.push(urlText);
        if (urlText.endsWith(".sha256")) {
          return Promise.resolve(_response(`${_sha256(bytes)}  server.tar.gz\n`));
        }
        return Promise.resolve(_response(bytes));
      }) as typeof fetch
    );

    expect(calls).toEqual([
      "https://example.test/server.tar.gz.sha256",
      "https://example.test/server.tar.gz",
    ]);
    expect(await readFile(result.path, "utf8")).toBe("archive");
    expect(result.sha256).toBe(_sha256(bytes));
    await rm(home, { recursive: true, force: true });
  });

  test("reuses valid cached archive", async () => {
    const home = await mkdtemp(path.join(tmpdir(), "llm-space-cache-test-"));
    process.env.LLM_SPACE_HOME = home;
    const cacheDir = path.join(home, "settings", "remote-runtime-packages");
    mkdirSync(cacheDir, { recursive: true });
    const archivePath = path.join(cacheDir, "server.tar.gz");
    writeFileSync(archivePath, "cached");
    const sha256 = _sha256("cached");
    const calls: string[] = [];

    const result = await getOrDownloadServerPackage(
      {
        assetName: "server.tar.gz",
        assetUrl: "https://example.test/server.tar.gz",
        checksumUrl: "https://example.test/server.tar.gz.sha256",
      },
      ((url) => {
        calls.push(_url(url));
        return Promise.resolve(_response(`${sha256}  server.tar.gz\n`));
      }) as typeof fetch
    );

    expect(result.path).toBe(archivePath);
    expect(calls).toEqual(["https://example.test/server.tar.gz.sha256"]);
    expect(await readFile(result.path, "utf8")).toBe("cached");
    await rm(home, { recursive: true, force: true });
  });

  test("rejects checksum mismatch without writing final cache file", async () => {
    const home = await mkdtemp(path.join(tmpdir(), "llm-space-cache-test-"));
    process.env.LLM_SPACE_HOME = home;
    const promise = getOrDownloadServerPackage(
      {
        assetName: "server.tar.gz",
        assetUrl: "https://example.test/server.tar.gz",
        checksumUrl: "https://example.test/server.tar.gz.sha256",
      },
      ((url) => {
        if (_url(url).endsWith(".sha256")) {
          return Promise.resolve(_response(`${_sha256("other")}  server.tar.gz\n`));
        }
        return Promise.resolve(_response("archive"));
      }) as typeof fetch
    );

    expect(promise).rejects.toThrow("checksum mismatch");
    await promise.catch(() => undefined);
    expect(
      existsSync(path.join(home, "settings", "remote-runtime-packages", "server.tar.gz"))
    ).toBe(false);
    await rm(home, { recursive: true, force: true });
  });

  test("reports archive http failures", async () => {
    const home = await mkdtemp(path.join(tmpdir(), "llm-space-cache-test-"));
    process.env.LLM_SPACE_HOME = home;
    const promise = getOrDownloadServerPackage(
      {
        assetName: "server.tar.gz",
        assetUrl: "https://example.test/server.tar.gz",
        checksumUrl: "https://example.test/server.tar.gz.sha256",
      },
      ((url) => {
        if (_url(url).endsWith(".sha256")) {
          return Promise.resolve(_response("", 404));
        }
        return Promise.resolve(_response("nope", 503));
      }) as typeof fetch
    );

    expect(promise).rejects.toThrow("HTTP 503");
    await promise.catch(() => undefined);
    await rm(home, { recursive: true, force: true });
  });
});
