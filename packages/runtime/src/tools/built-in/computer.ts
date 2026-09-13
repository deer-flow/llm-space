import { execFile } from "node:child_process";
import { readFile, unlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import type { BuiltinTool } from "@llm-space/core";

import { createToolCallResponse } from "../tool-registry";
import type { ToolEntry } from "../tool-registry";

const SCREENCAPURE = "/usr/sbin/screencapture";
const OSASCRIPT = "/usr/bin/osascript";
const COMMAND_TIMEOUT_MS = 15_000;

const execFileAsync = promisify(execFile);

/**
 * Injectable OS bridge. The defaults shell out to macOS's built-in
 * `screencapture` and `osascript`; tests substitute fakes so nothing touches
 * the real screen or clipboard.
 */
export interface ComputerDependencies {
  /** Run a helper binary and resolve with its stdout. */
  run(command: string, args: string[]): Promise<string>;
  readFile(filePath: string): Promise<Uint8Array>;
  removeFile(filePath: string): Promise<void>;
  temporaryPath(extension: string): string;
}

let screenshotCounter = 0;

export const defaultComputerDependencies: ComputerDependencies = {
  async run(command, args) {
    const { stdout } = await execFileAsync(command, args, {
      timeout: COMMAND_TIMEOUT_MS,
      maxBuffer: 1024 * 1024,
    });
    return stdout;
  },
  readFile: (filePath) => readFile(filePath),
  removeFile: (filePath) => unlink(filePath),
  temporaryPath(extension) {
    screenshotCounter += 1;
    return path.join(
      os.tmpdir(),
      `llm-space-computer-${Date.now()}-${screenshotCounter}${extension}`
    );
  },
};

// -- AppleScript / JXA helpers -------------------------------------------------

/** Escape a string for a double-quoted AppleScript string literal. */
function _escapeAppleScriptString(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n")
    .replace(/\t/g, "\\t");
}

const MOUSE_BUTTONS = {
  left: {
    down: "$.kCGEventLeftMouseDown",
    up: "$.kCGEventLeftMouseUp",
    cg: "$.kCGMouseButtonLeft",
  },
  right: {
    down: "$.kCGEventRightMouseDown",
    up: "$.kCGEventRightMouseUp",
    cg: "$.kCGMouseButtonRight",
  },
} as const;

/**
 * Post mouse events through CoreGraphics via the JXA ObjC bridge. Posting a
 * move first lets hover states settle before the click lands, mirroring what
 * a physical pointer does.
 */
function _clickScript(
  x: number,
  y: number,
  button: keyof typeof MOUSE_BUTTONS,
  clickCount: number
): string {
  const types = MOUSE_BUTTONS[button];
  const head = `
ObjC.import('CoreGraphics');
const point = $.CGPointMake(${x}, ${y});
const tap = $.kCGHIDEventTap;
const moved = $.CGEventCreateMouseEvent($(), $.kCGEventMouseMoved, point, ${types.cg});
$.CGEventPost(tap, moved);`;
  if (clickCount === 1) {
    return `${head}
const down = $.CGEventCreateMouseEvent($(), ${types.down}, point, ${types.cg});
const up = $.CGEventCreateMouseEvent($(), ${types.up}, point, ${types.cg});
$.CGEventPost(tap, down);
$.CGEventPost(tap, up);`;
  }
  // A real double-click posts a second down/up pair with ClickState 2, so the
  // target app recognizes it as a double rather than two singles.
  return `${head}
const down1 = $.CGEventCreateMouseEvent($(), ${types.down}, point, ${types.cg});
const up1 = $.CGEventCreateMouseEvent($(), ${types.up}, point, ${types.cg});
$.CGEventPost(tap, down1);
$.CGEventPost(tap, up1);
const down2 = $.CGEventCreateMouseEvent($(), ${types.down}, point, ${types.cg});
const up2 = $.CGEventCreateMouseEvent($(), ${types.up}, point, ${types.cg});
$.CGEventSetIntegerValueField(down2, $.kCGMouseEventClickState, 2);
$.CGEventSetIntegerValueField(up2, $.kCGMouseEventClickState, 2);
$.CGEventPost(tap, down2);
$.CGEventPost(tap, up2);`;
}

/** Scroll deltas: positive wheel1 scrolls up, positive wheel2 scrolls left. */
function _scrollScript(
  direction: "up" | "down" | "left" | "right",
  amount: number
): string {
  const wheels =
    direction === "left"
      ? `2, 0, ${amount}`
      : direction === "right"
        ? `2, 0, ${-amount}`
        : direction === "up"
          ? `1, ${amount}`
          : `1, ${-amount}`;
  return `
ObjC.import('CoreGraphics');
const event = $.CGEventCreateScrollWheelEvent($(), $.kCGScrollEventUnitLine, ${wheels});
$.CGEventPost($.kCGHIDEventTap, event);`;
}

// -- keyboard ------------------------------------------------------------------

/** macOS key codes for named special keys (`key code N`). */
const SPECIAL_KEY_CODES: Record<string, number> = {
  return: 36,
  enter: 36,
  tab: 48,
  escape: 53,
  delete: 51,
  backspace: 51,
  forwarddelete: 117,
  space: 49,
  up: 126,
  down: 125,
  left: 123,
  right: 124,
  home: 115,
  end: 119,
  pageup: 116,
  pagedown: 121,
  f1: 122,
  f2: 120,
  f3: 99,
  f4: 118,
  f5: 96,
  f6: 97,
  f7: 98,
  f8: 100,
  f9: 101,
  f10: 109,
  f11: 103,
  f12: 111,
};

const MODIFIER_NAMES: Record<string, string> = {
  cmd: "command",
  command: "command",
  ctrl: "control",
  control: "control",
  alt: "option",
  option: "option",
  opt: "option",
  shift: "shift",
  fn: "fn",
};

// -- argument helpers ----------------------------------------------------------

function _requireNumber(
  args: Record<string, unknown>,
  key: string,
  min = 0
): number {
  const value = args[key];
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < min ||
    (min === 0 && !Number.isInteger(value))
  ) {
    throw new Error(
      `${key} must be ${min > 0 ? `a number >= ${min}` : "a non-negative integer"}.`
    );
  }
  return value;
}

// -- tools ---------------------------------------------------------------------

function _computerScreenshotTool(deps: ComputerDependencies): ToolEntry {
  const tool: BuiltinTool = {
    type: "builtin",
    name: "computer_screenshot",
    icon: "camera",
    description:
      "Capture the screen and return it as an image so the model can see what is on screen. Can capture the full screen or a region. On macOS the app may need Screen Recording permission for window contents to appear.",
    strict: true,
    parameters: {
      type: "object",
      required: [],
      properties: {
        region: {
          type: "object",
          description:
            "Optional pixel region to capture instead of the full screen.",
          properties: {
            x: { type: "number", description: "Left edge, in points." },
            y: { type: "number", description: "Top edge, in points." },
            width: { type: "number", description: "Width in points." },
            height: { type: "number", description: "Height in points." },
          },
          required: ["x", "y", "width", "height"],
          additionalProperties: false,
        },
        includeCursor: {
          type: "boolean",
          description:
            "Whether to include the mouse cursor in the capture. Defaults to false.",
        },
      },
      additionalProperties: false,
    },
  };
  async function execute(args: Record<string, unknown>): Promise<unknown> {
    const captureArgs = ["-x"];
    let note = "Captured the full screen.";
    if (args.region !== undefined) {
      const region = args.region as Record<string, unknown>;
      const x = _requireNumber(region, "x");
      const y = _requireNumber(region, "y");
      const width = _requireNumber(region, "width", 1);
      const height = _requireNumber(region, "height", 1);
      captureArgs.push(`-R${x},${y},${width},${height}`);
      note = `Captured a ${width}x${height} region at (${x}, ${y}).`;
    }
    if (args.includeCursor === true) {
      captureArgs.push("-C");
    }
    const filePath = deps.temporaryPath(".png");
    captureArgs.push(filePath);
    await deps.run(SCREENCAPURE, captureArgs);
    try {
      const png = await deps.readFile(filePath);
      return createToolCallResponse([
        {
          type: "image",
          mimeType: "image/png",
          data: Buffer.from(png).toString("base64"),
        },
        { type: "text", text: note },
      ]);
    } finally {
      await deps.removeFile(filePath).catch(() => undefined);
    }
  }
  return { tool, execute };
}

function _computerClickTool(deps: ComputerDependencies): ToolEntry {
  const tool: BuiltinTool = {
    type: "builtin",
    name: "computer_click",
    icon: "mouse-pointer",
    description:
      "Click the mouse at a screen coordinate. Supports left, right, and double clicks. Take a screenshot first to pick coordinates.",
    strict: true,
    parameters: {
      type: "object",
      required: ["x", "y"],
      properties: {
        x: {
          type: "number",
          description: "Horizontal position, in points from the left edge.",
        },
        y: {
          type: "number",
          description: "Vertical position, in points from the top edge.",
        },
        button: {
          type: "string",
          description: 'Which button to press. Defaults to "left".',
        },
        clickCount: {
          type: "number",
          description: "1 for a single click (default), 2 for a double click.",
        },
      },
      additionalProperties: false,
    },
  };
  async function execute(args: Record<string, unknown>): Promise<unknown> {
    const x = _requireNumber(args, "x");
    const y = _requireNumber(args, "y");
    const button =
      args.button === undefined
        ? "left"
        : args.button === "left" || args.button === "right"
          ? args.button
          : undefined;
    if (!button) {
      throw new Error('button must be "left" or "right".');
    }
    const clickCount =
      args.clickCount === undefined
        ? 1
        : args.clickCount === 1 || args.clickCount === 2
          ? args.clickCount
          : undefined;
    if (!clickCount) {
      throw new Error("clickCount must be 1 or 2.");
    }
    await deps.run(OSASCRIPT, [
      "-l",
      "JavaScript",
      "-e",
      _clickScript(x, y, button, clickCount),
    ]);
    return `Clicked ${button}${clickCount === 2 ? " (double)" : ""} at (${x}, ${y}).`;
  }
  return { tool, execute };
}

function _computerScrollTool(deps: ComputerDependencies): ToolEntry {
  const tool: BuiltinTool = {
    type: "builtin",
    name: "computer_scroll",
    icon: "mouse",
    description:
      "Scroll the view under the mouse cursor by a number of lines. Sends scroll-wheel events, so it works in lists, web pages, and editors.",
    strict: true,
    parameters: {
      type: "object",
      required: ["direction"],
      properties: {
        direction: {
          type: "string",
          description: "Which way to scroll the content.",
        },
        amount: {
          type: "number",
          description: "Lines to scroll. Defaults to 3.",
        },
      },
      additionalProperties: false,
    },
  };
  async function execute(args: Record<string, unknown>): Promise<unknown> {
    const direction =
      args.direction === "up" ||
      args.direction === "down" ||
      args.direction === "left" ||
      args.direction === "right"
        ? args.direction
        : undefined;
    if (!direction) {
      throw new Error('direction must be "up", "down", "left", or "right".');
    }
    const amount =
      args.amount === undefined
        ? 3
        : typeof args.amount === "number" &&
            Number.isFinite(args.amount) &&
            args.amount >= 1 &&
            args.amount <= 50
          ? Math.round(args.amount)
          : undefined;
    if (!amount) {
      throw new Error("amount must be a number between 1 and 50.");
    }
    await deps.run(OSASCRIPT, [
      "-l",
      "JavaScript",
      "-e",
      _scrollScript(direction, amount),
    ]);
    return `Scrolled ${direction} by ${amount} line${amount === 1 ? "" : "s"}.`;
  }
  return { tool, execute };
}

function _computerTypeTool(deps: ComputerDependencies): ToolEntry {
  const tool: BuiltinTool = {
    type: "builtin",
    name: "computer_type",
    icon: "keyboard",
    description:
      "Type text into the focused control as if on the keyboard. Click the target field first. ASCII text is typed directly; text with non-ASCII characters is typed by temporarily placing it on the clipboard and pasting.",
    strict: true,
    parameters: {
      type: "object",
      required: ["text"],
      properties: {
        text: {
          type: "string",
          description: "The text to type, including newlines if needed.",
        },
      },
      additionalProperties: false,
    },
  };
  async function execute(args: Record<string, unknown>): Promise<unknown> {
    const text = args.text;
    if (typeof text !== "string" || text.length < 1 || text.length > 5000) {
      throw new Error("text must contain 1-5000 characters.");
    }
    const escaped = _escapeAppleScriptString(text);
    if (/^[\x20-\x7E\r\n\t]*$/.test(text)) {
      await deps.run(OSASCRIPT, [
        "-e",
        `tell application "System Events" to keystroke "${escaped}"`,
      ]);
      return `Typed ${text.length} character${text.length === 1 ? "" : "s"}.`;
    }
    // System Events keystroke cannot type non-ASCII text; paste it instead.
    await deps.run(OSASCRIPT, [
      "-e",
      `set the clipboard to "${escaped}"\n` +
        "delay 0.2\n" +
        'tell application "System Events" to keystroke "v" using command down',
    ]);
    return `Typed ${text.length} character${text.length === 1 ? "" : "s"} via the clipboard (the previous clipboard contents were replaced).`;
  }
  return { tool, execute };
}

function _computerKeyTool(deps: ComputerDependencies): ToolEntry {
  const tool: BuiltinTool = {
    type: "builtin",
    name: "computer_key",
    icon: "keyboard",
    description:
      'Press a key or key combination, e.g. "return", "escape", "cmd+c", or "cmd+shift+t". Named keys: ' +
      Object.keys(SPECIAL_KEY_CODES).join(", ") +
      ".",
    strict: true,
    parameters: {
      type: "object",
      required: ["key"],
      properties: {
        key: {
          type: "string",
          description:
            'A single character (e.g. "c") or a named special key (e.g. "return"), optionally combined with "+"-separated modifiers in the same string (e.g. "cmd+shift+t").',
        },
      },
      additionalProperties: false,
    },
  };
  async function execute(args: Record<string, unknown>): Promise<unknown> {
    const raw = args.key;
    if (typeof raw !== "string" || !raw.trim()) {
      throw new Error('key is required, e.g. "return" or "cmd+c".');
    }
    const parts = raw
      .trim()
      .toLowerCase()
      .split("+")
      .map((part) => part.trim())
      .filter(Boolean);
    if (parts.length === 0) {
      throw new Error('key is required, e.g. "return" or "cmd+c".');
    }
    const key = parts[parts.length - 1];
    const unknownModifiers = parts
      .slice(0, -1)
      .filter((part) => !(part in MODIFIER_NAMES));
    if (unknownModifiers.length > 0) {
      throw new Error(
        `Unknown modifier${unknownModifiers.length === 1 ? "" : "s"}: ${unknownModifiers.join(", ")}.`
      );
    }
    const appleModifiers = [
      ...new Set(
        parts.slice(0, -1).map((part) => MODIFIER_NAMES[part])
      ),
    ];
    const usingClause =
      appleModifiers.length > 0
        ? ` using {${appleModifiers.map((name) => `${name} down`).join(", ")}}`
        : "";
    const script =
      key in SPECIAL_KEY_CODES
        ? `tell application "System Events" to key code ${SPECIAL_KEY_CODES[key]}${usingClause}`
        : key.length === 1
          ? `tell application "System Events" to keystroke "${_escapeAppleScriptString(key)}"${usingClause}`
          : undefined;
    if (!script) {
      throw new Error(
        `Unknown key "${key}". Use a single character or one of: ${Object.keys(SPECIAL_KEY_CODES).join(", ")}.`
      );
    }
    await deps.run(OSASCRIPT, ["-e", script]);
    return `Pressed ${raw.trim()}.`;
  }
  return { tool, execute };
}

/**
 * The computer-use tool set: see the screen, then act on it. Requires macOS's
 * Screen Recording permission (screenshots) and Accessibility permission
 * (clicks, typing, scrolling) for the app; macOS prompts for each on first use.
 */
export function createComputerBuiltInTools(
  dependencies: ComputerDependencies = defaultComputerDependencies
): ToolEntry[] {
  return [
    _computerScreenshotTool(dependencies),
    _computerClickTool(dependencies),
    _computerScrollTool(dependencies),
    _computerTypeTool(dependencies),
    _computerKeyTool(dependencies),
  ];
}
