import type { HostServices, ModelClient } from "@llm-space/ui/host";

/** Unavailable in the display-only viewer — never called while presentational. */
function unavailable(): never {
  throw new Error("This action is not available in the shared-thread viewer.");
}

/**
 * A display-only {@link HostServices}: `presentational` hides all edit/run
 * chrome, and every capability is a no-op (or throws if somehow invoked). No
 * transport / tool execution / model client, so nothing reaches a backend.
 */
export const webHost: HostServices = {
  presentational: true,
  transport: null,
  executeTool: null,
  skills: {
    getSettings: () => Promise.resolve({ discoveryPaths: [] }),
    listSkills: () => Promise.resolve([]),
  },
  mcp: {
    listServers: () => Promise.resolve([]),
    listTools: () => unavailable(),
  },
  builtinTools: {
    list: () => Promise.resolve([]),
    revealAbsolutePath: () => Promise.resolve(false),
    openAbsolutePath: () => Promise.resolve(false),
    revealSkill: () => Promise.resolve(false),
  },
  paths: {
    ensureRootDir: (relativePath) => Promise.resolve(relativePath),
  },
  files: {
    // No filesystem in the display-only viewer; `@include` resolves to "".
    readText: () => Promise.resolve(""),
    pickFile: () => Promise.resolve(null),
  },
  // No code generation in the display-only viewer.
  generator: null,
  actions: {
    openSettings: () => {
      /* no settings surface in the viewer */
    },
    openLink: (url) => window.open(url, "_blank", "noopener,noreferrer"),
    shareThread: () => {
      /* no share surface in the viewer */
    },
    openVariables: () => {
      /* no variables dialog in the viewer */
    },
    registerOpenVariables: () => () => {
      /* nothing to unregister */
    },
    registerRunThread: () => () => {
      /* nothing to unregister */
    },
  },
};

/** An empty {@link ModelClient}: the viewer shows `thread.modelName`, not a list. */
export const webModelClient: ModelClient = {
  availableModels: () => Promise.resolve([]),
  builtinProviders: () => Promise.resolve([]),
  getDefaultModel: () => Promise.resolve(null),
  setDefaultModel: () => Promise.resolve(null),
  removeProvider: () => Promise.resolve([]),
  addProvider: () => Promise.resolve([]),
  addCustomProvider: () => Promise.resolve([]),
  updateProvider: () => Promise.resolve([]),
  setModelEnabled: () => Promise.resolve([]),
  setAllModelsEnabled: () => Promise.resolve([]),
  testModelConnection: () => Promise.resolve(),
  removeCustomModel: () => Promise.resolve([]),
  upsertCustomModel: () => Promise.resolve([]),
};
