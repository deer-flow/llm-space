import type {
  AgentEvent,
  AgentStreamRequest,
  BuiltinTool,
  CustomModel,
  FileNode,
  ModelConfig,
  ModelProviderGroup,
  Thread,
} from "@llm-space/core";
import type { RPCSchema } from "electrobun";

import type { AnalyticsEvent, AnalyticsStatus } from "./analytics";
import type { Command } from "./commands";
import type {
  McpCallToolResponse,
  McpServerDraft,
  McpServerToolsResponse,
  McpServerView,
} from "./mcp";
import type { SearchSettings } from "./search";
import type { SkillContent, SkillInfo, SkillsSettings } from "./skills";
import type {
  TraceConnectedProjectInput,
  TraceImportFile,
  TraceImportResult,
  TraceLangfuseSearchInput,
  TraceProject,
  TraceRecord,
  TraceRemoteTraceSummary,
  TraceSyncResult,
  TraceWorkbenchResponse,
} from "./traces";
import type { UpdateStatusChangedPayload } from "./updates";

/** A webview→bun request to start streaming an agent run. */
export interface StreamThreadRequestPayload {
  streamId: string;
  request: AgentStreamRequest;
}

/** A bun→webview chunk of a streaming agent run, keyed by `streamId`. */
export type StreamThreadResponsePayload =
  | { streamId: string; type: "event"; event: AgentEvent }
  | { streamId: string; type: "done" }
  | { streamId: string; type: "error"; message: string };

/** A webview→bun request to abort an in-flight stream. */
export interface AbortStreamThreadPayload {
  streamId: string;
}

export interface DesktopRPCType {
  bun: RPCSchema<{
    requests: {
      availableModels: {
        params: Record<string, never>;
        response: ModelProviderGroup[];
      };
      removeProvider: {
        params: { providerId: string };
        response: ModelProviderGroup[];
      };
      // The builtin providers shipped with the app, each flagged with whether an
      // API key was auto-detected in the environment.
      builtinProviders: {
        params: Record<string, never>;
        response: ModelProviderGroup[];
      };
      addProvider: {
        params: { providerId: string };
        response: ModelProviderGroup[];
      };
      addCustomProvider: {
        params: {
          id: string;
          name: string;
          baseUrl: string;
          api?:
            "anthropic-messages" | "openai-completions" | "openai-responses";
        };
        response: ModelProviderGroup[];
      };
      updateProvider: {
        params: {
          providerId: string;
          apiKey?: string | null;
          baseUrl?: string | null;
          headers?: Record<string, string> | null;
          name?: string | null;
          api?:
            | "anthropic-messages"
            | "openai-completions"
            | "openai-responses"
            | null;
          icon?: string | null;
        };
        response: ModelProviderGroup[];
      };
      setModelEnabled: {
        params: { providerId: string; modelId: string; enabled: boolean };
        response: ModelProviderGroup[];
      };
      setAllModelsEnabled: {
        params: { providerId: string; enabled: boolean };
        response: ModelProviderGroup[];
      };
      // The user's chosen default model, or `null` for automatic (first
      // available). Threads with no saved model — or a stale reference — resolve
      // through it.
      getDefaultModel: {
        params: Record<string, never>;
        response: ModelConfig | null;
      };
      setDefaultModel: {
        params: { model: ModelConfig | null };
        response: ModelConfig | null;
      };
      testModelConnection: {
        params: { providerId: string; modelId: string };
        response: null;
      };
      removeCustomModel: {
        params: { providerId: string; modelId: string };
        response: ModelProviderGroup[];
      };
      // Create or edit a custom model. `originalId` (present on edits) names the
      // model being replaced, supporting a rename.
      upsertCustomModel: {
        params: {
          providerId: string;
          model: CustomModel;
          originalId?: string;
        };
        response: ModelProviderGroup[];
      };
      toggleMaximized: {
        params: Record<string, never>;
        response: { maximized: boolean };
      };
      isFullScreen: {
        params: Record<string, never>;
        response: { fullScreen: boolean };
      };
      // Resolve a directory under the llm-space root, creating it (recursively)
      // if missing, and return its absolute path. The renderer can't touch the
      // filesystem or read the root itself.
      ensureRootDir: {
        params: { relativePath: string };
        response: { path: string };
      };
      // Local filesystem / thread storage, mirroring the web `/api/fs/local/*`
      // routes. Void operations resolve to `null`.
      fsLs: { params: { path: string }; response: FileNode[] };
      fsMkdir: { params: { path: string }; response: null };
      fsCp: { params: { src: string; dest: string }; response: null };
      fsMv: { params: { src: string; dest: string }; response: null };
      fsRm: { params: { path: string }; response: null };
      fsRead: { params: { path: string }; response: Thread };
      fsWrite: { params: { path: string; thread: Thread }; response: null };
      // Reveal a file/directory in the OS file manager (Finder/Explorer).
      fsReveal: { params: { path: string }; response: null };
      // Resolve a workspace-relative path to its absolute on-disk path.
      fsRealpath: { params: { path: string }; response: { path: string } };
      mcpListServers: {
        params: Record<string, never>;
        response: McpServerView[];
      };
      mcpAddServer: {
        params: { server: McpServerDraft };
        response: McpServerView[];
      };
      mcpUpdateServer: {
        params: { serverId: string; server: McpServerDraft };
        response: McpServerView[];
      };
      mcpRemoveServer: {
        params: { serverId: string };
        response: McpServerView[];
      };
      mcpDisconnectServer: {
        params: { serverId: string };
        response: McpServerView[];
      };
      mcpListTools: {
        params: { serverId: string };
        response: McpServerToolsResponse;
      };
      mcpCallTool: {
        params: {
          serverId: string;
          toolName: string;
          arguments: Record<string, unknown>;
        };
        response: McpCallToolResponse;
      };
      builtInListTools: {
        params: Record<string, never>;
        response: BuiltinTool[];
      };
      builtInCallTool: {
        params: {
          name: string;
          arguments: Record<string, unknown>;
        };
        response: { contentText: string };
      };
      // The user's anonymous-analytics opt-out preference plus whether the
      // hard gates allow sending at all (see `shared/analytics.ts`).
      getAnalyticsSettings: {
        params: Record<string, never>;
        response: AnalyticsStatus;
      };
      setAnalyticsSettings: {
        params: { enabled: boolean };
        response: AnalyticsStatus;
      };
      // The search provider + API keys backing the built-in web tools.
      getSearchSettings: {
        params: Record<string, never>;
        response: SearchSettings;
      };
      setSearchSettings: {
        params: { settings: SearchSettings };
        response: SearchSettings;
      };
      // The discovery folders + hidden skills backing the built-in Skill tool.
      skillsGetSettings: {
        params: Record<string, never>;
        response: SkillsSettings;
      };
      // Open the native folder picker; `path` is null when the user cancels.
      skillsBrowseForPath: {
        params: Record<string, never>;
        response: { path: string | null };
      };
      skillsAddPath: {
        params: { path: string };
        response: SkillsSettings;
      };
      skillsRemovePath: {
        params: { path: string };
        response: SkillsSettings;
      };
      skillsSetSkillHidden: {
        params: { path: string; skillName: string; hidden: boolean };
        response: SkillsSettings;
      };
      // Enable/disable every skill in one folder at once.
      skillsSetAllSkillsHidden: {
        params: { path: string; hidden: boolean };
        response: SkillsSettings;
      };
      // Discover the skills under one folder (name/description/path/enabled).
      skillsListSkills: {
        params: { path: string };
        response: SkillInfo[];
      };
      // Read one skill's full SKILL.md (frontmatters + body) by its directory.
      skillsReadSkill: {
        params: { path: string };
        response: SkillContent;
      };
      // List trace projects for the dedicated Trace Panel.
      traceListProjects: {
        params: Record<string, never>;
        response: TraceProject[];
      };
      // Create a manual Langfuse trace project under `traces/projects`.
      traceCreateProject: {
        params: { name: string };
        response: TraceProject;
      };
      // Create a connected Langfuse project after validating credentials.
      traceCreateConnectedProject: {
        params: TraceConnectedProjectInput;
        response: TraceProject;
      };
      // List trace summaries for one trace project.
      traceListTraces: {
        params: { projectId: string };
        response: TraceRecord[];
      };
      // Import renderer-read Langfuse JSON files into one trace project.
      traceImportLangfuseJson: {
        params: { projectId: string; files: TraceImportFile[] };
        response: TraceImportResult;
      };
      // Search a bounded remote Langfuse trace list for explicit user sync.
      traceSearchLangfuseTraces: {
        params: { projectId: string; filters?: TraceLangfuseSearchInput };
        response: TraceRemoteTraceSummary[];
      };
      // Sync selected remote Langfuse trace ids into local trace storage.
      traceSyncLangfuseTraces: {
        params: { projectId: string; traceIds: string[] };
        response: TraceSyncResult;
      };
      // Read a trace summary by key without creating a workbench.
      traceReadTrace: {
        params: { projectId: string; traceKey: string };
        response: TraceRecord;
      };
      // Read or lazily create the editable ThreadPlayground workbench.
      traceReadOrCreateWorkbench: {
        params: { projectId: string; traceKey: string };
        response: TraceWorkbenchResponse;
      };
      // Rename a trace summary and keep its editable workbench title in sync.
      traceUpdateTraceTitle: {
        params: { projectId: string; traceKey: string; title: string };
        response: TraceWorkbenchResponse;
      };
      // Persist a trace workbench thread; raw trace data remains immutable.
      traceWriteWorkbench: {
        params: { projectId: string; traceKey: string; thread: Thread };
        response: null;
      };
    };
    // Messages the webview SENDS and the bun side handles.
    messages: {
      sendStreamThreadRequest: StreamThreadRequestPayload;
      abortStreamThread: AbortStreamThreadPayload;
      // A unified command dispatched from the webview to run in the bun process
      // (e.g. window zoom / reload). See `shared/commands.ts`.
      executeCommand: Command;
      // Fire-and-forget: a renderer-only, anonymous analytics event. The bun
      // side is the single network egress for telemetry. See `shared/analytics.ts`.
      captureAnalyticsEvent: AnalyticsEvent;
    };
  }>;
  webview: RPCSchema<{
    requests: Record<string, never>;
    // Messages the bun side SENDS and the webview handles.
    messages: {
      receiveStreamThreadResponse: StreamThreadResponsePayload;
      // OS-level fullscreen state changed (entered/exited).
      fullScreenChanged: { fullScreen: boolean };
      // App-update flow progress from the bun-side updater service.
      updateStatusChanged: UpdateStatusChangedPayload;
      // A unified command dispatched from the bun process (native menu / global
      // shortcuts) to run in the webview. See `shared/commands.ts`.
      executeCommand: Command;
    };
  }>;
}
