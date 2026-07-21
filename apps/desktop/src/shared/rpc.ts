import type {
  AgentEvent,
  AgentStreamRequest,
  BuiltinTool,
  CustomModel,
  FileNode,
  ModelConfig,
  ModelProviderGroup,
  NetworkSettings,
  SearchSettings,
  SystemProxyDetection,
  Thread,
} from "@llm-space/core";
import type {
  McpCallToolResponse,
  McpServerDraft,
  McpServerToolsResponse,
  McpServerView,
} from "@llm-space/core";
import type { SkillContent, SkillInfo, SkillsSettings } from "@llm-space/core";
import type { RPCSchema } from "electrobun";

import type { AnalyticsEvent, AnalyticsStatus } from "./analytics";
import type { GithubAuthState } from "./auth";
import type { Command } from "./commands";
import type { FeatureReminder } from "./feature-reminders";
import type { SharedImportStatusPayload } from "./shared-import";
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
import type { UpdateMode, UpdateStatusChangedPayload } from "./updates";

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
      // `candidate` (from the editor dialog) tests an unsaved model config
      // as-is; its `id` overrides `modelId`.
      testModelConnection: {
        params: {
          providerId: string;
          modelId: string;
          candidate?: CustomModel;
        };
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
      // Publish a workspace thread as a shareable link: read the thread from
      // disk, create a secret GitHub Gist (requires GitHub sign-in), and return
      // the web viewer URL + gist id. `title`/`description` override the shared
      // copy's display metadata (the gist description drives the viewer's
      // description). Throws when signed out or the gist API fails; the renderer
      // maps the error to friendly copy.
      shareThread: {
        params: { path: string; title?: string; description?: string };
        response: { shareUrl: string; gistId: string };
      };
      // Reveal a file/directory in the OS file manager (Finder/Explorer).
      fsReveal: { params: { path: string }; response: null };
      // Reveal an arbitrary absolute path (not confined to the workspace) in the
      // OS file manager. Returns whether the path existed; a missing path is not
      // revealed so the caller can surface a "not found" message.
      revealAbsolutePath: {
        params: { path: string };
        response: { existed: boolean };
      };
      // Open an absolute path with the OS default handler (a folder opens in the
      // file manager itself, not selected in its parent). Returns whether the
      // path existed.
      openAbsolutePath: {
        params: { path: string };
        response: { existed: boolean };
      };
      // Reveal a skill's `SKILL.md` in the OS file manager, resolved by skill
      // name. Returns whether a matching skill file was found.
      revealSkill: {
        params: { name: string };
        response: { existed: boolean };
      };
      // Resolve a workspace-relative path to its absolute on-disk path.
      fsRealpath: { params: { path: string }; response: { path: string } };
      // Read an arbitrary text file (NOT confined to the workspace) for the
      // prompt `@include` macro. A leading `~` expands to the user's home.
      // Returns "" for a missing/unreadable path so includes degrade quietly.
      fsReadText: { params: { path: string }; response: { text: string } };
      // Open the native file picker (for a "file content" prompt variable).
      // `path` is null when the user cancels.
      fsPickFile: {
        params: Record<string, never>;
        response: { path: string | null };
      };
      // --- Code generator (export the thread as a runnable project) ---
      // Open the native folder picker for the project's PARENT directory. The
      // wizard combines it with the project name; `path` is null on cancel.
      generatorPickDirectory: {
        params: Record<string, never>;
        response: { path: string | null };
      };
      // Resolve `parentDir/projectName`, validate it can hold a fresh project,
      // create it, and authorize it (bun-side) for the generator's writes +
      // `uv` runs. The wizard's "Next" gate on the directory step.
      generatorPrepareDirectory: {
        params: { parentDir: string; projectName: string };
        response:
          | { ok: true; dir: string }
          | { ok: false; error: string };
      };
      // Whether `uv` is installed on the host (+ version), so the renderer can
      // prompt to install it or fall back to instructions in PLAN.md.
      generatorCheckUv: {
        params: Record<string, never>;
        response: { installed: boolean; version?: string };
      };
      // Run `uv <args>` with cwd = an authorized project directory. Only `uv`
      // can ever be spawned; `rootDir` must have been authorized via
      // `generatorPickDirectory`. Returns the raw exit code + output.
      generatorRunUv: {
        params: { rootDir: string; args: string[] };
        response: { code: number; stdout: string; stderr: string };
      };
      // Write a UTF-8 file under an authorized project directory. Rejects path
      // traversal outside `rootDir`.
      generatorWriteFile: {
        params: { rootDir: string; relativePath: string; contents: string };
        response: null;
      };
      // Delete a file under an authorized project directory; no-op when missing.
      generatorRemoveFile: {
        params: { rootDir: string; relativePath: string };
        response: null;
      };
      // Resolve real secret values for a generated `.env`: the model provider's
      // resolved API key (following `$ENV` refs, codex login, etc.) plus the raw
      // values of the named environment variables. Used only when the user opts
      // in to materializing their keys to disk.
      generatorResolveEnv: {
        params: { providerId: string; envNames: string[] };
        response: { modelApiKey: string; envValues: Record<string, string> };
      };
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
      // The proxy config governing the Bun process's outbound HTTP egress.
      getNetworkSettings: {
        params: Record<string, never>;
        response: NetworkSettings;
      };
      setNetworkSettings: {
        params: { settings: NetworkSettings };
        response: NetworkSettings;
      };
      detectSystemProxy: {
        params: Record<string, never>;
        response: SystemProxyDetection;
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
      // Update settings + the "we just updated" signal (pulled once on mount,
      // race-free vs. the fire-and-forget `updateStatusChanged` message).
      updateMode: { params: Record<string, never>; response: UpdateMode };
      setUpdateMode: { params: { mode: UpdateMode }; response: null };
      pendingInstalledVersion: {
        params: Record<string, never>;
        response: string | null;
      };
      // Decide (and record) whether to show the GitHub-star reminder on this
      // app open. Seeding + the 4-day throttle + the nag cap all resolve in the
      // bun side, so the renderer only has to render when `show` is true.
      githubStarReminderShouldShow: {
        params: Record<string, never>;
        response: { show: boolean };
      };
      // Retire the star reminder for good (the user clicked through to GitHub).
      githubStarReminderDismissForever: {
        params: Record<string, never>;
        response: null;
      };
      // The next unseen one-time feature reminder (`null` once all are seen).
      // Pure read — recording is deferred to `featureReminderMarkSeen`, so this
      // is idempotent and can't burn a reminder that never actually showed.
      featureReminderNext: {
        params: Record<string, never>;
        response: FeatureReminder | null;
      };
      // Record a feature reminder as seen (on dismiss / click-through) so it
      // never appears again.
      featureReminderMarkSeen: {
        params: { id: string };
        response: null;
      };
      // The current GitHub sign-in state, pulled once on mount. Later transitions
      // arrive via the `githubAuthChanged` message. Never carries the token.
      githubAuthStatus: {
        params: Record<string, never>;
        response: GithubAuthState;
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
      // Cancel the in-flight deep-link shared-thread import (aborts the read; no
      // file is written). Sent when the user clicks Cancel on the import modal.
      cancelSharedImport: Record<string, never>;
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
      // GitHub sign-in state changed (signed in/out, or a Device Flow started /
      // failed). Drives the sidebar account widget and the Account settings page.
      githubAuthChanged: GithubAuthState;
      // A unified command dispatched from the bun process (native menu / global
      // shortcuts) to run in the webview. See `shared/commands.ts`.
      executeCommand: Command;
      // Deep-link shared-thread import progress: drives the "importing…" modal
      // and, on success, opens the imported thread. See `bun/deep-link`.
      sharedImportStatusChanged: SharedImportStatusPayload;
    };
  }>;
}
