import type { ToolRegistry } from "./tool-registry";

export type RuntimeModuleCleanup = () => Promise<void> | void;

export interface RuntimeModule {
  id: string;
  register(tools: ToolRegistry): void;
  start?(): Promise<RuntimeModuleCleanup | void> | RuntimeModuleCleanup | void;
}
