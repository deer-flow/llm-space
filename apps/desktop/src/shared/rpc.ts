import type {
  AgentEvent,
  AgentStreamRequest,
  CustomModel,
  FileNode,
  ModelProviderGroup,
  Thread,
} from "@llm-space/core";
import type { RPCSchema } from "electrobun";

import type { Command } from "./commands";
import type {
  McpCallToolResponse,
  McpServerDraft,
  McpServerToolsResponse,
  McpServerView,
} from "./mcp";
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
    };
  }>;
  webview: RPCSchema<{
    requests: Record<string, never>;
    // Messages the bun side SENDS and the webview handles.
    messages: {
      receiveStreamThreadResponse: StreamThreadResponsePayload;
      // OS-level fullscreen state changed (entered/exited).
      fullScreenChanged: { fullScreen: boolean };
      // A unified command dispatched from the bun process (native menu / global
      // shortcuts) to run in the webview. See `shared/commands.ts`.
      executeCommand: Command;
    };
  }>;
}
