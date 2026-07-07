import type { BuiltinTool } from "@llm-space/core";

export type BuiltInToolCategoryId = "fileSystem" | "web" | "misc";

export interface BuiltInToolGroup {
  id: BuiltInToolCategoryId;
  label: string;
  tools: BuiltinTool[];
}
