import { describe, expect, test } from "bun:test";
import { appendFileSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { decodeLaunchUrl, openLaunchUrlInbox } from "./launch-url-inbox";

describe("macOS launch URL inbox", () => {
  test("replays a URL that arrived before Bun started", () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), "launch-url-inbox-"));
    const filePath = path.join(directory, "urls");
    const url = "llm-space://shared/gist/threads/cold-start";
    writeFileSync(filePath, `${Buffer.from(url).toString("base64")}\n`);
    const received: string[] = [];

    const inbox = openLaunchUrlInbox(filePath, (value) => received.push(value));
    inbox.close();

    expect(received).toEqual([url]);
  });

  test("follows URLs delivered while the app is running", async () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), "launch-url-inbox-"));
    const filePath = path.join(directory, "urls");
    const url = "llm-space://shared/gist/threads/warm-start";
    writeFileSync(filePath, "");
    const received: string[] = [];
    const inbox = openLaunchUrlInbox(filePath, (value) => received.push(value));

    appendFileSync(filePath, `${Buffer.from(url).toString("base64")}\n`);
    await _waitFor(() => received.length === 1);
    inbox.close();

    expect(received).toEqual([url]);
  });

  test("rejects malformed and non-URL records", () => {
    expect(decodeLaunchUrl("not base64")).toBeNull();
    expect(
      decodeLaunchUrl(Buffer.from("plain text").toString("base64"))
    ).toBeNull();
  });
});

async function _waitFor(predicate: () => boolean): Promise<void> {
  const deadline = Date.now() + 2_000;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error("Timed out waiting for inbox");
    await Bun.sleep(20);
  }
}
