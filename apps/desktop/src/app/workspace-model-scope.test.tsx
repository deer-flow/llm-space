/* eslint-disable @typescript-eslint/await-thenable, @typescript-eslint/no-empty-function, @typescript-eslint/unbound-method */
import { afterEach, describe, expect, test } from "bun:test";

import type {
  AgentEvent,
  AgentTransport,
  ModelProviderGroup,
  Thread,
} from "@llm-space/core";
import {
  EditorCommitScope,
  useRegisterEditorCommit,
  type EditorCommitScopeHandle,
} from "@llm-space/ui/components/code-editor/editor-commit-scope";
import {
  ThreadPlaygroundSession,
  ThreadPlaygroundView,
} from "@llm-space/ui/components/thread-playground";
import {
  HostServicesProvider,
  type HostServices,
  type ModelClient,
} from "@llm-space/ui/host";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query";
import {
  act,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createRoot, type Root } from "react-dom/client";

import { runRemoteRuntimeActionIfAllowed } from "@/components/remote-runtime-actions";
import { RuntimePaneHost } from "@/components/thread-tabs/runtime-pane-host";
import { RuntimeRunTracker } from "@/components/thread-tabs/runtime-run-tracker";
import { switchWorkspaceRuntimeIfAllowed } from "@/components/thread-tabs/runtime-workspace-transition";
import { SerializedPersistence } from "@/components/thread-tabs/serialized-persistence";
import { settleStreamingPane } from "@/components/thread-tabs/settle-streaming-pane";
import { usePaneRefreshAcknowledgement } from "@/components/thread-tabs/use-pane-refresh-ack";
import type { AppTab } from "@/components/thread-tabs/use-thread-tabs";
import { useThreadViewLru } from "@/components/thread-tabs/use-thread-view-lru";
import type { RuntimeId } from "@/shared/runtime";

import {
  createThreadStore,
  type ThreadStore,
  useThreadStore,
  useThreadStoreApi,
} from "../../../../packages/ui/src/components/thread-playground/stores";
import {
  useThreadPlaygroundEvents,
  type ThreadPlaygroundEventCallbacks,
} from "../../../../packages/ui/src/components/thread-playground/use-thread-playground-events";

import { invalidateRuntimeSwitchQueries } from "./runtime-switch-queries";
import { WorkspaceModelScope } from "./workspace-model-scope";

class FakeHTMLElement {}
class FakeHTMLIFrameElement extends FakeHTMLElement {}

interface FakeDocument {
  activeElement: null;
  addEventListener(): void;
  defaultView: FakeWindow;
  documentElement: { namespaceURI: string };
  nodeName: "#document";
  nodeType: 9;
  removeEventListener(): void;
}

interface FakeWindow {
  document: FakeDocument;
  event: undefined;
  HTMLElement: typeof FakeHTMLElement;
  HTMLIFrameElement: typeof FakeHTMLIFrameElement;
}

class FakeContainer extends FakeHTMLElement {
  readonly children: FakeContainer[] = [];
  readonly namespaceURI = "http://www.w3.org/1999/xhtml";
  readonly nodeName = "DIV";
  readonly nodeType = 1;
  readonly tagName = "DIV";
  parentNode: FakeContainer | null = null;

  constructor(readonly ownerDocument: FakeDocument) {
    super();
  }

  addEventListener(): void {}

  appendChild(child: FakeContainer): FakeContainer {
    this.children.push(child);
    child.parentNode = this;
    return child;
  }

  insertBefore(child: FakeContainer, before: FakeContainer): FakeContainer {
    const index = this.children.indexOf(before);
    this.children.splice(index === -1 ? this.children.length : index, 0, child);
    child.parentNode = this;
    return child;
  }

  removeChild(child: FakeContainer): FakeContainer {
    const index = this.children.indexOf(child);
    if (index !== -1) this.children.splice(index, 1);
    child.parentNode = null;
    return child;
  }

  removeEventListener(): void {}
}

const ORIGINAL_DOCUMENT = globalThis.document;
const ORIGINAL_HTML_ELEMENT = globalThis.HTMLElement;
const ORIGINAL_IFRAME_ELEMENT = globalThis.HTMLIFrameElement;
const ORIGINAL_CANCEL_ANIMATION_FRAME = globalThis.cancelAnimationFrame;
const ORIGINAL_REQUEST_ANIMATION_FRAME = globalThis.requestAnimationFrame;
const ORIGINAL_WINDOW = globalThis.window;

let activeRoot: Root | null = null;

afterEach(async () => {
  if (activeRoot) {
    await act(async () => activeRoot?.unmount());
    activeRoot = null;
  }
  globalThis.document = ORIGINAL_DOCUMENT;
  globalThis.HTMLElement = ORIGINAL_HTML_ELEMENT;
  globalThis.HTMLIFrameElement = ORIGINAL_IFRAME_ELEMENT;
  globalThis.cancelAnimationFrame = ORIGINAL_CANCEL_ANIMATION_FRAME;
  globalThis.requestAnimationFrame = ORIGINAL_REQUEST_ANIMATION_FRAME;
  globalThis.window = ORIGINAL_WINDOW;
});

function _client(): ModelClient {
  const unchanged = () => Promise.resolve([]);
  return {
    availableModels: unchanged,
    builtinProviders: unchanged,
    getDefaultModel: () => Promise.resolve(null),
    setDefaultModel: async (model) => model,
    removeProvider: unchanged,
    addProvider: unchanged,
    addCustomProvider: unchanged,
    addProviderProfile: unchanged,
    updateProviderProfile: unchanged,
    removeProviderProfile: unchanged,
    updateProvider: unchanged,
    setModelEnabled: unchanged,
    setAllModelsEnabled: unchanged,
    testModelConnection: () => Promise.resolve(),
    removeCustomModel: unchanged,
    upsertCustomModel: unchanged,
  };
}

function _createRoot(): Root {
  const fakeWindow = {} as FakeWindow;
  const fakeDocument: FakeDocument = {
    activeElement: null,
    addEventListener() {},
    defaultView: fakeWindow,
    documentElement: { namespaceURI: "http://www.w3.org/1999/xhtml" },
    nodeName: "#document",
    nodeType: 9,
    removeEventListener() {},
  };
  Object.assign(fakeWindow, {
    document: fakeDocument,
    event: undefined,
    HTMLElement: FakeHTMLElement,
    HTMLIFrameElement: FakeHTMLIFrameElement,
  });
  globalThis.document = fakeDocument as unknown as Document;
  globalThis.HTMLElement = FakeHTMLElement as unknown as typeof HTMLElement;
  globalThis.HTMLIFrameElement =
    FakeHTMLIFrameElement as unknown as typeof HTMLIFrameElement;
  globalThis.window = fakeWindow as unknown as Window & typeof globalThis;
  globalThis.requestAnimationFrame = (callback) =>
    setTimeout(() => callback(performance.now()), 0) as unknown as number;
  globalThis.cancelAnimationFrame = (handle) => clearTimeout(handle);
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  return createRoot(new FakeContainer(fakeDocument) as unknown as Element);
}

function _deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, reject, resolve };
}

function _event(value: unknown): AgentEvent {
  return value as AgentEvent;
}

function _MountProbe({
  onMount,
  onUnmount,
}: {
  onMount(): void;
  onUnmount(): void;
}) {
  useEffect(() => {
    onMount();
    return onUnmount;
  }, [onMount, onUnmount]);
  return null;
}

interface TestPane {
  id: string;
  runtimeId: RuntimeId;
}

function _RenderCountPane({
  active,
  onRender,
  pane,
}: {
  active: boolean;
  onRender(paneId: string, active: boolean): void;
  pane: TestPane;
}) {
  onRender(pane.id, active);
  return null;
}

function _RuntimePaneRenderHarness({
  activeId,
  onRender,
  tabs,
}: {
  activeId: string;
  onRender(paneId: string, active: boolean): void;
  tabs: TestPane[];
}) {
  const getPaneKey = useCallback((pane: TestPane) => pane.id, []);
  const renderPane = useCallback(
    (pane: TestPane, active: boolean) => (
      <_RenderCountPane active={active} onRender={onRender} pane={pane} />
    ),
    [onRender]
  );
  return (
    <RuntimePaneHost
      tabs={tabs}
      activeId={activeId}
      getPaneKey={getPaneKey}
      renderPane={renderPane}
    />
  );
}

function _StorePane({
  pane,
  onMount,
}: {
  pane: TestPane;
  onMount(pane: TestPane, store: ThreadStore): () => void;
}) {
  const [store] = useState(() =>
    createThreadStore({ context: { systemPrompt: "initial" } })
  );
  useEffect(() => onMount(pane, store), [onMount, pane, store]);
  return null;
}

interface QueryTestPane extends TestPane {
  path: string;
}

function _QueryStorePane({
  pane,
  onMount,
  onLoadError,
  read,
}: {
  pane: QueryTestPane;
  onMount(pane: TestPane, store: ThreadStore): () => void;
  onLoadError(id: string): void;
  read(pane: QueryTestPane): Promise<string>;
}) {
  const [store] = useState(() =>
    createThreadStore({ context: { systemPrompt: pane.id } })
  );
  const { error } = useQuery({
    queryKey: ["thread", pane.runtimeId, pane.path],
    queryFn: () => read(pane),
    retry: false,
    staleTime: Infinity,
  });
  useEffect(() => onMount(pane, store), [onMount, pane, store]);
  useEffect(() => {
    if (error) onLoadError(pane.id);
  }, [error, onLoadError, pane.id]);
  return null;
}

function _QueryRuntimePaneHost({
  initialTabs,
  activeId,
  onMount,
  onTabsChange,
  read,
}: {
  initialTabs: QueryTestPane[];
  activeId: string;
  onMount(pane: TestPane, store: ThreadStore): () => void;
  onTabsChange(tabs: QueryTestPane[]): void;
  read(pane: QueryTestPane): Promise<string>;
}) {
  const [tabs, setTabs] = useState(initialTabs);
  useLayoutEffect(() => onTabsChange(tabs), [onTabsChange, tabs]);
  return (
    <RuntimePaneHost
      tabs={tabs}
      activeId={activeId}
      getPaneKey={(pane) => pane.id}
      renderPane={(pane) => (
        <_QueryStorePane
          pane={pane}
          onMount={onMount}
          onLoadError={(id) =>
            setTabs((current) => current.filter((tab) => tab.id !== id))
          }
          read={read}
        />
      )}
    />
  );
}

function _FsQueryProbe({
  runtimeId,
  read,
}: {
  runtimeId: RuntimeId;
  read(runtimeId: RuntimeId): Promise<string>;
}) {
  useQuery({
    queryKey: ["fs", runtimeId, "ls"],
    queryFn: () => read(runtimeId),
    retry: false,
    staleTime: Infinity,
  });
  return null;
}

function _StoreEventBridge({
  store,
  callbacks,
  onMount,
  onLayout,
}: {
  store: ThreadStore;
  callbacks: ThreadPlaygroundEventCallbacks;
  onMount(): () => void;
  onLayout?: () => void;
}) {
  useThreadPlaygroundEvents(store, callbacks);
  useLayoutEffect(() => onLayout?.(), [onLayout]);
  useEffect(onMount, [onMount]);
  return null;
}

function _ThreadSessionProbe({
  onStore,
  onUnmount,
}: {
  onStore(store: ThreadStore): void;
  onUnmount(): void;
}) {
  const store = useThreadStoreApi();
  useEffect(() => {
    onStore(store);
    return onUnmount;
  }, [onStore, onUnmount, store]);
  return null;
}

function _ThreadViewProbe({
  onMessageCount,
  onUnmount,
}: {
  onMessageCount(count: number): void;
  onUnmount(): void;
}) {
  const count = useThreadStore(
    (state) => state.thread.context?.messages?.length ?? 0
  );
  useEffect(() => {
    onMessageCount(count);
  }, [count, onMessageCount]);
  useEffect(() => onUnmount, [onUnmount]);
  return null;
}

function _ThreadSessionHarness({
  host,
  initialValue,
  onMessageCount,
  onSessionStore,
  onSessionUnmount,
  onViewUnmount,
  showView,
  transport,
}: {
  host: HostServices;
  initialValue: Thread;
  onMessageCount(count: number): void;
  onSessionStore(store: ThreadStore): void;
  onSessionUnmount(): void;
  onViewUnmount(): void;
  showView: boolean;
  transport?: AgentTransport;
}) {
  return (
    <HostServicesProvider value={host}>
      <ThreadPlaygroundSession
        initialValue={initialValue}
        runtimeId="local"
        transport={transport}
      >
        <_ThreadSessionProbe
          onStore={onSessionStore}
          onUnmount={onSessionUnmount}
        />
        {showView ? (
          <_ThreadViewProbe
            onMessageCount={onMessageCount}
            onUnmount={onViewUnmount}
          />
        ) : null}
      </ThreadPlaygroundSession>
    </HostServicesProvider>
  );
}

function _EditorCommitProbe({
  editorId,
  events,
}: {
  editorId: string;
  events: string[];
}) {
  const commit = useCallback(() => {
    events.push(`commit:${editorId}`);
  }, [editorId, events]);
  useRegisterEditorCommit(commit);
  return null;
}

function _CommitScopeView({
  events,
  handles,
  paneId,
}: {
  events: string[];
  handles: Map<string, EditorCommitScopeHandle>;
  paneId: string;
}) {
  const handleReady = useCallback(
    (handle: EditorCommitScopeHandle | null) => {
      if (handle) handles.set(paneId, handle);
      else handles.delete(paneId);
    },
    [handles, paneId]
  );
  useEffect(
    () => () => {
      events.push(`unmount:${paneId}`);
    },
    [events, paneId]
  );
  return (
    <EditorCommitScope onReady={handleReady}>
      <_EditorCommitProbe editorId={`${paneId}:message`} events={events} />
      <_EditorCommitProbe editorId={`${paneId}:tool-result`} events={events} />
    </EditorCommitScope>
  );
}

function _ThreadViewLruHarness({
  activeId,
  capacity,
  events,
  tabs,
}: {
  activeId: string;
  capacity: number;
  events: string[];
  tabs: AppTab[];
}) {
  const handlesRef = useRef(new Map<string, EditorCommitScopeHandle>());
  const commitPane = useCallback((paneId: string) => {
    handlesRef.current.get(paneId)?.commitAll();
  }, []);
  const retained = useThreadViewLru({
    tabs,
    activeId,
    capacity,
    commitPane,
  });
  return tabs.map((tab) =>
    tab.type === "thread" && retained.has(tab.paneId) ? (
      <_CommitScopeView
        key={tab.paneId}
        events={events}
        handles={handlesRef.current}
        paneId={tab.paneId}
      />
    ) : null
  );
}

describe("WorkspaceModelScope", () => {
  test("runtime changes preserve the mounted workspace identity", async () => {
    const clients = new Map<RuntimeId, ModelClient>([
      ["local", _client()],
      ["remote:server-1", _client()],
    ]);
    const clientCreations = new Map<RuntimeId, number>();
    const createClient = (runtimeId: RuntimeId) => {
      clientCreations.set(runtimeId, (clientCreations.get(runtimeId) ?? 0) + 1);
      const client = clients.get(runtimeId);
      if (!client) throw new Error(`Missing test client for ${runtimeId}`);
      return client;
    };
    let mounts = 0;
    let unmounts = 0;
    const onMount = () => {
      mounts += 1;
    };
    const onUnmount = () => {
      unmounts += 1;
    };
    const probe = <_MountProbe onMount={onMount} onUnmount={onUnmount} />;
    activeRoot = _createRoot();

    await act(async () => {
      activeRoot?.render(
        <WorkspaceModelScope runtimeId="local" createClient={createClient}>
          {probe}
        </WorkspaceModelScope>
      );
      await Promise.resolve();
    });
    expect({ mounts, unmounts }).toEqual({ mounts: 1, unmounts: 0 });

    await act(async () => {
      activeRoot?.render(
        <WorkspaceModelScope
          runtimeId="remote:server-1"
          createClient={createClient}
        >
          {probe}
        </WorkspaceModelScope>
      );
      await Promise.resolve();
    });

    expect({ mounts, unmounts }).toEqual({ mounts: 1, unmounts: 0 });

    await act(async () => {
      activeRoot?.render(
        <WorkspaceModelScope runtimeId="local" createClient={createClient}>
          {probe}
        </WorkspaceModelScope>
      );
      await Promise.resolve();
    });

    expect(Object.fromEntries(clientCreations)).toEqual({
      local: 1,
      "remote:server-1": 1,
    });
  });
});

describe("ThreadPlayground Session/View lifecycle", () => {
  test("releasing and remounting a view preserves the exact session store", async () => {
    const modelProvider = {
      id: "openai",
      name: "OpenAI",
      profiles: [{ id: "default", name: "Default" }],
      models: [
        {
          id: "test-model",
          name: "Test Model",
          api: "openai-responses",
          provider: "openai",
          baseUrl: "https://example.test/v1",
          reasoning: false,
          input: ["text"],
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          contextWindow: 1000,
          maxTokens: 100,
        },
      ],
    } as ModelProviderGroup;
    const client: ModelClient = {
      ..._client(),
      availableModels: async () => [modelProvider],
    };
    const createClient = () => client;
    const streamStarted = _deferred();
    const releaseStream = _deferred();
    const transport: AgentTransport = async function* () {
      streamStarted.resolve();
      await releaseStream.promise;
      yield* [
        _event({
          type: "message_start",
          message: { role: "assistant" },
        }),
        _event({
          type: "message_update",
          assistantMessageEvent: { type: "text_start", contentIndex: 0 },
        }),
        _event({
          type: "message_update",
          assistantMessageEvent: {
            type: "text_delta",
            contentIndex: 0,
            delta: "Completed while hidden",
          },
        }),
        _event({
          type: "message_end",
          message: { role: "assistant" },
        }),
      ];
    };
    const host = {
      executeTool: null,
      files: { resolvePath: async (path: string) => path },
      skills: {},
    } as HostServices;
    const initialValue: Thread = {
      model: { provider: "openai", id: "test-model" },
      context: {
        messages: [
          {
            id: "user-1",
            role: "user",
            content: [{ type: "text", text: "Run" }],
          },
        ],
      },
    };
    let sessionStore: ThreadStore | null = null;
    let firstStore: ThreadStore | null = null;
    let sessionUnmounts = 0;
    let viewUnmounts = 0;
    const messageCounts: number[] = [];
    const onSessionStore = (store: ThreadStore) => {
      sessionStore = store;
      firstStore ??= store;
    };
    const onSessionUnmount = () => {
      sessionUnmounts += 1;
    };
    const onViewUnmount = () => {
      viewUnmounts += 1;
    };
    const onMessageCount = (count: number) => {
      messageCounts.push(count);
    };
    const render = (showView: boolean) => (
      <WorkspaceModelScope
        runtimeId="local"
        createClient={createClient}
      >
        <_ThreadSessionHarness
          host={host}
          initialValue={initialValue}
          onMessageCount={onMessageCount}
          onSessionStore={onSessionStore}
          onSessionUnmount={onSessionUnmount}
          onViewUnmount={onViewUnmount}
          showView={showView}
          transport={transport}
        />
      </WorkspaceModelScope>
    );
    activeRoot = _createRoot();

    await act(async () => {
      activeRoot?.render(render(true));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(typeof ThreadPlaygroundView).toBe("function");
    expect(firstStore).not.toBeNull();
    const runningStore = sessionStore as ThreadStore | null;
    if (!runningStore) throw new Error("Thread session did not mount");

    const runPromise = runningStore.getState().run();
    await streamStarted.promise;

    await act(async () => activeRoot?.render(render(false)));
    expect({ sessionUnmounts, viewUnmounts }).toEqual({
      sessionUnmounts: 0,
      viewUnmounts: 1,
    });

    await act(async () => {
      releaseStream.resolve();
      await runPromise;
    });
    expect(runningStore.getState().status).toBe("idle");

    await act(async () => activeRoot?.render(render(true)));
    expect(sessionStore).toBe(firstStore);
    expect(messageCounts.at(-1)).toBe(2);
    expect(
      runningStore.getState().thread.context?.messages?.at(-1)?.content
    ).toContainEqual({ type: "text", text: "Completed while hidden" });
    expect(sessionUnmounts).toBe(0);
  });
});

describe("Thread View LRU draft commits", () => {
  const tabs: AppTab[] = ["a", "b"].map((id) => ({
    id: `thread:${id}`,
    type: "thread",
    path: `/${id}.json`,
    runtimeId: "local",
    paneId: `pane:${id}`,
  }));

  test("commits every registered editor before an evicted view unmounts", async () => {
    const events: string[] = [];
    const render = (activeId: string) => (
      <_ThreadViewLruHarness
        activeId={activeId}
        capacity={1}
        events={events}
        tabs={tabs}
      />
    );
    activeRoot = _createRoot();

    await act(async () => activeRoot?.render(render("thread:a")));
    await act(async () => activeRoot?.render(render("thread:b")));

    expect(events).toEqual([
      "commit:pane:a:message",
      "commit:pane:a:tool-result",
      "unmount:pane:a",
    ]);
  });

  test("does not request a commit when no view is evicted", async () => {
    const events: string[] = [];
    const render = (activeId: string) => (
      <_ThreadViewLruHarness
        activeId={activeId}
        capacity={2}
        events={events}
        tabs={tabs}
      />
    );
    activeRoot = _createRoot();

    await act(async () => activeRoot?.render(render("thread:a")));
    await act(async () => activeRoot?.render(render("thread:b")));

    expect(events).toEqual([]);
  });
});

describe("RuntimePaneHost", () => {
  test("switching active panes does not rerender an unrelated hidden pane", async () => {
    const panes: TestPane[] = [
      { id: "pane-a", runtimeId: "local" },
      { id: "pane-b", runtimeId: "remote:server-1" },
      { id: "pane-c", runtimeId: "remote:server-2" },
    ];
    const renderCounts = new Map<string, number>();
    const onRender = (paneId: string) => {
      renderCounts.set(paneId, (renderCounts.get(paneId) ?? 0) + 1);
    };
    const render = (activeId: string) => (
      <_RuntimePaneRenderHarness
        activeId={activeId}
        onRender={onRender}
        tabs={panes}
      />
    );
    activeRoot = _createRoot();

    await act(async () => activeRoot?.render(render("pane-a")));
    await act(async () => activeRoot?.render(render("pane-b")));

    expect(Object.fromEntries(renderCounts)).toEqual({
      "pane-a": 2,
      "pane-b": 2,
      "pane-c": 1,
    });
  });

  test("an older settlement leaves a newer run lease active", () => {
    const tracker = new RuntimeRunTracker();
    tracker.beginRun("local-pane", "local", "run-1");
    tracker.beginRun("local-pane", "local", "run-2");

    expect(tracker.settleRun("local-pane", "run-1")).toBe(true);
    expect(tracker.canDisconnect("local")).toBe(false);
    expect(tracker.settleRun("local-pane", "run-2")).toBe(true);
    expect(tracker.canDisconnect("local")).toBe(true);
  });

  test("overlapping run owners keep the pane busy until both settle", () => {
    const tracker = new RuntimeRunTracker();
    tracker.beginRun("local-pane", "local", "run-1");
    tracker.beginRun("local-pane", "local", "run-2");

    expect(tracker.settleRun("local-pane", "run-2")).toBe(true);
    expect(tracker.canDisconnect("local")).toBe(false);
    expect(tracker.settleRun("local-pane", "run-1")).toBe(true);
    expect(tracker.canDisconnect("local")).toBe(true);
  });

  test("a delayed first-run end cannot capture the second run token", async () => {
    const store = createThreadStore({ context: {} });
    const tracker = new RuntimeRunTracker();
    const starts: string[] = [];
    const ends: string[] = [];
    const callbacks: ThreadPlaygroundEventCallbacks = {
      onStreamingStart: (runId) => {
        starts.push(runId);
        tracker.beginRun("local-pane", "local", runId);
      },
      onStreamingEnd: (runId) => {
        ends.push(runId);
        tracker.settleRun("local-pane", runId);
      },
    };
    activeRoot = _createRoot();
    await act(async () => {
      activeRoot?.render(
        <_StoreEventBridge
          store={store}
          callbacks={callbacks}
          onMount={() => () => undefined}
        />
      );
    });

    act(() => {
      store.setState({ status: "preparing", activeRunId: "run-1" });
      store.setState({ status: "idle", activeRunId: null });
      store.setState({ status: "preparing", activeRunId: "run-2" });
    });
    await Promise.resolve();

    expect(starts).toEqual(["run-1", "run-2"]);
    expect(ends).toEqual(["run-1"]);
    expect(tracker.canDisconnect("local")).toBe(false);
  });

  test("async prompt preparation owns the pane before transport starts", async () => {
    const include = _deferred<string>();
    let transportCalls = 0;
    const store = createThreadStore(
      {
        context: {
          systemPrompt: '@include("slow.txt")',
          messages: [
            {
              id: "user-1",
              role: "user",
              content: [{ type: "text", text: "Run" }],
            },
          ],
        },
      },
      {
        loadFile: () => include.promise,
        resolveModel: () => ({ provider: "test", id: "test" }),
        transport: async function* () {
          transportCalls += 1;
          yield _event({
            type: "message_start",
            message: { role: "assistant" },
          });
          yield _event({
            type: "message_end",
            message: { role: "assistant", content: [] },
          });
        },
      }
    );
    const tracker = new RuntimeRunTracker();
    const callbacks: ThreadPlaygroundEventCallbacks = {
      onStreamingStart: (runId) => {
        tracker.beginRun("local-pane", "local", runId);
      },
      onStreamingEnd: (runId) => {
        tracker.settleRun("local-pane", runId);
      },
    };
    activeRoot = _createRoot();
    await act(async () => {
      activeRoot?.render(
        <_StoreEventBridge
          store={store}
          callbacks={callbacks}
          onMount={() => () => undefined}
        />
      );
    });

    const run = store.getState().run();
    await Promise.resolve();
    expect(store.getState().status).toBe("preparing");
    expect(tracker.canDisconnect("local")).toBe(false);
    expect(transportCalls).toBe(0);

    include.resolve("Prepared");
    await run;
    await Promise.resolve();
    expect(store.getState().status).toBe("idle");
    expect(tracker.canDisconnect("local")).toBe(true);
  });

  test("the run owner is installed before passive effects can flush", async () => {
    const finish = _deferred();
    const store = createThreadStore(
      {
        context: {
          messages: [
            {
              id: "user-1",
              role: "user",
              content: [{ type: "text", text: "Run" }],
            },
          ],
        },
      },
      {
        resolveModel: () => ({ provider: "test", id: "test" }),
        transport: async function* () {
          await finish.promise;
          yield _event({
            type: "message_start",
            message: { role: "assistant" },
          });
          yield _event({
            type: "message_end",
            message: { role: "assistant", content: [] },
          });
        },
      }
    );
    const tracker = new RuntimeRunTracker();
    let run: Promise<void> | undefined;
    activeRoot = _createRoot();
    await act(async () => {
      activeRoot?.render(
        <_StoreEventBridge
          store={store}
          callbacks={{
            onStreamingStart: (runId) =>
              tracker.beginRun("local-pane", "local", runId),
            onStreamingEnd: (runId) => tracker.settleRun("local-pane", runId),
          }}
          onLayout={() => {
            run = store.getState().run();
          }}
          onMount={() => () => undefined}
        />
      );
      await Promise.resolve();
    });

    expect(store.getState().status).not.toBe("idle");
    expect(tracker.canDisconnect("local")).toBe(false);
    finish.resolve();
    await run;
    await Promise.resolve();
  });

  test("a synchronous preflight failure releases the same preparing token", async () => {
    const store = createThreadStore(
      { context: {} },
      {
        resolveModel: () => {
          throw new Error("model lookup failed");
        },
      }
    );
    const starts: string[] = [];
    const ends: string[] = [];
    activeRoot = _createRoot();
    await act(async () => {
      activeRoot?.render(
        <_StoreEventBridge
          store={store}
          callbacks={{
            onStreamingStart: (runId) => {
              starts.push(runId);
            },
            onStreamingEnd: (runId) => {
              ends.push(runId);
            },
          }}
          onMount={() => () => undefined}
        />
      );
    });

    await store.getState().run();
    await Promise.resolve();
    expect(store.getState().status).toBe("idle");
    expect(starts).toHaveLength(1);
    expect(ends).toEqual(starts);
  });

  test("a no-op preflight failure settles without manufacturing a write", async () => {
    const store = createThreadStore(
      { context: {} },
      {
        resolveModel: () => {
          throw new Error("model lookup failed");
        },
      }
    );
    const tracker = new RuntimeRunTracker();
    const writes: Thread[] = [];
    const persistence = new SerializedPersistence<Thread>(async (thread) => {
      writes.push(thread);
    });
    let settlement: Promise<void> | null = null;
    activeRoot = _createRoot();
    await act(async () => {
      activeRoot?.render(
        <_StoreEventBridge
          store={store}
          callbacks={{
            onChange: (thread) => persistence.setPending(thread),
            onStreamingStart: (runId) =>
              tracker.beginRun("local-pane", "local", runId),
            onStreamingEnd: (runId) => {
              settlement = settleStreamingPane(
                () => persistence.flush(),
                () => tracker.settleRun("local-pane", runId)
              );
            },
          }}
          onMount={() => () => undefined}
        />
      );
    });

    await store.getState().run();
    await Promise.resolve();
    await settlement;

    expect(writes).toEqual([]);
    expect(tracker.canDisconnect("local")).toBe(true);
  });

  test("a no-op preflight failure still flushes one preexisting edit", async () => {
    const store = createThreadStore(
      { context: {} },
      {
        resolveModel: () => {
          throw new Error("model lookup failed");
        },
      }
    );
    const tracker = new RuntimeRunTracker();
    const writes: Thread[] = [];
    const persistence = new SerializedPersistence<Thread>(async (thread) => {
      writes.push(thread);
    });
    persistence.setPending(store.getState().thread);
    let settlement: Promise<void> | null = null;
    activeRoot = _createRoot();
    await act(async () => {
      activeRoot?.render(
        <_StoreEventBridge
          store={store}
          callbacks={{
            onChange: (thread) => persistence.setPending(thread),
            onStreamingStart: (runId) =>
              tracker.beginRun("local-pane", "local", runId),
            onStreamingEnd: (runId) => {
              settlement = settleStreamingPane(
                () => persistence.flush(),
                () => tracker.settleRun("local-pane", runId)
              );
            },
          }}
          onMount={() => () => undefined}
        />
      );
    });

    await store.getState().run();
    await Promise.resolve();
    await settlement;

    expect(writes).toHaveLength(1);
    expect(tracker.canDisconnect("local")).toBe(true);
  });

  test("a reserved pane rejects a new preparing run before transport starts", async () => {
    let transportCalls = 0;
    const store = createThreadStore(
      {
        context: {
          messages: [
            {
              id: "user-1",
              role: "user",
              content: [{ type: "text", text: "Run" }],
            },
          ],
        },
      },
      {
        resolveModel: () => ({ provider: "test", id: "test" }),
        transport: async function* () {
          transportCalls += 1;
          yield _event({ type: "agent_end", messages: [] });
        },
      }
    );
    const tracker = new RuntimeRunTracker();
    const release = tracker.reservePanes(["local-pane"]);
    expect(release).not.toBeNull();
    let changeCalls = 0;
    let endCalls = 0;
    const callbacks: ThreadPlaygroundEventCallbacks = {
      onChange: () => {
        changeCalls += 1;
      },
      onStreamingStart: (runId) =>
        tracker.beginRun("local-pane", "local", runId),
      onStreamingEnd: (runId) => {
        endCalls += 1;
        tracker.settleRun("local-pane", runId);
      },
    };
    activeRoot = _createRoot();
    await act(async () => {
      activeRoot?.render(
        <_StoreEventBridge
          store={store}
          callbacks={callbacks}
          onMount={() => () => undefined}
        />
      );
    });

    await store.getState().run();
    await Promise.resolve();
    expect(store.getState().status).toBe("idle");
    expect(transportCalls).toBe(0);
    expect(tracker.hasAnyRunning()).toBe(false);
    expect({ changeCalls, endCalls }).toEqual({
      changeCalls: 0,
      endCalls: 0,
    });
    release?.();
  });

  test("refresh releases only after the replacement owner commits", async () => {
    let ownerCommits = 0;
    let completeRefresh: (() => void) | null = null;
    const settledAt: number[] = [];
    const tracker = new RuntimeRunTracker();
    const release = tracker.reservePanes(["local-pane"]);
    expect(release).not.toBeNull();
    let transportCalls = 0;
    const store = createThreadStore(
      {
        context: {
          messages: [
            {
              id: "user-1",
              role: "user",
              content: [{ type: "text", text: "Run" }],
            },
          ],
        },
      },
      {
        resolveModel: () => ({ provider: "test", id: "test" }),
        transport: async function* () {
          transportCalls += 1;
          yield _event({ type: "agent_end", messages: [] });
        },
      }
    );

    function KeyedOwner() {
      useLayoutEffect(() => {
        ownerCommits += 1;
      }, []);
      return null;
    }

    function RefreshOwner() {
      const [reloadKey, setReloadKey] = useState(0);
      const { markCommitPending } = usePaneRefreshAcknowledgement({
        paneId: "local-pane",
        reloadKey,
        onSettled: () => {
          settledAt.push(ownerCommits);
          release?.();
        },
      });
      useEffect(() => {
        completeRefresh = () => {
          markCommitPending();
          setReloadKey((key) => key + 1);
        };
      }, [markCommitPending]);
      return <KeyedOwner key={reloadKey} />;
    }

    activeRoot = _createRoot();
    await act(async () => {
      activeRoot?.render(
        <>
          <RefreshOwner />
          <_StoreEventBridge
            store={store}
            callbacks={{
              onStreamingStart: (runId) =>
                tracker.beginRun("local-pane", "local", runId),
              onStreamingEnd: (runId) => {
                tracker.settleRun("local-pane", runId);
              },
            }}
            onMount={() => () => undefined}
          />
        </>
      );
    });

    await store.getState().run();
    expect(transportCalls).toBe(0);
    await act(async () => completeRefresh?.());
    expect(settledAt).toEqual([2]);
    await store.getState().run();
    await Promise.resolve();
    expect(transportCalls).toBe(1);
  });

  test("a remote mutation holds its pane reservation through the RPC", async () => {
    const rpc = _deferred();
    const tracker = new RuntimeRunTracker();
    const action = runRemoteRuntimeActionIfAllowed({
      allowed: () => true,
      acquire: () => tracker.reservePanes(["local-pane"]),
      action: () => rpc.promise,
    });
    await Promise.resolve();

    expect(tracker.beginRun("local-pane", "local", "during-rpc")).toBe(false);
    rpc.resolve();
    expect(await action).toBe(true);
    expect(tracker.beginRun("local-pane", "local", "after-rpc")).toBe(true);
  });

  test("an old persistence owner cannot falsely unlock a replacement pane", () => {
    const tracker = new RuntimeRunTracker();
    const oldOwner = {};
    const currentOwner = {};
    tracker.setPersistenceBusy("local-pane", "local", oldOwner, true);
    tracker.setPersistenceBusy("local-pane", "local", currentOwner, true);
    tracker.setPersistenceBusy("local-pane", "local", oldOwner, false);

    expect(tracker.reservePanes(["local-pane"])).toBeNull();
    tracker.setPersistenceBusy("local-pane", "local", currentOwner, false);
    const release = tracker.reservePanes(["local-pane"]);
    expect(release).not.toBeNull();
    release?.();
  });

  test("a replacement persistence owner cannot hide an older writer", () => {
    const tracker = new RuntimeRunTracker();
    const oldOwner = {};
    const replacementOwner = {};
    tracker.setPersistenceBusy("local-pane", "local", oldOwner, true);
    tracker.setPersistenceBusy("local-pane", "local", replacementOwner, true);
    tracker.setPersistenceBusy("local-pane", "local", replacementOwner, false);

    expect(tracker.reservePanes(["local-pane"])).toBeNull();
    tracker.setPersistenceBusy("local-pane", "local", oldOwner, false);
    const release = tracker.reservePanes(["local-pane"]);
    expect(release).not.toBeNull();
    release?.();
  });

  test("unmount aborts a deferred owner and settles after partial output persists", async () => {
    const streamStarted = _deferred();
    const releaseTransport = _deferred();
    const releaseWrite = _deferred();
    let streamSignal: AbortSignal | undefined;
    const store = createThreadStore(
      {
        context: {
          messages: [
            {
              id: "user-1",
              role: "user",
              content: [{ type: "text", text: "Run" }],
            },
          ],
        },
      },
      {
        resolveModel: () => ({ provider: "test", id: "test" }),
        transport: async function* (_request, options) {
          streamSignal = options.signal;
          yield _event({
            type: "message_start",
            message: { role: "assistant" },
          });
          yield _event({
            type: "message_update",
            assistantMessageEvent: {
              type: "text_start",
              contentIndex: 0,
            },
          });
          yield _event({
            type: "message_update",
            assistantMessageEvent: {
              type: "text_delta",
              contentIndex: 0,
              delta: "partial",
            },
          });
          streamStarted.resolve();
          await Promise.race([
            releaseTransport.promise,
            new Promise<void>((resolve) => {
              options.signal?.addEventListener("abort", () => resolve(), {
                once: true,
              });
            }),
          ]);
        },
      }
    );
    const tracker = new RuntimeRunTracker();
    let pendingThread: Thread | null = null;
    let settlement: Promise<void> | null = null;
    activeRoot = _createRoot();
    await act(async () => {
      activeRoot?.render(
        <_StoreEventBridge
          store={store}
          callbacks={{
            onChange: (thread) => {
              pendingThread = thread;
            },
            onStreamingStart: (runId) =>
              tracker.beginRun("local-pane", "local", runId),
            onStreamingEnd: (runId) => {
              settlement = settleStreamingPane(
                async () => {
                  if (!pendingThread) return;
                  await releaseWrite.promise;
                },
                () => tracker.settleRun("local-pane", runId)
              );
            },
          }}
          onMount={() => () => undefined}
        />
      );
    });

    const run = store.getState().run();
    await streamStarted.promise;
    await act(async () => {
      activeRoot?.unmount();
      activeRoot = null;
    });

    const abortedOnUnmount = streamSignal?.aborted;
    releaseTransport.resolve();
    releaseWrite.resolve();
    await Promise.all([run, settlement]);
    expect(abortedOnUnmount).toBe(true);
    expect(tracker.canDisconnect("local")).toBe(true);
  });

  test("runtime round trips preserve each thread store and its undo history", async () => {
    const panes: TestPane[] = [
      { id: "local-thread", runtimeId: "local" },
      { id: "remote-thread", runtimeId: "remote:server-1" },
    ];
    const mountedStores = new Map<string, ThreadStore>();
    const mountCounts = new Map<string, number>();
    const unmountCounts = new Map<string, number>();
    const onMount = (pane: TestPane, store: ThreadStore) => {
      mountedStores.set(pane.id, store);
      mountCounts.set(pane.id, (mountCounts.get(pane.id) ?? 0) + 1);
      return () => {
        unmountCounts.set(pane.id, (unmountCounts.get(pane.id) ?? 0) + 1);
      };
    };
    const renderRuntime = (runtimeId: RuntimeId) => (
      <RuntimePaneHost
        tabs={panes}
        activeId={
          panes.find((pane) => pane.runtimeId === runtimeId)?.id ?? null
        }
        getPaneKey={(pane) => pane.id}
        renderPane={(pane) => <_StorePane pane={pane} onMount={onMount} />}
      />
    );
    activeRoot = _createRoot();

    await act(async () => {
      activeRoot?.render(renderRuntime("local"));
    });
    const originalLocalStore = mountedStores.get("local-thread");
    expect(originalLocalStore).toBeDefined();
    originalLocalStore?.getState().updateSystemPrompt("first edit");
    originalLocalStore?.getState().updateSystemPrompt("second edit");

    await act(async () => {
      activeRoot?.render(renderRuntime("remote:server-1"));
    });
    await act(async () => {
      activeRoot?.render(renderRuntime("local"));
    });
    await act(async () => {
      activeRoot?.render(renderRuntime("remote:server-1"));
    });
    await act(async () => {
      activeRoot?.render(renderRuntime("local"));
    });

    const restoredLocalStore = mountedStores.get("local-thread");
    expect(restoredLocalStore).toBe(originalLocalStore);
    restoredLocalStore?.getState().undo();
    expect(restoredLocalStore?.getState().thread.context?.systemPrompt).toBe(
      "first edit"
    );
    expect(Object.fromEntries(mountCounts)).toEqual({
      "local-thread": 1,
      "remote-thread": 1,
    });
    expect(Object.fromEntries(unmountCounts)).toEqual({});
  });

  test("runtime switching does not refetch or close hidden thread owners", async () => {
    const panes: QueryTestPane[] = [
      { id: "local-active", runtimeId: "local", path: "active.json" },
      { id: "local-hidden", runtimeId: "local", path: "hidden.json" },
      {
        id: "remote-active",
        runtimeId: "remote:server-1",
        path: "remote-active.json",
      },
      {
        id: "remote-hidden",
        runtimeId: "remote:server-1",
        path: "remote-hidden.json",
      },
    ];
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const reads = new Map<string, number>();
    const read = (pane: QueryTestPane) => {
      const count = (reads.get(pane.id) ?? 0) + 1;
      reads.set(pane.id, count);
      return count === 1
        ? Promise.resolve(pane.id)
        : Promise.reject(new Error(`transient ${pane.id} read failure`));
    };
    const stores = new Map<string, ThreadStore>();
    const mounts = new Map<string, number>();
    const unmounts = new Map<string, number>();
    const onMount = (pane: TestPane, store: ThreadStore) => {
      stores.set(pane.id, store);
      mounts.set(pane.id, (mounts.get(pane.id) ?? 0) + 1);
      return () => {
        unmounts.set(pane.id, (unmounts.get(pane.id) ?? 0) + 1);
      };
    };
    let openTabs = panes;
    const onTabsChange = (tabs: QueryTestPane[]) => {
      openTabs = tabs;
    };
    const fsReads = new Map<RuntimeId, number>();
    const readFs = (runtimeId: RuntimeId) => {
      fsReads.set(runtimeId, (fsReads.get(runtimeId) ?? 0) + 1);
      return Promise.resolve(runtimeId);
    };
    const render = (activeId: string) => (
      <QueryClientProvider client={queryClient}>
        <_FsQueryProbe runtimeId="local" read={readFs} />
        <_FsQueryProbe runtimeId="remote:server-1" read={readFs} />
        <_QueryRuntimePaneHost
          initialTabs={panes}
          activeId={activeId}
          onMount={onMount}
          onTabsChange={onTabsChange}
          read={read}
        />
      </QueryClientProvider>
    );
    activeRoot = _createRoot();
    await act(async () => {
      activeRoot?.render(render("local-active"));
      await Promise.resolve();
    });
    const originalLocalHidden = stores.get("local-hidden");
    const originalRemoteHidden = stores.get("remote-hidden");
    expect(originalLocalHidden).toBeDefined();
    expect(originalRemoteHidden).toBeDefined();
    originalLocalHidden?.getState().updateSystemPrompt("first edit");
    originalLocalHidden?.getState().updateSystemPrompt("second edit");
    originalRemoteHidden?.getState().updateSystemPrompt("first remote edit");
    originalRemoteHidden?.getState().updateSystemPrompt("second remote edit");

    await act(async () => {
      activeRoot?.render(render("remote-active"));
      await invalidateRuntimeSwitchQueries(queryClient, "remote:server-1");
      await Promise.resolve();
    });
    expect(Object.fromEntries(fsReads)).toEqual({
      local: 1,
      "remote:server-1": 2,
    });
    await act(async () => {
      activeRoot?.render(render("local-active"));
      await invalidateRuntimeSwitchQueries(queryClient, "local");
      await Promise.resolve();
    });

    expect(Object.fromEntries(reads)).toEqual({
      "local-active": 1,
      "local-hidden": 1,
      "remote-active": 1,
      "remote-hidden": 1,
    });
    expect(Object.fromEntries(fsReads)).toEqual({
      local: 2,
      "remote:server-1": 2,
    });
    expect(openTabs.map((tab) => tab.id)).toEqual(panes.map((pane) => pane.id));
    expect(stores.get("local-hidden")).toBe(originalLocalHidden);
    expect(stores.get("remote-hidden")).toBe(originalRemoteHidden);
    stores.get("local-hidden")?.getState().undo();
    stores.get("remote-hidden")?.getState().undo();
    expect(
      stores.get("local-hidden")?.getState().thread.context?.systemPrompt
    ).toBe("first edit");
    expect(
      stores.get("remote-hidden")?.getState().thread.context?.systemPrompt
    ).toBe("first remote edit");
    expect(Object.fromEntries(mounts)).toEqual({
      "local-active": 1,
      "local-hidden": 1,
      "remote-active": 1,
      "remote-hidden": 1,
    });
    expect(Object.fromEntries(unmounts)).toEqual({});
  });

  test("an active stream blocks teardown until its final state is persisted", async () => {
    const streamStarted = _deferred();
    const releaseStream = _deferred();
    const releaseFsWrite = _deferred();
    let streamSignal: AbortSignal | undefined;
    const transport: AgentTransport = async function* (_request, options) {
      streamSignal = options.signal;
      streamStarted.resolve();
      await releaseStream.promise;
      yield* [
        _event({
          type: "message_start",
          message: { role: "assistant" },
        }),
        _event({
          type: "message_update",
          assistantMessageEvent: { type: "text_start", contentIndex: 0 },
        }),
        _event({
          type: "message_update",
          assistantMessageEvent: {
            type: "text_delta",
            contentIndex: 0,
            delta: "Done",
          },
        }),
        _event({
          type: "message_end",
          message: { role: "assistant" },
        }),
      ];
    };
    const store = createThreadStore(
      {
        context: {
          messages: [
            {
              id: "user-1",
              role: "user",
              content: [{ type: "text", text: "Run" }],
            },
          ],
        },
      },
      {
        transport,
        resolveModel: () => ({ provider: "test", id: "test" }),
      }
    );
    const tracker = new RuntimeRunTracker();
    let pendingThread: Thread | null = null;
    let persistedThread: Thread | null = null;
    let fsWriteCalls = 0;
    let settlement: Promise<void> | null = null;
    let ownerMounts = 0;
    let ownerUnmounts = 0;
    const callbacks: ThreadPlaygroundEventCallbacks = {
      onChange: (thread) => {
        pendingThread = thread;
      },
      onStreamingStart: (runId) => {
        tracker.beginRun("local-pane", "local", runId);
      },
      onStreamingEnd: (runId) => {
        settlement = settleStreamingPane(
          async () => {
            const thread = pendingThread;
            pendingThread = null;
            if (thread === null) return;
            fsWriteCalls += 1;
            await releaseFsWrite.promise;
            persistedThread = thread;
          },
          () => tracker.settleRun("local-pane", runId)
        );
      },
    };
    const onMount = () => {
      ownerMounts += 1;
      return () => {
        ownerUnmounts += 1;
      };
    };
    activeRoot = _createRoot();
    await act(async () => {
      activeRoot?.render(
        <_StoreEventBridge
          store={store}
          callbacks={callbacks}
          onMount={onMount}
        />
      );
    });

    const run = store.getState().run();
    await streamStarted.promise;
    let switchCalls = 0;
    let blockedNotices = 0;
    const switchedWhileRunning = switchWorkspaceRuntimeIfAllowed({
      tracker,
      currentRuntimeId: "local",
      nextRuntimeId: "remote:server-1",
      onBlocked: () => {
        blockedNotices += 1;
      },
      onSwitch: () => {
        switchCalls += 1;
      },
    });
    expect(switchedWhileRunning).toBe(false);
    expect({ switchCalls, blockedNotices }).toEqual({
      switchCalls: 0,
      blockedNotices: 1,
    });
    let disconnectCalls = 0;
    let discardCalls = 0;
    const blocked = await runRemoteRuntimeActionIfAllowed({
      allowed: () => tracker.canDisconnect("local"),
      beforeAction: () => {
        discardCalls += 1;
      },
      action: async () => {
        disconnectCalls += 1;
      },
    });
    expect(blocked).toBe(false);
    expect({ disconnectCalls, discardCalls }).toEqual({
      disconnectCalls: 0,
      discardCalls: 0,
    });
    let connectCalls = 0;
    const blockedConnect = await runRemoteRuntimeActionIfAllowed({
      allowed: () => !tracker.hasAnyRunning(),
      action: async () => {
        connectCalls += 1;
      },
    });
    expect(blockedConnect).toBe(false);
    expect(connectCalls).toBe(0);
    expect(streamSignal?.aborted).toBe(false);
    expect({ ownerMounts, ownerUnmounts }).toEqual({
      ownerMounts: 1,
      ownerUnmounts: 0,
    });

    releaseStream.resolve();
    await run;
    expect(tracker.canTransition("local", "remote:server-1")).toBe(false);
    expect(persistedThread).toBeNull();
    expect(fsWriteCalls).toBe(1);

    tracker.beginRun("local-pane", "local", "run-2");
    releaseFsWrite.resolve();
    await settlement;
    const persisted = persistedThread as Thread | null;
    expect(persisted?.context?.messages?.at(-1)).toMatchObject({
      role: "assistant",
      content: [{ type: "text", text: "Done" }],
    });
    expect(persisted?.runHistory).toHaveLength(1);
    expect(tracker.canTransition("local", "remote:server-1")).toBe(false);
    tracker.settleRun("local-pane", "run-2");
    const switchedAfterPersistence = switchWorkspaceRuntimeIfAllowed({
      tracker,
      currentRuntimeId: "local",
      nextRuntimeId: "remote:server-1",
      onBlocked: () => {
        blockedNotices += 1;
      },
      onSwitch: () => {
        switchCalls += 1;
      },
    });
    expect(switchedAfterPersistence).toBe(true);
    expect(switchCalls).toBe(1);
    const disconnected = await runRemoteRuntimeActionIfAllowed({
      allowed: () => tracker.canDisconnect("local"),
      beforeAction: () => {
        discardCalls += 1;
      },
      action: async () => {
        disconnectCalls += 1;
      },
    });
    expect(disconnected).toBe(true);
    expect({ disconnectCalls, discardCalls }).toEqual({
      disconnectCalls: 1,
      discardCalls: 1,
    });
  });

  test("a disk-full terminal save retries the newest revision before releasing its lease", async () => {
    const failedWrite = _deferred();
    const retry = _deferred();
    const persisted: string[] = [];
    const persistence = new SerializedPersistence<string>(
      async (value) => {
        if (value === "A") await failedWrite.promise;
        persisted.push(value);
      },
      { waitBeforeRetry: () => retry.promise }
    );
    const tracker = new RuntimeRunTracker();
    tracker.beginRun("local-pane", "local", "run-1");
    persistence.setPending("A");
    const debounceFlush = persistence.flush();
    await Promise.resolve();
    persistence.setPending("B");
    const terminalSettlement = settleStreamingPane(
      () => persistence.flush(),
      () => tracker.settleRun("local-pane", "run-1")
    );

    failedWrite.reject(new Error("disk full"));
    await Promise.resolve();
    await Promise.resolve();
    expect(tracker.canDisconnect("local")).toBe(false);
    expect(persisted).toEqual([]);

    retry.resolve();
    await Promise.all([debounceFlush, terminalSettlement]);
    expect(persisted).toEqual(["B"]);
    expect(tracker.canDisconnect("local")).toBe(true);
  });
});
