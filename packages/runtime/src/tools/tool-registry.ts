import type { BuiltinTool, BuiltinToolCallResponse } from "@llm-space/core";

export interface ToolEntry {
  tool: BuiltinTool;
  execute(
    this: void,
    args: Record<string, unknown>,
    config?: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<unknown>;
}

export interface ToolExecutionContext {
  /** Ephemeral provider profile selected for this invocation. */
  profileId?: string;
}

export interface ToolContribution {
  id: string;
  entries: readonly ToolEntry[];
}

export type ToolCallResponse = BuiltinToolCallResponse;

const STRUCTURED_TOOL_CALL_RESPONSE = Symbol("structuredToolCallResponse");

interface StructuredToolCallResponse extends ToolCallResponse {
  [STRUCTURED_TOOL_CALL_RESPONSE]: true;
}

/**
 * Mark model-facing content explicitly so an ordinary JSON `content` property
 * cannot be mistaken for the runtime response contract.
 */
export function createToolCallResponse(
  content: ToolCallResponse["content"]
): ToolCallResponse {
  const response: StructuredToolCallResponse = {
    [STRUCTURED_TOOL_CALL_RESPONSE]: true,
    content,
  };
  return response;
}

export class ToolRegistry {
  private readonly _contributions: Readonly<ToolContribution>[] = [];
  private readonly _contributionIds = new Set<string>();
  private readonly _entriesByName = new Map<string, Readonly<ToolEntry>>();
  private readonly _contributionIdByToolName = new Map<string, string>();
  private _frozen = false;

  register(contribution: ToolContribution): this {
    if (this._frozen) {
      throw new Error(
        `Tool contribution "${contribution.id}" registered after freeze.`
      );
    }
    if (this._contributionIds.has(contribution.id)) {
      throw new Error(`Duplicate tool contribution id "${contribution.id}".`);
    }
    const contributionToolNames = new Set<string>();
    for (const entry of contribution.entries) {
      if (contributionToolNames.has(entry.tool.name)) {
        throw new Error(
          `Tool contribution "${contribution.id}" duplicates tool "${entry.tool.name}" within itself.`
        );
      }
      const owner = this._contributionIdByToolName.get(entry.tool.name);
      if (owner) {
        throw new Error(
          `Tool contribution "${contribution.id}" duplicates tool "${entry.tool.name}" from "${owner}".`
        );
      }
      contributionToolNames.add(entry.tool.name);
    }
    const snapshot = Object.freeze({
      id: contribution.id,
      entries: Object.freeze(
        contribution.entries.map((entry) =>
          Object.freeze({
            tool: _cloneAndFreeze(entry.tool),
            execute: entry.execute,
          })
        )
      ),
    });
    this._contributions.push(snapshot);
    this._contributionIds.add(snapshot.id);
    for (const entry of snapshot.entries) {
      this._entriesByName.set(entry.tool.name, entry);
      this._contributionIdByToolName.set(entry.tool.name, snapshot.id);
    }
    return this;
  }

  freeze(): void {
    this._frozen = true;
  }

  listTools(): BuiltinTool[] {
    return this._contributions.flatMap((contribution) =>
      contribution.entries.map((entry) => entry.tool)
    );
  }

  async call({
    name,
    arguments: args,
    config,
    profileId,
  }: {
    name: string;
    arguments: Record<string, unknown>;
    config?: Record<string, unknown>;
    profileId?: string;
  }): Promise<ToolCallResponse> {
    const entry = this._entriesByName.get(name);
    if (!entry) {
      throw new Error(`Built-in tool not found: ${name}`);
    }
    const result = await entry.execute(args, config, { profileId });
    if (_isToolCallResponse(result)) {
      return { content: result.content };
    }
    return {
      content: [{ type: "text", text: _serializeToolResult(result) }],
    };
  }
}

function _cloneAndFreeze(tool: BuiltinTool): BuiltinTool {
  return _deepFreeze(structuredClone(tool));
}

function _deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) {
      _deepFreeze(child);
    }
    Object.freeze(value);
  }
  return value;
}

function _serializeToolResult(result: unknown): string {
  if (typeof result === "string") {
    return result;
  }
  return JSON.stringify(result, null, 2);
}

/** Recognize only responses created explicitly by {@link createToolCallResponse}. */
function _isToolCallResponse(
  result: unknown
): result is StructuredToolCallResponse {
  return (
    typeof result === "object" &&
    result !== null &&
    STRUCTURED_TOOL_CALL_RESPONSE in result &&
    result[STRUCTURED_TOOL_CALL_RESPONSE] === true
  );
}
