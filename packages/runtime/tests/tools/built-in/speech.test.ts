import { describe, expect, test } from "bun:test";
import { rejects } from "node:assert/strict";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";

import { MacSpeechManager } from "../../../src/tools/built-in/speech";

class FakeSpeechProcess extends EventEmitter {
  stdin = new PassThrough();
  stdout = new PassThrough();
  stderr = new PassThrough();
  exitCode = null;
  signalCode: string | null = null;
  killed = false;
  kill() {
    this.killed = true;
    this.signalCode = "SIGTERM";
    return true;
  }
}

function fixture(failSpawn = false) {
  const children: FakeSpeechProcess[] = [];
  const commands: string[][] = [];
  const manager = new MacSpeechManager({
    listVoices: async () =>
      "Samantha en_US # Hello!\nEddy (中文（中国大陆）) zh_CN # 你好！\n",
    spawnSpeech(args) {
      commands.push(args);
      const child = new FakeSpeechProcess();
      children.push(child);
      queueMicrotask(() =>
        child.emit(failSpawn ? "error" : "spawn", new Error("spawn failed"))
      );
      return child as unknown as ChildProcessWithoutNullStreams;
    },
  });
  return { manager, children, commands };
}

describe("macOS Speech", () => {
  test("preserves localized voice names and language codes", async () => {
    const { manager } = fixture();
    expect(await manager.listVoices()).toEqual([
      { name: "Samantha", language: "en_US", sample: "Hello!" },
      { name: "Eddy (中文（中国大陆）)", language: "zh_CN", sample: "你好！" },
    ]);
  });

  test("passes text through stdin without interpreting shell syntax or options", async () => {
    const { manager, children, commands } = fixture();
    const text = "-o /tmp/nope $(touch /tmp/nope) `whoami`\n你好";
    try {
      expect(
        (await manager.speak({ text, voice: "Samantha", rate: 180 })).status
      ).toBe("started");
      expect(commands).toEqual([["-f", "-", "-v", "Samantha", "-r", "180"]]);
      expect((children[0].stdin.read() as Buffer).toString()).toBe(text);
    } finally {
      manager.shutdown();
      children.forEach((child) => child.emit("close"));
    }
  });

  test("replaces owned speech and ignores a previous process closing late", async () => {
    const { manager, children } = fixture();
    await manager.speak({ text: "first" });
    await manager.speak({ text: "second" });
    expect(children[0].killed).toBe(true);
    children[0].emit("close");
    expect(manager.stop().status).toBe("stopped");
    expect(children[1].killed).toBe(true);
    expect(manager.stop().status).toBe("idle");
    children[1].emit("close");
  });

  test("rejects invalid inputs before spawning", async () => {
    const { manager, commands } = fixture();
    for (const args of [
      { text: "" },
      { text: "x", rate: 0 },
      { text: "x", rate: 100.5 },
      { text: "x", voice: "missing" },
      { text: "x".repeat(10001) },
    ]) {
      await rejects(manager.speak(args));
    }
    expect(commands).toEqual([]);
  });

  test("surfaces spawn errors and cleans up the active process", async () => {
    const { manager } = fixture(true);
    await rejects(manager.speak({ text: "hello" }), /spawn failed/);
    expect(manager.stop().status).toBe("idle");
  });

  test("shutdown stops playback and prevents new speech", async () => {
    const { manager, children } = fixture();
    await manager.speak({ text: "hello" });
    manager.shutdown();
    expect(children[0].killed).toBe(true);
    children[0].emit("close");
    await rejects(manager.speak({ text: "later" }), /shut down/);
  });
});
