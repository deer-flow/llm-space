import { describe, expect, test } from "bun:test";

import type { AssistantMessage, Message } from "@llm-space/core";

import { resolveDisplayRows } from "../../../../src/components/thread-playground/message/display-messages";
import {
  findProcessGroupSpans,
  isProcessMessage,
} from "../../../../src/components/thread-playground/message/process-groups";

function user(id: string, text = "Go"): Message {
  return { id, role: "user", content: [{ type: "text", text }] };
}

function assistantWithText(id: string, text = "Answer"): AssistantMessage {
  return { id, role: "assistant", content: [{ type: "text", text }] };
}

function toolCall(id: string, name: string, isError?: boolean) {
  return {
    id,
    input: { name, arguments: {} },
    ...(isError === undefined
      ? {}
      : {
          output: { content: [{ type: "text" as const, text: "" }], isError },
        }),
  };
}

function processMessage(
  id: string,
  options: {
    thinking?: string;
    toolCalls?: ReturnType<typeof toolCall>[];
    /** Running commentary text on the same message as the tool calls. */
    text?: string;
    providerHostedToolActivities?: { type: string }[];
  } = {}
): AssistantMessage {
  return {
    id,
    role: "assistant",
    content: options.text ? [{ type: "text", text: options.text }] : [],
    ...(options.thinking ? { thinking: options.thinking } : {}),
    ...(options.toolCalls ? { toolCalls: options.toolCalls } : {}),
    ...(options.providerHostedToolActivities
      ? {
          providerHostedToolActivities:
            options.providerHostedToolActivities as AssistantMessage["providerHostedToolActivities"],
        }
      : {}),
  };
}

describe("isProcessMessage", () => {
  test("matches assistant messages without a text body but with process", () => {
    expect(isProcessMessage(processMessage("p", { thinking: "hmm" }))).toBe(
      true
    );
    expect(
      isProcessMessage(
        processMessage("p", { toolCalls: [toolCall("t", "bash")] })
      )
    ).toBe(true);
  });

  test("rejects user messages and assistant messages with a text body", () => {
    expect(isProcessMessage(user("u"))).toBe(false);
    expect(isProcessMessage(assistantWithText("a"))).toBe(false);
    expect(isProcessMessage({ id: "e", role: "assistant", content: [] })).toBe(
      false
    );
  });
});

describe("findProcessGroupSpans", () => {
  test("groups consecutive process messages closed by a result", () => {
    const messages = [
      user("u1"),
      processMessage("p1", { thinking: "hmm" }),
      processMessage("p2", { toolCalls: [toolCall("t1", "web_search")] }),
      assistantWithText("result"),
    ];
    const spans = findProcessGroupSpans(messages);
    expect(spans).toHaveLength(1);
    expect(spans[0].start).toBe(1);
    expect(spans[0].end).toBe(3);
    expect(spans[0].group.id).toBe("p1");
    expect(spans[0].group.toolCallCount).toBe(1);
    expect(spans[0].group.lastToolName).toBe("web_search");
  });

  test("closes a group on a following user message", () => {
    const messages = [
      processMessage("p1", { toolCalls: [toolCall("t1", "bash")] }),
      user("u2"),
    ];
    const spans = findProcessGroupSpans(messages);
    expect(spans).toHaveLength(1);
    expect(spans[0].group.id).toBe("p1");
  });

  test("never groups a trailing run without a result", () => {
    const messages = [
      user("u1"),
      processMessage("p1", { thinking: "hmm" }),
      processMessage("p2", { toolCalls: [toolCall("t1", "bash")] }),
    ];
    expect(findProcessGroupSpans(messages)).toEqual([]);
  });

  test("skips members with a text body and splits groups", () => {
    const messages = [
      processMessage("p1", { thinking: "hmm" }),
      assistantWithText("result"),
      processMessage("p2", { thinking: "more" }),
      assistantWithText("result2"),
    ];
    const spans = findProcessGroupSpans(messages);
    expect(spans).toHaveLength(2);
    expect(spans.map((span) => span.group.id)).toEqual(["p1", "p2"]);
  });

  test("counts errors across members", () => {
    const messages = [
      processMessage("p1", {
        toolCalls: [
          toolCall("t1", "bash", true),
          toolCall("t2", "bash", false),
        ],
      }),
      processMessage("p2", { toolCalls: [toolCall("t3", "read", true)] }),
      assistantWithText("result"),
    ];
    const spans = findProcessGroupSpans(messages);
    expect(spans[0].group.errorCount).toBe(2);
    expect(spans[0].group.toolCallCount).toBe(3);
    expect(spans[0].group.lastToolName).toBe("read");
  });
});

describe("resolveDisplayRows", () => {
  const messages = [
    user("u1"),
    processMessage("p1", { thinking: "hmm" }),
    processMessage("p2", { toolCalls: [toolCall("t1", "web_search")] }),
    assistantWithText("result"),
  ];

  test("wraps a completed group into one collapsed header row", () => {
    const rows = resolveDisplayRows(messages, null, false, {
      groupingEnabled: true,
    });
    expect(rows).toHaveLength(3);
    expect(rows[1]).toMatchObject({
      kind: "processGroup",
      collapsed: true,
      group: { id: "p1", toolCallCount: 1 },
    });
  });

  test("keeps expanded groups as header row plus member rows", () => {
    const rows = resolveDisplayRows(messages, null, false, {
      groupingEnabled: true,
      expandedGroupIds: ["p1"],
    });
    expect(rows).toHaveLength(5);
    expect(rows[1]).toMatchObject({ kind: "processGroup", collapsed: false });
    expect(rows[2]).toMatchObject({ kind: "message" });
    expect(rows[3]).toMatchObject({ kind: "message" });
    expect(rows[4]).toMatchObject({ kind: "message" });
  });

  test("renders plain rows while running or when grouping is disabled", () => {
    for (const options of [{ groupingEnabled: false }, undefined] as const) {
      const rows = resolveDisplayRows(messages, null, false, options);
      expect(rows).toHaveLength(4);
      expect(rows.every((row) => row.kind === "message")).toBe(true);
    }
    const running = resolveDisplayRows(messages, "p2", true, {
      groupingEnabled: true,
    });
    expect(running.every((row) => row.kind === "message")).toBe(true);
  });

  test("never wraps the live streaming preview row", () => {
    const rows = resolveDisplayRows(
      [user("u1"), processMessage("p1", { thinking: "hmm" })],
      "streaming",
      true,
      { groupingEnabled: true }
    );
    expect(rows.every((row) => row.kind === "message")).toBe(true);
  });
});

describe("real-provider process shapes", () => {
  test("a tool call marks the message as process even with commentary text", () => {
    expect(
      isProcessMessage(
        processMessage("p", {
          text: "Let me check the repo first.",
          toolCalls: [toolCall("t", "bash")],
        })
      )
    ).toBe(true);
  });

  test("provider-hosted activities with the answer text stay a result", () => {
    expect(
      isProcessMessage(
        processMessage("a", {
          text: "Here is what I found.",
          providerHostedToolActivities: [{ type: "web_search" }],
        })
      )
    ).toBe(false);
  });

  test("real ReAct traffic groups: text+tools intermediates before a text result", () => {
    // The shape every real thread produced: each intermediate assistant
    // message carries commentary text AND tool calls, and only the last
    // message of the segment is text-only.
    const messages = [
      user("u1", "Add rate limiting"),
      processMessage("a1", {
        text: "Locating the login route.",
        toolCalls: [toolCall("t1", "bash")],
      }),
      processMessage("a2", {
        text: "Reading the middleware.",
        toolCalls: [toolCall("t2", "read")],
      }),
      processMessage("a3", {
        text: "Adding the limiter.",
        toolCalls: [toolCall("t3", "edit_file")],
      }),
      assistantWithText("a4", "Added the limiter and a test."),
    ];
    const spans = findProcessGroupSpans(messages);
    expect(spans).toHaveLength(1);
    expect(spans[0].start).toBe(1);
    expect(spans[0].end).toBe(4);
    expect(spans[0].group.id).toBe("a1");
    expect(spans[0].group.toolCallCount).toBe(3);
    expect(spans[0].group.lastToolName).toBe("edit_file");

    const rows = resolveDisplayRows(messages, null, false, {
      groupingEnabled: true,
    });
    // user + collapsed group + result
    expect(rows).toHaveLength(3);
    expect(rows[1]).toMatchObject({ kind: "processGroup", collapsed: true });
  });

  test("hand-authored teaching threads (text-only steps) never group", () => {
    const messages = [
      user("u1"),
      assistantWithText("a1", "Expected partial answer"),
      assistantWithText("a2", "Expected final answer"),
    ];
    expect(findProcessGroupSpans(messages)).toEqual([]);
  });

  test("a trailing text+tools message with no result stays ungrouped", () => {
    const messages = [
      user("u1"),
      processMessage("a1", {
        text: "Running the check.",
        toolCalls: [toolCall("t1", "bash")],
      }),
    ];
    expect(findProcessGroupSpans(messages)).toEqual([]);
  });
});
