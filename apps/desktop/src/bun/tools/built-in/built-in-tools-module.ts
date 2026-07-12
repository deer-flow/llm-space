import type { DesktopModule } from "../../host/desktop-host";

import { createFsBuiltInTools } from "./fs";
import type { FsBuiltInToolsDependencies } from "./fs";
import { miscBuiltInTools } from "./misc";
import { createWebBuiltInTools } from "./web";
import type { WebBuiltInToolsDependencies } from "./web";

export type BuiltInToolsModuleDependencies = FsBuiltInToolsDependencies &
  WebBuiltInToolsDependencies;

export function createBuiltInToolsModule(
  dependencies: BuiltInToolsModuleDependencies
): DesktopModule {
  return {
    id: "llm-space.built-in-tools",
    register(tools) {
      _assertDependencies(dependencies);
      tools.register({
        id: "llm-space.built-in-tools.web",
        entries: createWebBuiltInTools(dependencies),
      });
      tools.register({
        id: "llm-space.built-in-tools.file-system",
        entries: createFsBuiltInTools(dependencies),
      });
      tools.register({
        id: "llm-space.built-in-tools.misc",
        entries: miscBuiltInTools,
      });
    },
  };
}

function _assertDependencies(
  dependencies: BuiltInToolsModuleDependencies
): void {
  if (!dependencies || typeof dependencies !== "object") {
    throw new Error('Missing built-in tools dependency "dependencies".');
  }
  if (!dependencies.workspaceRoot) {
    throw new Error('Missing built-in tools dependency "workspaceRoot".');
  }
  if (typeof dependencies.findSkill !== "function") {
    throw new Error('Missing built-in tools dependency "findSkill".');
  }
  if (typeof dependencies.getSearchSettings !== "function") {
    throw new Error('Missing built-in tools dependency "getSearchSettings".');
  }
  if (!dependencies.env || typeof dependencies.env !== "object") {
    throw new Error('Missing built-in tools dependency "env".');
  }
}
