import type { ModelProviderGroup, Thread } from "../types";

/**
 * Optional context supplied to a parse. Used when importing a foreign chat dump
 * that references a model by a bare id string.
 */
export interface ThreadParseContext {
  /**
   * Models available in the app. When a foreign dump names a `model` (a bare
   * id string), it is resolved to the first configured model with a matching
   * id. When omitted — or when no id matches — the thread's `model` is left
   * undefined. Only consulted for foreign dumps; native threads keep their own
   * model config.
   */
  availableModels?: readonly ModelProviderGroup[];
}

/**
 * A parser that turns the raw content of a thread file (some source format)
 * into our internal {@link Thread} shape. Implementations are selected by file
 * extension (see `ThreadParserRegistry`); future formats — e.g. JSONL — add new
 * parsers without touching the callers.
 */
export interface ThreadParser {
  /**
   * The file extensions this parser handles. Each is a leading-dot, lowercase
   * string, e.g. `".json"`.
   */
  readonly extensions: readonly string[];

  /**
   * Parse raw file content into a {@link Thread}, or `undefined` when the
   * content cannot be turned into one (e.g. malformed input or an unrecognized
   * shape). Returning `undefined` lets a registry fall through to other
   * parsers.
   */
  parse(
    raw: string,
    context?: ThreadParseContext
  ): Promise<Thread | undefined>;
}
