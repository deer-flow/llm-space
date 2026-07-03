import type { Thread } from "../types";

import { JsonThreadParser } from "./json-thread-parser";
import type { ThreadParseContext, ThreadParser } from "./thread-parser";

/**
 * Dispatches raw file content to a registered {@link ThreadParser} based on the
 * file's extension.
 */
export class ThreadParserRegistry {
  private readonly _byExtension = new Map<string, ThreadParser>();

  constructor(parsers: ThreadParser[] = []) {
    for (const parser of parsers) {
      this.register(parser);
    }
  }

  /**
   * Register a parser under each of its extensions. On conflict the later
   * registration wins.
   */
  register(parser: ThreadParser): this {
    for (const extension of parser.extensions) {
      this._byExtension.set(_normalizeExtension(extension), parser);
    }
    return this;
  }

  /**
   * The parser registered for the given extension (leading dot optional, case
   * insensitive), or `undefined`.
   */
  getByExtension(extension: string): ThreadParser | undefined {
    if (!extension) {
      return undefined;
    }
    return this._byExtension.get(_normalizeExtension(extension));
  }

  /**
   * Parse `raw` with the parser matching `fileName`'s extension. Returns
   * `undefined` when no parser matches or the matched parser can't parse it.
   */
  async parse(
    fileName: string,
    raw: string,
    context?: ThreadParseContext
  ): Promise<Thread | undefined> {
    const parser = this.getByExtension(_extensionOf(fileName));
    if (!parser) {
      return undefined;
    }
    return parser.parse(raw, context);
  }
}

/**
 * A registry pre-registered with the built-in parsers.
 */
export function createDefaultThreadParserRegistry(): ThreadParserRegistry {
  return new ThreadParserRegistry([new JsonThreadParser()]);
}

/** Lowercase and ensure a single leading dot, e.g. `"JSON"` → `".json"`. */
function _normalizeExtension(extension: string): string {
  const lower = extension.toLowerCase();
  return lower.startsWith(".") ? lower : `.${lower}`;
}

/** The lowercased extension (with dot) of a file name/path, or `""` if none. */
function _extensionOf(fileName: string): string {
  const slash = Math.max(fileName.lastIndexOf("/"), fileName.lastIndexOf("\\"));
  const base = fileName.slice(slash + 1);
  const dot = base.lastIndexOf(".");
  return dot >= 0 ? base.slice(dot).toLowerCase() : "";
}
