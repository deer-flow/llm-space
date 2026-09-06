/**
 * Source files of the bundled default Memory plugin, inlined as strings so
 * the app bundle is self-contained (no runtime read of the source tree) —
 * the same approach as the bundled skills in `bun/skills/seed.ts`.
 *
 * `String.raw` keeps the tool sources byte-exact (they contain regexes and
 * escape sequences); the tool code therefore avoids backticks and `${`
 * interpolation and builds strings with plain concatenation.
 */

export const MEMORY_PLUGIN_ID = "@llm-space/memory";

export interface MemoryPluginFile {
  /** Path relative to the plugin root, using forward slashes. */
  path: string;
  content: string;
}

const PACKAGE_JSON = `{
  "name": "${MEMORY_PLUGIN_ID}",
  "version": "1.0.0",
  "type": "module",
  "displayName": "Memory",
  "description": "Built-in cross-project memory. Gives the agent tools to save durable facts, preferences, and decisions, and to recall them in any project.",
  "author": "LLM Space Contributors",
  "license": "MIT",
  "homepage": "https://github.com/deer-flow/llm-space",
  "engines": {
    "llm-space": ">=4.9.0"
  }
}
`;

// Shared by every tool: the memory store is one JSON-lines file under the
// plugin data directory, which survives installs, updates, and reloads and
// is shared by every workspace — that is what makes the memory cross-project.
const STORE_HELPERS = String.raw`import fs from "node:fs";
import os from "node:os";
import path from "node:path";

interface MemoryRecord {
  id: string;
  content: string;
  tags: string[];
  origin: string | null;
  createdAt: string;
}

const MAX_CONTENT_LENGTH = 8000;
const MAX_TOTAL_MEMORIES = 1000;

function dataFilePath(): string {
  const home =
    process.env.LLM_SPACE_HOME?.trim() || path.join(os.homedir(), ".llm-space");
  return path.join(
    home,
    "data",
    "plugins",
    "@llm-space",
    "memory",
    "memories.jsonl"
  );
}

function readRecords(): MemoryRecord[] {
  const file = dataFilePath();
  if (!fs.existsSync(file)) {
    return [];
  }
  const text = fs.readFileSync(file, "utf8");
  const records: MemoryRecord[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) {
      continue;
    }
    try {
      const parsed = JSON.parse(line) as MemoryRecord;
      if (
        parsed &&
        typeof parsed.id === "string" &&
        typeof parsed.content === "string"
      ) {
        records.push(parsed);
      }
    } catch {
      // Skip malformed lines instead of failing the whole store.
    }
  }
  return records;
}

function writeRecords(records: MemoryRecord[]): void {
  const file = dataFilePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const body = records.map((record) => JSON.stringify(record)).join("\n");
  const temporary = file + ".tmp";
  fs.writeFileSync(temporary, body ? body + "\n" : "", "utf8");
  fs.renameSync(temporary, file);
}
`;

const MEMORY_SAVE_TS = String.raw`import type {
  JsonValue,
  PluginToolContext,
  PluginToolExtension,
} from "@llm-space/core";
${STORE_HELPERS}
export default class MemorySaveTool implements PluginToolExtension {
  name = "memory_save";
  description =
    "Persist a durable memory to long-term storage that is shared across all projects and sessions on this machine. Save user preferences, project conventions, decisions and their rationale, environment facts, and corrections. Write the content self-contained so a future session can understand it without extra context. Never save secrets such as API keys, tokens, or passwords.";
  parameters = {
    type: "object",
    properties: {
      content: {
        type: "string",
        description:
          "The memory to save, as a self-contained sentence. One fact per memory.",
      },
      tags: {
        type: "array",
        items: { type: "string" },
        description:
          'Optional short topic tags, for example ["preference", "testing"].',
      },
    },
    required: ["content"],
    additionalProperties: false,
  };

  execute(
    context: PluginToolContext,
    args: Record<string, unknown>
  ): JsonValue {
    void context;
    const content = typeof args.content === "string" ? args.content.trim() : "";
    if (!content) {
      return { saved: false, error: "content must be a non-empty string." };
    }
    if (content.length > MAX_CONTENT_LENGTH) {
      return {
        saved: false,
        error: "content exceeds " + MAX_CONTENT_LENGTH + " characters.",
      };
    }
    const rawTags = Array.isArray(args.tags) ? args.tags : [];
    const tags = rawTags
      .filter((tag): tag is string => typeof tag === "string")
      .map((tag) => tag.trim())
      .filter(Boolean)
      .slice(0, 8);
    const variables = context.variables as Record<string, unknown> | undefined;
    const origin =
      variables && typeof variables.current_working_directory === "string"
        ? variables.current_working_directory
        : null;
    const records = readRecords();
    const record: MemoryRecord = {
      id:
        "m_" +
        Date.now().toString(36) +
        "_" +
        Math.random().toString(36).slice(2, 8),
      content,
      tags,
      origin,
      createdAt: new Date().toISOString(),
    };
    records.push(record);
    while (records.length > MAX_TOTAL_MEMORIES) {
      records.shift();
    }
    writeRecords(records);
    return { saved: true, id: record.id };
  }
}
`;

const MEMORY_SEARCH_TS = String.raw`import type {
  JsonValue,
  PluginToolContext,
  PluginToolExtension,
} from "@llm-space/core";
${STORE_HELPERS}
function tokenize(query: string): string[] {
  return query.toLowerCase().split(/[^a-z0-9\u4e00-\u9fff]+/);
}

function scoreRecord(record: MemoryRecord, terms: string[]): number {
  let score = 0;
  const content = record.content.toLowerCase();
  const tags = record.tags.map((tag) => tag.toLowerCase());
  for (const term of terms) {
    if (!term) {
      continue;
    }
    if (record.id === term) {
      score += 10;
    }
    if (tags.some((tag) => tag === term)) {
      score += 5;
    }
    if (tags.some((tag) => tag.includes(term))) {
      score += 2;
    }
    if (content.includes(term)) {
      score += 1;
    }
  }
  return score;
}

export default class MemorySearchTool implements PluginToolExtension {
  name = "memory_search";
  description =
    "Search persistent long-term memory that is shared across all projects and sessions on this machine. Returns the best-matching memories for a query, or the most recent memories when no query is given. Use it at the start of a task to recall relevant user preferences, project conventions, and past decisions.";
  parameters = {
    type: "object",
    properties: {
      query: {
        type: "string",
        description:
          "Keywords to look for, in any language. Omit to list the most recent memories.",
      },
      limit: {
        type: "number",
        description: "Maximum number of memories to return (1-50, default 5).",
      },
    },
    required: [],
    additionalProperties: false,
  };

  execute(
    context: PluginToolContext,
    args: Record<string, unknown>
  ): JsonValue {
    void context;
    const query = typeof args.query === "string" ? args.query.trim() : "";
    const limit =
      typeof args.limit === "number" && Number.isFinite(args.limit)
        ? Math.min(Math.max(Math.floor(args.limit), 1), 50)
        : 5;
    const records = readRecords();
    let matches = records;
    if (query) {
      const terms = tokenize(query);
      matches = records
        .map((record) => ({ record, score: scoreRecord(record, terms) }))
        .filter((entry) => entry.score > 0)
        .sort(
          (a, b) =>
            b.score - a.score ||
            b.record.createdAt.localeCompare(a.record.createdAt)
        )
        .map((entry) => entry.record);
    } else {
      matches = [...records].reverse();
    }
    return {
      query: query || null,
      total: records.length,
      returned: Math.min(matches.length, limit),
      memories: matches.slice(0, limit),
    };
  }
}
`;

const MEMORY_FORGET_TS = String.raw`import type {
  JsonValue,
  PluginToolContext,
  PluginToolExtension,
} from "@llm-space/core";
${STORE_HELPERS}
export default class MemoryForgetTool implements PluginToolExtension {
  name = "memory_forget";
  description =
    "Delete one memory by id from the persistent long-term memory that is shared across all projects on this machine. Use it when the user points out that a saved memory is outdated or wrong, then save the corrected version with memory_save.";
  parameters = {
    type: "object",
    properties: {
      id: {
        type: "string",
        description:
          "The id of the memory to delete, as returned by memory_save or memory_search.",
      },
    },
    required: ["id"],
    additionalProperties: false,
  };
  strict = true;

  execute(
    context: PluginToolContext,
    args: Record<string, unknown>
  ): JsonValue {
    void context;
    const id = typeof args.id === "string" ? args.id.trim() : "";
    if (!id) {
      return { deleted: false, error: "id must be a non-empty string." };
    }
    const records = readRecords();
    const next = records.filter((record) => record.id !== id);
    if (next.length === records.length) {
      return { deleted: false, error: "No memory found with id " + id + "." };
    }
    writeRecords(next);
    return { deleted: true, id };
  }
}
`;

const MEMORY_SKILL_MD = String.raw`---
name: memory
description: Persistent memory shared across all projects on this machine. Use PROACTIVELY at the start of a task to search for relevant memories about the user, their preferences, project conventions, and past decisions, and save a new memory whenever the user states a durable preference, correction, convention, or decision. Trigger on phrases like "remember", "from now on", "as usual", "last time", or when continuing prior work.
---

# Memory

You have persistent memory tools (memory_save, memory_search,
memory_forget) backed by on-disk storage that is shared across **all
projects and sessions** on this machine.

## When to search (memory_search)

- At the start of any non-trivial task, search for the project name, the
  task topic, and related keywords.
- When the user references past work: "last time", "as before",
  "remember?", "as we agreed".
- When a convention is unclear, prefer the choice recorded in memory over
  guessing.

## When to save (memory_save)

Save durable facts:

- User preferences: workflow, coding style, communication style, language.
- Project conventions: commands, structure, naming, toolchain.
- Decisions together with their rationale.
- Environment specifics: paths, versions, quirks.
- Corrections: when the user fixes you, save it so the mistake is not
  repeated.

Do NOT save secrets (API keys, tokens, passwords), ephemeral task
details, anything already tracked in the repository or the thread, or
other sensitive personal data.

## How to write a memory

- Self-contained: "Vincent uses bun, never npm, for this monorepo" must
  make sense a year later with no other context.
- One fact per memory, with short tags such as ["preference"],
  ["project:llm-space"], ["convention"].

## When to forget (memory_forget)

When the user points out that a memory is outdated or wrong, delete it by
id (find the id with memory_search) and save the corrected version.
`;

/** Every file of the bundled Memory plugin, ready to write to disk. */
export const MEMORY_PLUGIN_FILES: readonly MemoryPluginFile[] = [
  { path: "package.json", content: PACKAGE_JSON },
  { path: "tools/memory-save.ts", content: MEMORY_SAVE_TS },
  { path: "tools/memory-search.ts", content: MEMORY_SEARCH_TS },
  { path: "tools/memory-forget.ts", content: MEMORY_FORGET_TS },
  { path: "skills/memory/SKILL.md", content: MEMORY_SKILL_MD },
];
