/* eslint-disable @typescript-eslint/await-thenable, @typescript-eslint/no-empty-function, @typescript-eslint/require-await, @typescript-eslint/unbound-method */
import { afterEach, describe, expect, test } from "bun:test";

import type { AgentEvent, AgentTransport, Thread } from "@llm-space/core";
import type { ModelClient } from "@llm-space/ui/host";
import { act, useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";

import { runRemoteRuntimeActionIfAllowed } from "@/components/remote-runtime-actions";
import { RuntimePaneHost } from "@/components/thread-tabs/runtime-pane-host";
import {
  RuntimeRunTracker,
  settleStreamingPane,
} from "@/components/thread-tabs/runtime-run-tracker";
import { switchWorkspaceRuntimeIfAllowed } from "@/components/thread-tabs/runtime-workspace-transition";
import type { RuntimeId } from "@/shared/runtime";

import {
  createThreadStore,
  type ThreadStore,
} from "../../../../packages/ui/src/components/thread-playground/stores";
import {
  useThreadPlaygroundEvents,
  type ThreadPlaygroundEventCallbacks,
} from "../../../../packages/ui/src/components/thread-playground/use-thread-playground-events";

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
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

function _event(value: unknown): AgentEvent {
  return value as AgentEvent;
}

function MountProbe({
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

function StorePane({
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

function StoreEventBridge({
  store,
  callbacks,
  onMount,
}: {
  store: ThreadStore;
  callbacks: ThreadPlaygroundEventCallbacks;
  onMount(): () => void;
}) {
  useThreadPlaygroundEvents(store, callbacks);
  useEffect(onMount, [onMount]);
  return null;
}

describe("WorkspaceModelScope", () => {
  test("runtime changes preserve the mounted workspace identity", async () => {
    const clients = new Map<RuntimeId, ModelClient>([
      ["local", _client()],
      ["remote:server-1", _client()],
    ]);
    const createClient = (runtimeId: RuntimeId) => {
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
    const probe = <MountProbe onMount={onMount} onUnmount={onUnmount} />;
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
  });
});

describe("RuntimePaneHost", () => {
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
        renderPane={(pane) => <StorePane pane={pane} onMount={onMount} />}
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
      onStreamingStart: () => {
        tracker.setRunning("local-pane", "local", true);
      },
      onStreamingEnd: () => {
        settlement = settleStreamingPane(
          async () => {
            const thread = pendingThread;
            pendingThread = null;
            if (thread === null) return;
            fsWriteCalls += 1;
            await releaseFsWrite.promise;
            persistedThread = thread;
          },
          () => tracker.setRunning("local-pane", "local", false)
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
        <StoreEventBridge
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

    releaseFsWrite.resolve();
    await settlement;
    const persisted = persistedThread as Thread | null;
    expect(persisted?.context?.messages?.at(-1)).toMatchObject({
      role: "assistant",
      content: [{ type: "text", text: "Done" }],
    });
    expect(persisted?.runHistory).toHaveLength(1);
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
});
