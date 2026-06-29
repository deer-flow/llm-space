import type {
  AgentEvent,
  AgentStreamRequest,
  FileNode,
  ModelProviderGroup,
  Thread,
} from "@llm-space/core";
import type { RPCSchema } from "electrobun";

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
    };
    // Messages the webview SENDS and the bun side handles.
    messages: {
      sendStreamThreadRequest: StreamThreadRequestPayload;
      abortStreamThread: AbortStreamThreadPayload;
    };
  }>;
  webview: RPCSchema<{
    requests: Record<string, never>;
    // Messages the bun side SENDS and the webview handles.
    messages: {
      receiveStreamThreadResponse: StreamThreadResponsePayload;
      // OS-level fullscreen state changed (entered/exited).
      fullScreenChanged: { fullScreen: boolean };
      // Native File-menu commands, forwarded into the webview.
      newThread: Record<string, never>;
      closeActiveTab: Record<string, never>;
      closeOtherTabs: Record<string, never>;
      closeAllTabs: Record<string, never>;
    };
  }>;
}
