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

/**
 * Content hashes of the 1.0.0 bundled files. Used only to recognise an
 * untouched 1.0.0 installation (it has no seed marker yet) so it can be
 * upgraded in place — see `seedDefaultPlugins`.
 */
export const LEGACY_MEMORY_PLUGIN_HASHES: Readonly<Record<string, string>> = {
  "package.json":
    "9dfc20e86769676df1bc321c87fc2d428c2aaaad48411ec5a21fcc468c0a6371",
  "tools/memory-save.ts":
    "29b91b2f62911aa0a335cd0efeda0d4cf168953d27172abc57fc14047306e267",
  "tools/memory-search.ts":
    "4909b8d8059a8426a8b730f41eb53e3ea2b6d61b991f8995fa6cd9ef9cedc585",
  "tools/memory-forget.ts":
    "ceeb25144c9f941474c62e7b46faf9e86ab7e366481dd5be3c32088658224ef7",
  "skills/memory/SKILL.md":
    "f2ff2bec29a8591a5b8dce4811e963d28f53b78476e6e7361ed7d452c83cabd4",
};

export interface MemoryPluginFile {
  /** Path relative to the plugin root, using forward slashes. */
  path: string;
  content: string;
}

const PACKAGE_JSON = `{
  "name": "${MEMORY_PLUGIN_ID}",
  "version": "1.1.0",
  "type": "module",
  "displayName": "Memory",
  "description": "Built-in cross-project memory. Gives the agent tools to save durable facts, preferences, and decisions, and to recall them in any project and language.",
  "author": "LLM Space Contributors",
  "license": "MIT",
  "homepage": "https://github.com/deer-flow/llm-space",
  "engines": {
    "llm-space": ">=4.9.0"
  }
}
`;

const CONFIG_SCHEMA_JSON = `{
  "type": "object",
  "title": "Memory Settings",
  "description": "Tuning knobs for cross-project memory retrieval and retention.",
  "properties": {
    "projectBoost": {
      "type": "number",
      "title": "Current project boost",
      "description": "Extra score added to memories saved from the project you are working in.",
      "default": 4
    },
    "decayHalfLifeDays": {
      "type": "number",
      "title": "Recency half-life (days)",
      "description": "A memory loses half of its recency weight after this many days. 0 disables decay.",
      "default": 90
    },
    "duplicateSimilarity": {
      "type": "number",
      "title": "Duplicate similarity threshold",
      "description": "A new memory closer than this (0-1) to an existing one is reported as a duplicate instead of being saved.",
      "default": 0.9
    },
    "archiveEnabled": {
      "type": "boolean",
      "title": "Archive instead of discard",
      "description": "When the 1000 memory limit is hit, move the oldest entries to memories.archive.jsonl instead of dropping them.",
      "default": true
    },
    "scopeDefault": {
      "type": "string",
      "title": "Default search scope",
      "description": "auto boosts the current project but still searches everywhere; project only returns memories from the current project; all disables the boost.",
      "enum": ["auto", "project", "all"],
      "default": "auto"
    }
  }
}
`;

// Shared by every tool: the memory store is one JSON-lines file under the
// plugin data directory, which survives installs, updates, and reloads and
// is shared by every workspace — that is what makes the memory cross-project.
//
// The tokenizer is shared too: it is script-agnostic (Unicode property based)
// so Japanese, Korean, Chinese, Cyrillic, Arabic and every other script are
// searchable, instead of only Latin words plus CJK ideographs.
const STORE_HELPERS = String.raw`import fs from "node:fs";
import os from "node:os";
import path from "node:path";

interface MemoryRecord {
  id: string;
  content: string;
  tags: string[];
  origin: string | null;
  createdAt: string;
  updatedAt?: string;
}

interface Tokenized {
  words: string[];
  grams: string[];
}

const MAX_CONTENT_LENGTH = 8000;
const MAX_TOTAL_MEMORIES = 1000;
const MAX_ARCHIVED_MEMORIES = 5000;

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

function archiveFilePath(): string {
  return dataFilePath().replace(/memories\.jsonl$/, "memories.archive.jsonl");
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

/** Move evicted records to the archive instead of dropping them silently. */
function appendArchive(records: MemoryRecord[]): void {
  if (records.length === 0) {
    return;
  }
  const file = archiveFilePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const stamp = new Date().toISOString();
  const body = records
    .map((record) => JSON.stringify({ ...record, archivedAt: stamp }))
    .join("\n");
  fs.appendFileSync(file, body + "\n", "utf8");
  trimArchive();
}

function trimArchive(): void {
  const file = archiveFilePath();
  if (!fs.existsSync(file)) {
    return;
  }
  const lines = fs
    .readFileSync(file, "utf8")
    .split("\n")
    .filter((line) => line.trim().length > 0);
  if (lines.length <= MAX_ARCHIVED_MEMORIES) {
    return;
  }
  const kept = lines.slice(lines.length - MAX_ARCHIVED_MEMORIES);
  fs.writeFileSync(file, kept.join("\n") + "\n", "utf8");
}

// ---------------------------------------------------------------------------
// Tokenization: script-agnostic.
//
// Words are runs of letters / numbers / combining marks, so every script is
// covered by construction. Runs written without spaces (Han, Kana, Hangul,
// Thai, ...) are further split into sub-terms; the rest stay whole words.
// ---------------------------------------------------------------------------

const WORD_RUN = /[\p{L}\p{N}\p{M}]+/gu;

/** Scripts that are written without spaces between words. */
const CONTINUOUS_SCRIPT =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}]/u;
const ARABIC_SCRIPT = /\p{Script=Arabic}/u;
const HEBREW_SCRIPT = /\p{Script=Hebrew}/u;

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    if (value && !seen.has(value)) {
      seen.add(value);
      out.push(value);
    }
  }
  return out;
}

/** NFKC folds full-width forms, half-width kana and Hangul compatibility jamo. */
function normalizeText(value: string): string {
  return value.normalize("NFKC").toLowerCase();
}

/**
 * Drop combining marks (Arabic harakat, Hebrew niqqud) and the Arabic
 * tatweel. Indic scripts are deliberately excluded: their marks carry vowel
 * information and removing them mangles the word.
 */
function stripOptionalMarks(run: string): string {
  return run.replace(/\p{M}/gu, "").replace(/ـ/g, "");
}

/** NFKC does not unify the Arabic alef variants, so fold them by hand. */
function foldArabicVariants(run: string): string {
  return run
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ئ/g, "ي")
    .replace(/ؤ/g, "و");
}

/** ICU word segmentation when available; empty when it is not. */
function segmentWords(run: string): string[] {
  try {
    const ctor = (Intl as unknown as { Segmenter?: unknown }).Segmenter;
    if (typeof ctor !== "function") {
      return [];
    }
    const SegmenterCtor = ctor as new (
      locales?: string | string[],
      options?: { granularity?: "grapheme" | "word" | "sentence" }
    ) => {
      segment(
        input: string
      ): Iterable<{ segment: string; isWordLike?: boolean }>;
    };
    const out: string[] = [];
    for (const part of new SegmenterCtor(undefined, {
      granularity: "word",
    }).segment(run)) {
      if (part.isWordLike) {
        out.push(part.segment);
      }
    }
    return out;
  } catch {
    return [];
  }
}

function bigrams(run: string): string[] {
  const out: string[] = [];
  for (let i = 0; i + 1 < run.length; i++) {
    out.push(run.slice(i, i + 2));
  }
  return out;
}

/**
 * Sub-terms for a script written without spaces: ICU words when available,
 * always plus bigrams. The union keeps recall when ICU splits differently
 * than expected ("東京都" -> "東京" + "都").
 */
function subTerms(run: string): string[] {
  if (run.length <= 1) {
    return [run];
  }
  return unique(bigrams(run).concat(segmentWords(run)));
}

function tokenize(value: string): Tokenized {
  const text = normalizeText(value);
  const words: string[] = [];
  const grams: string[] = [];
  const runs = text.match(WORD_RUN) || [];
  for (const raw of runs) {
    let run = raw;
    if (ARABIC_SCRIPT.test(run) || HEBREW_SCRIPT.test(run)) {
      run = stripOptionalMarks(run);
      if (ARABIC_SCRIPT.test(run)) {
        run = foldArabicVariants(run);
      }
    }
    if (!run) {
      continue;
    }
    if (CONTINUOUS_SCRIPT.test(run)) {
      for (const part of subTerms(run)) {
        grams.push(part);
      }
    } else {
      words.push(run);
    }
  }
  return { words: unique(words), grams: unique(grams) };
}

function compareKeyOf(content: string): string {
  return normalizeText(content).replace(/\s+/gu, " ").trim();
}

interface RecordTokens {
  key: string;
  tags: string[];
  content: string;
  words: Set<string>;
  grams: Set<string>;
}

const _tokenCache = new Map<string, RecordTokens>();

/** Cached per record; the cache lives as long as the plugin process does. */
function recordTokens(record: MemoryRecord): RecordTokens {
  const key = compareKeyOf(record.content);
  const cached = _tokenCache.get(record.id);
  if (cached && cached.key === key) {
    return cached;
  }
  const tokens = tokenize(record.content);
  const value: RecordTokens = {
    key,
    tags: (record.tags || []).map((tag) => normalizeText(tag)),
    content: key,
    words: new Set(tokens.words),
    grams: new Set(tokens.grams),
  };
  _tokenCache.set(record.id, value);
  return value;
}

/** Jaccard similarity over the full term sets, used to spot near-duplicates. */
function similarityOf(a: string, b: string): number {
  const left = tokenize(a);
  const right = tokenize(b);
  const leftSet = new Set<string>(left.words.concat(left.grams));
  const rightSet = new Set<string>(right.words.concat(right.grams));
  if (leftSet.size === 0 || rightSet.size === 0) {
    return 0;
  }
  let shared = 0;
  for (const term of leftSet) {
    if (rightSet.has(term)) {
      shared++;
    }
  }
  return shared / (leftSet.size + rightSet.size - shared);
}

interface ToolSettings {
  projectBoost: number;
  decayHalfLifeDays: number;
  duplicateSimilarity: number;
  archiveEnabled: boolean;
  scopeDefault: string;
}

function settingsOf(context: unknown): ToolSettings {
  const bag =
    context && typeof (context as { settings?: unknown }).settings === "object"
      ? (context as { settings: Record<string, unknown> }).settings
      : {};
  const number = (key: string, fallback: number): number => {
    const value = bag[key];
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
  };
  const flag = (key: string, fallback: boolean): boolean => {
    const value = bag[key];
    return typeof value === "boolean" ? value : fallback;
  };
  const scope = bag.scopeDefault;
  return {
    projectBoost: number("projectBoost", 4),
    decayHalfLifeDays: number("decayHalfLifeDays", 90),
    duplicateSimilarity: number("duplicateSimilarity", 0.9),
    archiveEnabled: flag("archiveEnabled", true),
    scopeDefault: typeof scope === "string" ? scope : "auto",
  };
}

/** Best-effort user notification; never fails a tool call. */
function notifyUser(context: unknown, message: string): void {
  try {
    const notify = (context as { notify?: unknown })?.notify;
    if (typeof notify === "function") {
      void Promise.resolve(
        (notify as (value: string) => unknown).call(context, message)
      ).catch(() => undefined);
    }
  } catch {
    // Notifications are best effort.
  }
}

function currentProjectOf(context: unknown): string {
  const variables = (context as { variables?: unknown })?.variables as
    | Record<string, unknown>
    | undefined;
  const cwd = variables?.current_working_directory;
  return typeof cwd === "string" ? cwd.replace(/\/+$/, "") : "";
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
    "Persist a durable memory to long-term storage that is shared across all projects and sessions on this machine. Save user preferences, project conventions, decisions and their rationale, environment facts, and corrections. Write the content self-contained so a future session can understand it without extra context. Pass an existing id to update that memory in place instead of deleting and re-saving it. Never save secrets such as API keys, tokens, or passwords.";
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
      id: {
        type: "string",
        description:
          "Optional id of an existing memory to update in place (from memory_save or memory_search). Omit to create a new memory.",
      },
    },
    required: ["content"],
    additionalProperties: false,
  };

  execute(
    context: PluginToolContext,
    args: Record<string, unknown>
  ): JsonValue {
    const settings = settingsOf(context);
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
    const id = typeof args.id === "string" ? args.id.trim() : "";
    const origin = currentProjectOf(context) || null;
    const records = readRecords();

    if (id) {
      const index = records.findIndex((record) => record.id === id);
      if (index < 0) {
        return { saved: false, error: "No memory found with id " + id + "." };
      }
      records[index] = {
        ...records[index],
        content,
        tags,
        updatedAt: new Date().toISOString(),
      };
      writeRecords(records);
      return { saved: true, id, updated: true };
    }

    const key = compareKeyOf(content);
    const exact = records.find(
      (record) => compareKeyOf(record.content) === key
    );
    if (exact) {
      return { saved: true, id: exact.id, duplicate: true };
    }

    const near = records.find(
      (record) =>
        similarityOf(record.content, content) >= settings.duplicateSimilarity
    );
    if (near) {
      return {
        saved: false,
        duplicate: true,
        existingId: near.id,
        existingContent: near.content,
        similarity: Number(similarityOf(near.content, content).toFixed(3)),
        error:
          "A very similar memory already exists (" +
          near.id +
          "). Update it by passing its id instead of saving a duplicate.",
      };
    }

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
    const before = records.length;
    records.push(record);

    const evicted: MemoryRecord[] = [];
    while (records.length > MAX_TOTAL_MEMORIES) {
      const oldest = records.shift();
      if (oldest) {
        evicted.push(oldest);
      }
    }
    writeRecords(records);

    const warnAt = Math.floor(MAX_TOTAL_MEMORIES * 0.9);
    if (
      before < warnAt &&
      records.length >= warnAt &&
      records.length <= MAX_TOTAL_MEMORIES
    ) {
      notifyUser(
        context,
        "Memory store is nearly full: " +
          records.length +
          " of " +
          MAX_TOTAL_MEMORIES +
          " memories."
      );
    }

    if (evicted.length > 0) {
      let archived = false;
      if (settings.archiveEnabled) {
        try {
          appendArchive(evicted);
          archived = true;
        } catch {
          archived = false;
        }
      }
      notifyUser(
        context,
        "Memory store reached its " +
          MAX_TOTAL_MEMORIES +
          " limit: " +
          evicted.length +
          " oldest " +
          (evicted.length === 1 ? "memory was" : "memories were") +
          (archived
            ? " archived to memories.archive.jsonl."
            : " discarded (archiving is disabled).")
      );
      return { saved: true, id: record.id, evicted: evicted.length, archived };
    }

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
interface ScoreOptions {
  project: string;
  projectBoost: number;
  halfLifeDays: number;
  now: number;
}

function scoreRecord(
  record: MemoryRecord,
  query: Tokenized,
  options: ScoreOptions
): number {
  const tokens = recordTokens(record);
  let score = 0;
  for (const term of query.words) {
    if (!term) {
      continue;
    }
    if (record.id === term) {
      score += 10;
    }
    if (tokens.tags.some((tag) => tag === term)) {
      score += 5;
    }
    if (tokens.tags.some((tag) => tag.includes(term))) {
      score += 2;
    }
    if (tokens.words.has(term)) {
      score += 3;
    } else if (tokens.content.includes(term)) {
      score += 1;
    }
  }
  if (query.grams.length > 0) {
    let matched = 0;
    for (const gram of query.grams) {
      if (tokens.grams.has(gram)) {
        matched++;
      }
    }
    const coverage = matched / query.grams.length;
    if (coverage >= 0.5) {
      score += coverage * 8;
    }
  }
  if (score === 0) {
    return 0;
  }
  if (
    options.projectBoost !== 0 &&
    options.project &&
    typeof record.origin === "string" &&
    record.origin.replace(/\/+$/, "") === options.project
  ) {
    score += options.projectBoost;
  }
  if (options.halfLifeDays > 0) {
    const created = Date.parse(record.createdAt);
    const ageDays = Number.isFinite(created)
      ? (options.now - created) / 86400000
      : 0;
    const decay = Math.pow(
      2,
      -(ageDays > 0 ? ageDays : 0) / options.halfLifeDays
    );
    // Older memories keep at least 30% of their weight: durable facts such as
    // identity or long-lived preferences must not fade away completely.
    score = score * (0.3 + 0.7 * decay);
  }
  return score;
}

export default class MemorySearchTool implements PluginToolExtension {
  name = "memory_search";
  description =
    "Search persistent long-term memory that is shared across all projects and sessions on this machine. Returns the best-matching memories for a query in any language and script, or the most recent memories when no query is given. Use it at the start of a task to recall relevant user preferences, project conventions, and past decisions.";
  parameters = {
    type: "object",
    properties: {
      query: {
        type: "string",
        description:
          "Keywords to look for, in any language or script. Omit to list the most recent memories.",
      },
      limit: {
        type: "number",
        description: "Maximum number of memories to return (1-50, default 5).",
      },
      scope: {
        type: "string",
        description:
          "auto (default) boosts memories saved in the current project, project only searches those, all disables the boost.",
        enum: ["auto", "project", "all"],
      },
    },
    required: [],
    additionalProperties: false,
  };

  execute(
    context: PluginToolContext,
    args: Record<string, unknown>
  ): JsonValue {
    const settings = settingsOf(context);
    const query = typeof args.query === "string" ? args.query.trim() : "";
    const limit =
      typeof args.limit === "number" && Number.isFinite(args.limit)
        ? Math.min(Math.max(Math.floor(args.limit), 1), 50)
        : 5;
    const scope =
      typeof args.scope === "string" && args.scope.length > 0
        ? args.scope
        : settings.scopeDefault;
    const project = currentProjectOf(context);
    const records = readRecords();
    let matches = records;
    if (query) {
      const tokens = tokenize(query);
      const options: ScoreOptions = {
        project,
        projectBoost: scope === "all" ? 0 : settings.projectBoost,
        halfLifeDays: settings.decayHalfLifeDays,
        now: Date.now(),
      };
      const pool =
        scope === "project" && project
          ? records.filter(
              (record) =>
                typeof record.origin === "string" &&
                record.origin.replace(/\/+$/, "") === project
            )
          : records;
      matches = pool
        .map((record) => ({
          record,
          score: scoreRecord(record, tokens, options),
        }))
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
      scope,
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
    "Delete one memory by id from the persistent long-term memory that is shared across all projects on this machine. To correct a memory instead of removing it, prefer memory_save with its id so the id and origin are preserved.";
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

Search works in any language and script: queries are matched per script, so
Japanese, Korean, Chinese, Cyrillic and Arabic content are all searchable
with terms written in the same language.

## When to search (memory_search)

- At the start of any non-trivial task, search for the project name, the
  task topic, and related keywords.
- When the user references past work: "last time", "as before",
  "remember?", "as we agreed".
- When a convention is unclear, prefer the choice recorded in memory over
  guessing.
- Memories saved in the project you are working in rank higher by default.
  Pass scope "all" to search without that preference, or scope "project" to
  stay inside the current project.

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

## Updating and duplicates

- To correct a memory, call memory_save with its **id**: the content is
  replaced, the id stays the same, and nothing else is lost.
- Saving the exact same content again returns the existing id with
  duplicate: true and writes nothing.
- Saving something very similar to an existing memory is refused with
  duplicate: true plus existingId. Update that id instead of adding a
  near-copy.
- When the store is full (1000 memories), the oldest entries are moved to
  memories.archive.jsonl and the user is notified — nothing is deleted
  silently.

## When to forget (memory_forget)

When the user points out that a memory is outdated or wrong, prefer
updating it by id. Use memory_forget only to delete it outright.
`;

/** Every file of the bundled Memory plugin, ready to write to disk. */
export const MEMORY_PLUGIN_FILES: readonly MemoryPluginFile[] = [
  { path: "package.json", content: PACKAGE_JSON },
  { path: "config.schema.json", content: CONFIG_SCHEMA_JSON },
  { path: "tools/memory-save.ts", content: MEMORY_SAVE_TS },
  { path: "tools/memory-search.ts", content: MEMORY_SEARCH_TS },
  { path: "tools/memory-forget.ts", content: MEMORY_FORGET_TS },
  { path: "skills/memory/SKILL.md", content: MEMORY_SKILL_MD },
];
