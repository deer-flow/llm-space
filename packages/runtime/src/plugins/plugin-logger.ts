import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { PluginSafeError } from "@llm-space/core";

const SENSITIVE_KEY =
  /authorization|cookie|credential|secret|token|api[-_]?key|headers?|prompt|payload/i;
const MAX_DETAIL_CHARS = 100_000;

export class PluginLogger {
  constructor(
    private readonly _homePath: string,
    private readonly _appVersion: string
  ) {}

  writeError({
    pluginId,
    pluginVersion,
    stage,
    extension,
    error,
    output,
    summary,
  }: {
    pluginId?: string;
    pluginVersion?: string;
    stage: string;
    extension?: string;
    error: unknown;
    output?: string;
    summary?: string;
  }): PluginSafeError {
    const id = randomUUID();
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const encodedName = pluginId ? encodeURIComponent(pluginId) : "_invalid";
    const logPath = path.join(
      this._homePath,
      "logs",
      "plugins",
      encodedName,
      `${timestamp}-${_filePart(stage)}-${id}.log`
    );
    const safeSummary = summary ?? _safeSummary(error);
    const body = _redact({
      appVersion: this._appVersion,
      pluginId: pluginId ?? "unknown",
      pluginVersion: pluginVersion ?? "unknown",
      stage,
      extension,
      error: _errorChain(error),
      stack: error instanceof Error ? error.stack : undefined,
      output: output?.slice(0, MAX_DETAIL_CHARS),
    });
    try {
      mkdirSync(path.dirname(logPath), { recursive: true });
      writeFileSync(logPath, `${JSON.stringify(body, null, 2)}\n`, "utf8");
    } catch (logError) {
      console.error("Unable to write plugin diagnostic log", logError);
    }
    return { id, stage, summary: safeSummary, logPath };
  }
}

function _safeSummary(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.replace(/[\r\n]+/g, " ").slice(0, 240);
  }
  return "The plugin extension failed. See the diagnostic log for details.";
}

function _errorChain(error: unknown): string[] {
  const result: string[] = [];
  let current: unknown = error;
  while (current && result.length < 8) {
    result.push(
      current instanceof Error
        ? current.message
        : typeof current === "string"
          ? current
          : JSON.stringify(current)
    );
    current = current instanceof Error ? current.cause : undefined;
  }
  return result;
}

function _redact(value: unknown, key = ""): unknown {
  if (SENSITIVE_KEY.test(key)) return "[REDACTED]";
  if (Array.isArray(value)) return value.map((item) => _redact(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([childKey, child]) => [
        childKey,
        _redact(child, childKey),
      ])
    );
  }
  if (typeof value === "string") {
    return value
      .replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]")
      .replace(
        /\b(api[-_]?key|token|secret|password)\s*[:=]\s*[^\s,;]+/gi,
        "$1=[REDACTED]"
      )
      .replace(/\b(sk|gh[opasu])[-_][A-Za-z0-9_-]{8,}\b/g, "[REDACTED]");
  }
  return value;
}

function _filePart(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]/g, "-").slice(0, 64) || "unknown";
}
