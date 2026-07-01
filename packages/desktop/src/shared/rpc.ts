import type {
  AgentEvent,
  AgentStreamRequest,
  FileNode,
  ModelProviderGroup,
  Thread,
} from "@llm-space/core";
import type { RPCSchema } from "electrobun";

import type { Command } from "./commands";

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
      updateProvider: {
        params: {
          providerId: string;
          apiKey?: string | null;
          baseUrl?: string | null;
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
