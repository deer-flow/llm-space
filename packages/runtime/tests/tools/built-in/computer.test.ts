import { describe, expect, test } from "bun:test";
import os from "node:os";
import path from "node:path";

import {
  createComputerBuiltInTools,
  defaultComputerDependencies,
  type ComputerDependencies,
} from "../../../src/tools/built-in/computer";

interface RecordedInvocation {
  command: string;
  args: string[];
}

interface FakeComputerOptions {
  /** Written to the temp path `screencapture` "created". */
  screenshotBytes?: Uint8Array;
  /** Logical main-display size reported to the scale note; null to disable. */
  screenPoints?: { width: number; height: number } | null;
}

/** A minimal PNG whose IHDR advertises the given pixel dimensions. */
function _pngBytes(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(32);
  for (let index = 0; index < 8; index += 1) {
    bytes[index] = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a][index]!;
  }
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

function _fakeDependencies(options: FakeComputerOptions = {}): {
  deps: ComputerDependencies;
  invocations: RecordedInvocation[];
  tempPaths: string[];
  removed: string[];
} {
  const invocations: RecordedInvocation[] = [];
  const tempPaths: string[] = [];
  const removed: string[] = [];
  let counter = 0;
  const deps: ComputerDependencies = {
    async run(command, args) {
      invocations.push({ command, args });
      return "";
    },
    async readFile(filePath) {
      if (!tempPaths.includes(filePath)) {
        throw new Error(`Unexpected read: ${filePath}`);
      }
      return options.screenshotBytes ?? new Uint8Array([1, 2, 3]);
    },
    async removeFile(filePath) {
      removed.push(filePath);
    },
    temporaryPath(extension) {
      counter += 1;
      const filePath = path.join("/tmp", `fake-${counter}${extension}`);
      tempPaths.push(filePath);
      return filePath;
    },
    async screenPoints() {
      return options.screenPoints === undefined
        ? { width: 1710, height: 1107 }
        : options.screenPoints;
    },
  };
  return { deps, invocations, tempPaths, removed };
}

function _tool(
  name: string,
  deps: ComputerDependencies
):
  | { execute(args: Record<string, unknown>): Promise<unknown> }
  | undefined {
  return createComputerBuiltInTools(deps).find(
    (entry) => entry.tool.name === name
  );
}

describe("computer built-in tools", () => {
  test("exposes the five tools with model-facing names", () => {
    const { deps } = _fakeDependencies();
    const names = createComputerBuiltInTools(deps).map(
      (entry) => entry.tool.name
    );
    expect(names).toEqual([
      "computer_screenshot",
      "computer_click",
      "computer_scroll",
      "computer_type",
      "computer_key",
    ]);
    for (const entry of createComputerBuiltInTools(deps)) {
      expect(entry.tool.type).toBe("builtin");
      expect(entry.tool.description.length).toBeGreaterThan(0);
      expect(entry.tool.parameters).toBeTruthy();
    }
  });

  describe("computer_screenshot", () => {
    test("captures the full screen and reports the pixel-to-point scale", async () => {
      const { deps, invocations, tempPaths, removed } = _fakeDependencies({
        screenshotBytes: _pngBytes(3420, 2214),
        screenPoints: { width: 1710, height: 1107 },
      });
      const result = (await _tool("computer_screenshot", deps)!.execute({})) as {
        content: { type: string; mimeType?: string; data?: string; text?: string }[];
      };

      expect(invocations).toHaveLength(1);
      expect(invocations[0].command).toBe("/usr/sbin/screencapture");
      expect(invocations[0].args).toEqual(["-x", tempPaths[0]]);
      expect(result.content).toHaveLength(2);
      expect(result.content[0]).toEqual({
        type: "image",
        mimeType: "image/png",
        data: Buffer.from(_pngBytes(3420, 2214)).toString("base64"),
      });
      const note = result.content[1].text!;
      expect(note).toContain("Captured the full screen.");
      // Retina math: 3420px over 1710pt -> 2x, and the note must say so.
      expect(note).toContain("3420x2214 px");
      expect(note).toContain("(2x points)");
      expect(note).toContain("divide image pixel coordinates by 2");
      // The temporary capture file is always cleaned up.
      expect(removed).toEqual(tempPaths);
    });

    test("still returns the image when the PNG is unparseable or the screen size is unknown", async () => {
      const unparseable = _fakeDependencies({
        screenshotBytes: new Uint8Array([9, 9, 9]),
      });
      const resultA = (await _tool("computer_screenshot", unparseable.deps)!
        .execute({})) as {
        content: { type: string; text?: string }[];
      };
      expect(resultA.content[1].text).toBe("Captured the full screen.");

      const noScreen = _fakeDependencies({
        screenshotBytes: _pngBytes(3420, 2214),
        screenPoints: null,
      });
      const resultB = (await _tool("computer_screenshot", noScreen.deps)!
        .execute({})) as {
        content: { type: string; text?: string }[];
      };
      expect(resultB.content[1].text).toContain("3420x2214 px");
      expect(resultB.content[1].text).toContain("may differ from image pixels");
    });

    test("forwards a region and the cursor flag", async () => {
      const { deps, invocations } = _fakeDependencies();
      await _tool("computer_screenshot", deps)!.execute({
        region: { x: 10, y: 20, width: 300, height: 200 },
        includeCursor: true,
      });
      expect(invocations[0].args.slice(0, 3)).toEqual([
        "-x",
        "-R10,20,300,200",
        "-C",
      ]);
      expect(typeof invocations[0].args[3]).toBe("string");
    });

    test("rejects invalid regions", async () => {
      const { deps } = _fakeDependencies();
      let rejection: unknown;
      try {
        await _tool("computer_screenshot", deps)!.execute({
          region: { x: 0, y: 0, width: -5, height: 200 },
        });
      } catch (error) {
        rejection = error;
      }
      expect(rejection).toBeInstanceOf(Error);
      expect((rejection as Error).message).toContain("width");
    });

    test("cleans up the temp file even when reading fails", async () => {
      const { deps, removed } = _fakeDependencies();
      const failing: ComputerDependencies = {
        ...deps,
        readFile: async () => {
          throw new Error("disk gone");
        },
      };
      let rejection: unknown;
      try {
        await _tool("computer_screenshot", failing)!.execute({});
      } catch (error) {
        rejection = error;
      }
      expect((rejection as Error).message).toBe("disk gone");
      expect(removed).toHaveLength(1);
    });
  });

  describe("computer_click", () => {
    test("builds a single-click JXA script through CoreGraphics", async () => {
      const { deps, invocations } = _fakeDependencies();
      const result = await _tool("computer_click", deps)!.execute({
        x: 120,
        y: 80,
      });
      expect(invocations).toHaveLength(1);
      expect(invocations[0].command).toBe("/usr/bin/osascript");
      expect(invocations[0].args.slice(0, 2)).toEqual([
        "-l",
        "JavaScript",
      ]);
      expect(typeof invocations[0].args[2]).toBe("string");
      const script = invocations[0].args[3];
      expect(script).toContain("ObjC.import('CoreGraphics')");
      expect(script).toContain("$.CGPointMake(120, 80)");
      expect(script).toContain("$.kCGEventLeftMouseDown");
      expect(script).toContain("$.kCGEventLeftMouseUp");
      expect(script).not.toContain("ClickState");
      expect(result).toBe("Clicked left at (120, 80).");
    });

    test("builds a right double-click with ClickState 2", async () => {
      const { deps, invocations } = _fakeDependencies();
      await _tool("computer_click", deps)!.execute({
        x: 1,
        y: 2,
        button: "right",
        clickCount: 2,
      });
      const script = invocations[0].args[3];
      expect(script).toContain("$.kCGEventRightMouseDown");
      expect(script).toContain("$.kCGMouseButtonRight");
      expect(script).toContain("$.kCGMouseEventClickState, 2");
    });

    test("rejects bad buttons, click counts, and coordinates", async () => {
      const { deps } = _fakeDependencies();
      for (const args of [
        { x: 1, y: 2, button: "middle" },
        { x: 1, y: 2, clickCount: 3 },
        { y: 2 },
        { x: -1, y: 2 },
      ]) {
        let rejection: unknown;
        try {
          await _tool("computer_click", deps)!.execute(args);
        } catch (error) {
          rejection = error;
        }
        expect(rejection).toBeInstanceOf(Error);
      }
    });

    test("accepts fractional point coordinates from pixel conversion", async () => {
      const { deps, invocations } = _fakeDependencies();
      await _tool("computer_click", deps)!.execute({ x: 855.5, y: 1106.25 });
      expect(invocations).toHaveLength(1);
      expect(invocations[0].command).toBe("/usr/bin/osascript");
      expect(invocations[0].args[3]).toContain("$.CGPointMake(855.5, 1106.25)");
    });
  });

  describe("computer_scroll", () => {
    test("positive wheel1 scrolls up, negative scrolls down", async () => {
      const { deps, invocations } = _fakeDependencies();
      await _tool("computer_scroll", deps)!.execute({
        direction: "up",
        amount: 5,
      });
      expect(invocations[0].args[3]).toContain(
        "CGEventCreateScrollWheelEvent($(), $.kCGScrollEventUnitLine, 1, 5)"
      );
      invocations.length = 0;
      await _tool("computer_scroll", deps)!.execute({ direction: "down" });
      expect(invocations[0].args[3]).toContain(
        "CGEventCreateScrollWheelEvent($(), $.kCGScrollEventUnitLine, 1, -3)"
      );
    });

    test("horizontal scrolling uses the second wheel axis", async () => {
      const { deps, invocations } = _fakeDependencies();
      await _tool("computer_scroll", deps)!.execute({
        direction: "right",
        amount: 2,
      });
      expect(invocations[0].args[3]).toContain(
        "CGEventCreateScrollWheelEvent($(), $.kCGScrollEventUnitLine, 2, 0, -2)"
      );
    });

    test("rejects unknown directions and out-of-range amounts", async () => {
      const { deps } = _fakeDependencies();
      for (const args of [
        { direction: "sideways" },
        { direction: "up", amount: 0 },
        { direction: "up", amount: 99 },
      ]) {
        let rejection: unknown;
        try {
          await _tool("computer_scroll", deps)!.execute(args);
        } catch (error) {
          rejection = error;
        }
        expect(rejection).toBeInstanceOf(Error);
      }
    });
  });

  describe("computer_type", () => {
    test("types ASCII directly through System Events keystroke", async () => {
      const { deps, invocations } = _fakeDependencies();
      const result = await _tool("computer_type", deps)!.execute({
        text: 'Hello "world"\nline 2',
      });
      expect(invocations).toEqual([
        {
          command: "/usr/bin/osascript",
          args: [
            "-e",
            'tell application "System Events" to keystroke "Hello \\"world\\"\\nline 2"',
          ],
        },
      ]);
      expect(result).toBe("Typed 20 characters.");
    });

    test("routes non-ASCII text through the clipboard with a disclosure", async () => {
      const { deps, invocations } = _fakeDependencies();
      const result = await _tool("computer_type", deps)!.execute({
        text: "你好",
      });
      const script = invocations[0].args[1];
      expect(script).toContain('set the clipboard to "你好"');
      expect(script).toContain('keystroke "v" using command down');
      expect(result).toBe(
        "Typed 2 characters via the clipboard (the previous clipboard contents were replaced)."
      );
    });

    test("rejects empty and oversized text", async () => {
      const { deps } = _fakeDependencies();
      for (const text of ["", "x".repeat(5001)]) {
        let rejection: unknown;
        try {
          await _tool("computer_type", deps)!.execute({ text });
        } catch (error) {
          rejection = error;
        }
        expect(rejection).toBeInstanceOf(Error);
      }
    });
  });

  describe("computer_key", () => {
    test("maps named keys to macOS key codes", async () => {
      const { deps, invocations } = _fakeDependencies();
      await _tool("computer_key", deps)!.execute({ key: "return" });
      expect(invocations[0].args).toEqual([
        "-e",
        'tell application "System Events" to key code 36',
      ]);
    });

    test("combines modifiers with special keys and characters", async () => {
      const { deps, invocations } = _fakeDependencies();
      await _tool("computer_key", deps)!.execute({ key: "cmd+shift+t" });
      expect(invocations[0].args).toEqual([
        "-e",
        'tell application "System Events" to keystroke "t" using {command down, shift down}',
      ]);
      invocations.length = 0;
      await _tool("computer_key", deps)!.execute({ key: "ctrl+up" });
      expect(invocations[0].args).toEqual([
        "-e",
        'tell application "System Events" to key code 126 using {control down}',
      ]);
    });

    test("rejects unknown modifiers and unknown named keys", async () => {
      const { deps } = _fakeDependencies();
      for (const key of ["hyper+c", "capslock", "cmd+hyperlock", "fn+c"]) {
        let rejection: unknown;
        try {
          await _tool("computer_key", deps)!.execute({ key });
        } catch (error) {
          rejection = error;
        }
        expect(rejection).toBeInstanceOf(Error);
      }
    });

    test("accepts modifier aliases", async () => {
      const { deps, invocations } = _fakeDependencies();
      await _tool("computer_key", deps)!.execute({ key: "option+left" });
      expect(invocations[0].args).toEqual([
        "-e",
        'tell application "System Events" to key code 123 using {option down}',
      ]);
    });
  });

  describe("default dependencies", () => {
    test("produce unique temp paths with the requested extension", () => {
      const first = defaultComputerDependencies.temporaryPath(".png");
      const second = defaultComputerDependencies.temporaryPath(".png");
      expect(first).not.toBe(second);
      expect(first.endsWith(".png")).toBe(true);
      expect(path.dirname(first)).toBe(os.tmpdir());
    });
  });
});
