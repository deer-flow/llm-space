/* eslint-disable @typescript-eslint/no-empty-function, @typescript-eslint/only-throw-error, @typescript-eslint/require-await, @typescript-eslint/unbound-method */
import { afterEach, describe, expect, test } from "bun:test";

import type { ModelConfig, ModelProviderGroup } from "@llm-space/core";
import { act, startTransition, Suspense, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";

import {
  ModelProvider,
  useDefaultModel,
  useModels,
  useRefreshModels,
  useSetModelEnabled,
} from "@llm-space/ui/components/model-provider";
import type { ModelClient } from "@llm-space/ui/host";

interface Deferred<T> {
  promise: Promise<T>;
  reject(reason?: unknown): void;
  resolve(value: T): void;
}

interface ModelSnapshot {
  defaultModel: ModelConfig | null;
  providerIds: string[];
}

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
  globalThis.window = ORIGINAL_WINDOW;
});

function _deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((next, nextReject) => {
    resolve = next;
    reject = nextReject;
  });
  return { promise, reject, resolve };
}

function _model(
  provider: string,
  id: string
): ModelProviderGroup["models"][number] {
  return {
    provider,
    id,
    name: id,
    api: "openai-completions",
    baseUrl: "https://example.com",
    reasoning: false,
    input: ["text"],
    contextWindow: 128_000,
    maxTokens: 16_384,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  };
}

function _providers(provider: string, modelId: string): ModelProviderGroup[] {
  return [
    {
      id: provider,
      name: provider,
      models: [_model(provider, modelId)],
      profiles: [{ id: `${provider}-default`, name: "Default" }],
    },
  ];
}

function _client(
  availableModels: () => Promise<ModelProviderGroup[]>,
  getDefaultModel: () => Promise<ModelConfig | null>
): ModelClient {
  const unchanged = () => availableModels();
  return {
    availableModels,
    builtinProviders: availableModels,
    getDefaultModel,
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
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  return createRoot(new FakeContainer(fakeDocument) as unknown as Element);
}

function _ModelProbe({
  onMount,
  onSnapshot,
  onUnmount,
}: {
  onMount(): void;
  onSnapshot(snapshot: ModelSnapshot): void;
  onUnmount(): void;
}) {
  const providers = useModels();
  const defaultModel = useDefaultModel();
  onSnapshot({
    defaultModel,
    providerIds: providers.map((provider) => provider.id),
  });
  useEffect(() => {
    onMount();
    return onUnmount;
  }, [onMount, onUnmount]);
  return null;
}

function _RefreshProbe({
  onMount,
  onRefresh,
  onSnapshot,
  onUnmount,
}: {
  onMount(): void;
  onRefresh(refresh: () => Promise<void>): void;
  onSnapshot(snapshot: ModelSnapshot): void;
  onUnmount(): void;
}) {
  const refresh = useRefreshModels();
  useEffect(() => onRefresh(refresh), [onRefresh, refresh]);
  return (
    <_ModelProbe
      onMount={onMount}
      onSnapshot={onSnapshot}
      onUnmount={onUnmount}
    />
  );
}

function _MutationProbe({
  onActions,
  onModelId,
}: {
  onActions(actions: {
    refresh: () => Promise<void>;
    setModelEnabled: (
      providerId: string,
      modelId: string,
      enabled: boolean
    ) => Promise<void>;
  }): void;
  onModelId(modelId: string | null): void;
}) {
  const providers = useModels();
  const refresh = useRefreshModels();
  const setModelEnabled = useSetModelEnabled();
  onModelId(providers[0]?.models[0]?.id ?? null);
  useEffect(
    () => onActions({ refresh, setModelEnabled }),
    [onActions, refresh, setModelEnabled]
  );
  return null;
}

const NEVER = new Promise<never>(() => undefined);

function _SuspendedProbe(): never {
  throw NEVER;
}

describe("ModelProvider runtime switches", () => {
  test("keeps its child mounted without exposing the previous runtime models", async () => {
    const localProviders = _providers("local-provider", "local-model");
    const remoteProviders = _providers("remote-provider", "remote-model");
    const remoteModels = _deferred<ModelProviderGroup[]>();
    const remoteDefault = _deferred<ModelConfig | null>();
    const localClient = _client(
      () => Promise.resolve(localProviders),
      () => Promise.resolve({ provider: "local-provider", id: "local-model" })
    );
    const remoteClient = _client(
      () => remoteModels.promise,
      () => remoteDefault.promise
    );
    const snapshots: ModelSnapshot[] = [];
    let mounts = 0;
    let unmounts = 0;
    const onMount = () => {
      mounts += 1;
    };
    const onUnmount = () => {
      unmounts += 1;
    };
    const onSnapshot = (snapshot: ModelSnapshot) => snapshots.push(snapshot);
    const probe = (
      <_ModelProbe
        onMount={onMount}
        onSnapshot={onSnapshot}
        onUnmount={onUnmount}
      />
    );
    activeRoot = _createRoot();

    await act(async () => {
      activeRoot?.render(
        <ModelProvider client={localClient}>{probe}</ModelProvider>
      );
      await Promise.resolve();
    });
    expect(snapshots.at(-1)).toEqual({
      defaultModel: { provider: "local-provider", id: "local-model" },
      providerIds: ["local-provider"],
    });

    await act(async () => {
      activeRoot?.render(
        <ModelProvider client={remoteClient}>{probe}</ModelProvider>
      );
    });

    expect(snapshots.at(-1)).toEqual({
      defaultModel: null,
      providerIds: [],
    });
    expect({ mounts, unmounts }).toEqual({ mounts: 1, unmounts: 0 });

    await act(async () => {
      remoteModels.resolve(remoteProviders);
      remoteDefault.resolve({
        provider: "remote-provider",
        id: "remote-model",
      });
      await Promise.resolve();
    });
    expect(snapshots.at(-1)).toEqual({
      defaultModel: { provider: "remote-provider", id: "remote-model" },
      providerIds: ["remote-provider"],
    });
    expect({ mounts, unmounts }).toEqual({ mounts: 1, unmounts: 0 });

    await act(async () => {
      activeRoot?.render(
        <ModelProvider client={localClient}>{probe}</ModelProvider>
      );
      await Promise.resolve();
    });
    expect(snapshots.at(-1)).toEqual({
      defaultModel: { provider: "local-provider", id: "local-model" },
      providerIds: ["local-provider"],
    });
    expect({ mounts, unmounts }).toEqual({ mounts: 1, unmounts: 0 });
  });

  test("a discarded client render cannot reject the committed client's response", async () => {
    const initialProviders = _providers("local-provider", "local-model");
    const updatedProviders = _providers("local-provider", "updated-model");
    const pendingModels = _deferred<ModelProviderGroup[]>();
    const pendingDefault = _deferred<ModelConfig | null>();
    let localModels = Promise.resolve(initialProviders);
    let localDefault = Promise.resolve<ModelConfig | null>({
      provider: "local-provider",
      id: "local-model",
    });
    const localClient = _client(
      () => localModels,
      () => localDefault
    );
    const remoteClient = _client(
      () => Promise.resolve(_providers("remote-provider", "remote-model")),
      () => Promise.resolve({ provider: "remote-provider", id: "remote-model" })
    );
    const snapshots: ModelSnapshot[] = [];
    let refresh: (() => Promise<void>) | null = null;
    let mounts = 0;
    let unmounts = 0;
    const onMount = () => {
      mounts += 1;
    };
    const onUnmount = () => {
      unmounts += 1;
    };
    const onRefresh = (next: () => Promise<void>) => {
      refresh = next;
    };
    const onSnapshot = (snapshot: ModelSnapshot) => snapshots.push(snapshot);
    activeRoot = _createRoot();

    await act(async () => {
      activeRoot?.render(
        <Suspense fallback={null}>
          <ModelProvider client={localClient}>
            <_RefreshProbe
              onMount={onMount}
              onRefresh={onRefresh}
              onSnapshot={onSnapshot}
              onUnmount={onUnmount}
            />
          </ModelProvider>
        </Suspense>
      );
      await Promise.resolve();
    });
    expect(snapshots.at(-1)?.providerIds).toEqual(["local-provider"]);

    localModels = pendingModels.promise;
    localDefault = pendingDefault.promise;
    let refreshPromise: Promise<void> | null = null;
    await act(async () => {
      refreshPromise = refresh?.() ?? null;
    });
    await act(async () => {
      startTransition(() => {
        activeRoot?.render(
          <Suspense fallback={null}>
            <ModelProvider client={remoteClient}>
              <_SuspendedProbe />
            </ModelProvider>
          </Suspense>
        );
      });
      await Promise.resolve();
    });

    await act(async () => {
      pendingModels.resolve(updatedProviders);
      pendingDefault.resolve({
        provider: "local-provider",
        id: "updated-model",
      });
      await refreshPromise;
    });

    expect(snapshots.at(-1)).toEqual({
      defaultModel: { provider: "local-provider", id: "updated-model" },
      providerIds: ["local-provider"],
    });
    expect({ mounts, unmounts }).toEqual({ mounts: 1, unmounts: 0 });
  });

  test("an A to B to A switch rejects the first A epoch's late response", async () => {
    const staleModels = _deferred<ModelProviderGroup[]>();
    const staleDefault = _deferred<ModelConfig | null>();
    const currentModels = _deferred<ModelProviderGroup[]>();
    const currentDefault = _deferred<ModelConfig | null>();
    let aCall = 0;
    const aClient = _client(
      () => {
        aCall += 1;
        if (aCall === 1) {
          return Promise.resolve(_providers("a-provider", "a-initial"));
        }
        return aCall === 2 ? staleModels.promise : currentModels.promise;
      },
      () => {
        if (aCall === 1) {
          return Promise.resolve({ provider: "a-provider", id: "a-initial" });
        }
        return aCall === 2 ? staleDefault.promise : currentDefault.promise;
      }
    );
    const bClient = _client(
      () => Promise.resolve(_providers("b-provider", "b-model")),
      () => Promise.resolve({ provider: "b-provider", id: "b-model" })
    );
    const snapshots: ModelSnapshot[] = [];
    let refresh: (() => Promise<void>) | null = null;
    const probe = (
      <_RefreshProbe
        onMount={() => undefined}
        onRefresh={(next) => {
          refresh = next;
        }}
        onSnapshot={(snapshot) => snapshots.push(snapshot)}
        onUnmount={() => undefined}
      />
    );
    activeRoot = _createRoot();

    await act(async () => {
      activeRoot?.render(
        <ModelProvider client={aClient}>{probe}</ModelProvider>
      );
      await Promise.resolve();
    });
    let staleRefresh: Promise<void> | null = null;
    await act(async () => {
      staleRefresh = refresh?.() ?? null;
    });
    await act(async () => {
      activeRoot?.render(
        <ModelProvider client={bClient}>{probe}</ModelProvider>
      );
      await Promise.resolve();
    });
    await act(async () => {
      activeRoot?.render(
        <ModelProvider client={aClient}>{probe}</ModelProvider>
      );
      await Promise.resolve();
    });

    await act(async () => {
      staleModels.resolve(_providers("a-provider", "a-stale"));
      staleDefault.resolve({ provider: "a-provider", id: "a-stale" });
      await staleRefresh;
    });
    expect(snapshots.at(-1)?.providerIds).toEqual([]);

    await act(async () => {
      currentModels.resolve(_providers("a-provider", "a-current"));
      currentDefault.resolve({ provider: "a-provider", id: "a-current" });
      await Promise.resolve();
    });
    expect(snapshots.at(-1)).toEqual({
      defaultModel: { provider: "a-provider", id: "a-current" },
      providerIds: ["a-provider"],
    });
  });

  test("a rapid A to pending B to A switch does not reveal A's old epoch", async () => {
    const nextAModels = _deferred<ModelProviderGroup[]>();
    const nextADefault = _deferred<ModelConfig | null>();
    const pendingBModels = _deferred<ModelProviderGroup[]>();
    const pendingBDefault = _deferred<ModelConfig | null>();
    let aCall = 0;
    const aClient = _client(
      () => {
        aCall += 1;
        return aCall === 1
          ? Promise.resolve(_providers("a-provider", "a-old"))
          : nextAModels.promise;
      },
      () =>
        aCall === 1
          ? Promise.resolve({ provider: "a-provider", id: "a-old" })
          : nextADefault.promise
    );
    const bClient = _client(
      () => pendingBModels.promise,
      () => pendingBDefault.promise
    );
    const snapshots: ModelSnapshot[] = [];
    const probe = (
      <_ModelProbe
        onMount={() => undefined}
        onSnapshot={(snapshot) => snapshots.push(snapshot)}
        onUnmount={() => undefined}
      />
    );
    activeRoot = _createRoot();

    await act(async () => {
      activeRoot?.render(
        <ModelProvider client={aClient}>{probe}</ModelProvider>
      );
      await Promise.resolve();
    });
    expect(snapshots.at(-1)?.defaultModel?.id).toBe("a-old");
    await act(async () => {
      activeRoot?.render(
        <ModelProvider client={bClient}>{probe}</ModelProvider>
      );
    });
    await act(async () => {
      activeRoot?.render(
        <ModelProvider client={aClient}>{probe}</ModelProvider>
      );
      await Promise.resolve();
    });
    await act(async () => {
      // An unrelated parent render after A commits must not make A epoch 1's
      // still-cached snapshot visible while A epoch 3 is loading.
      activeRoot?.render(
        <ModelProvider client={aClient}>{probe}</ModelProvider>
      );
    });

    expect(snapshots.at(-1)).toEqual({
      defaultModel: null,
      providerIds: [],
    });
    await act(async () => {
      nextAModels.resolve(_providers("a-provider", "a-new"));
      nextADefault.resolve({ provider: "a-provider", id: "a-new" });
      await Promise.resolve();
    });
    expect(snapshots.at(-1)?.defaultModel?.id).toBe("a-new");
  });

  test("same-client refreshes only commit the newest request generation", async () => {
    const olderModels = _deferred<ModelProviderGroup[]>();
    const olderDefault = _deferred<ModelConfig | null>();
    const newerModels = _deferred<ModelProviderGroup[]>();
    const newerDefault = _deferred<ModelConfig | null>();
    let call = 0;
    const client = _client(
      () => {
        call += 1;
        if (call === 1) {
          return Promise.resolve(_providers("provider", "initial"));
        }
        return call === 2 ? olderModels.promise : newerModels.promise;
      },
      () => {
        if (call === 1) {
          return Promise.resolve({ provider: "provider", id: "initial" });
        }
        return call === 2 ? olderDefault.promise : newerDefault.promise;
      }
    );
    const snapshots: ModelSnapshot[] = [];
    let refresh: (() => Promise<void>) | null = null;
    activeRoot = _createRoot();
    await act(async () => {
      activeRoot?.render(
        <ModelProvider client={client}>
          <_RefreshProbe
            onMount={() => undefined}
            onRefresh={(next) => {
              refresh = next;
            }}
            onSnapshot={(snapshot) => snapshots.push(snapshot)}
            onUnmount={() => undefined}
          />
        </ModelProvider>
      );
      await Promise.resolve();
    });

    let olderRefresh: Promise<void> | null = null;
    let newerRefresh: Promise<void> | null = null;
    await act(async () => {
      olderRefresh = refresh?.() ?? null;
      newerRefresh = refresh?.() ?? null;
    });
    await act(async () => {
      newerModels.resolve(_providers("provider", "newer"));
      newerDefault.resolve({ provider: "provider", id: "newer" });
      await newerRefresh;
    });
    expect(snapshots.at(-1)?.defaultModel?.id).toBe("newer");

    await act(async () => {
      olderModels.resolve(_providers("provider", "older"));
      olderDefault.resolve({ provider: "provider", id: "older" });
      await olderRefresh;
    });
    expect(snapshots.at(-1)?.defaultModel?.id).toBe("newer");
  });

  test("same-client mutations execute in invocation order and refresh waits behind them", async () => {
    const firstMutation = _deferred<ModelProviderGroup[]>();
    const secondMutation = _deferred<ModelProviderGroup[]>();
    const mutationCalls: boolean[] = [];
    let reads = 0;
    const client = _client(
      () => {
        reads += 1;
        return Promise.resolve(_providers("provider", `read-${reads}`));
      },
      () => Promise.resolve(null)
    );
    client.setModelEnabled = async (_providerId, _modelId, enabled) => {
      mutationCalls.push(enabled);
      return enabled ? secondMutation.promise : firstMutation.promise;
    };
    let actions!: {
      refresh: () => Promise<void>;
      setModelEnabled: (
        providerId: string,
        modelId: string,
        enabled: boolean
      ) => Promise<void>;
    };
    const modelIds: (string | null)[] = [];
    activeRoot = _createRoot();
    await act(async () => {
      activeRoot?.render(
        <ModelProvider client={client}>
          <_MutationProbe
            onActions={(next) => {
              actions = next;
            }}
            onModelId={(modelId) => modelIds.push(modelId)}
          />
        </ModelProvider>
      );
      await Promise.resolve();
    });
    expect(reads).toBe(1);

    let disable: Promise<void> | null = null;
    let enable: Promise<void> | null = null;
    let refresh: Promise<void> | null = null;
    await act(async () => {
      disable = actions.setModelEnabled("provider", "model", false);
      enable = actions.setModelEnabled("provider", "model", true);
      refresh = actions.refresh();
      await Promise.resolve();
    });

    expect(mutationCalls).toEqual([false]);
    expect(reads).toBe(1);
    await act(async () => {
      firstMutation.resolve(_providers("provider", "disabled"));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mutationCalls).toEqual([false, true]);
    expect(reads).toBe(1);

    secondMutation.resolve(_providers("provider", "enabled"));
    await act(async () => {
      await Promise.all([disable, enable, refresh]);
    });

    expect(reads).toBe(2);
    expect(modelIds.at(-1)).toBe("read-2");
  });

  test("A to B to A waits for A's old-epoch mutation before refreshing", async () => {
    const mutationMayLand = _deferred<void>();
    let aModelId = "a-old";
    const aClient = _client(
      () => Promise.resolve(_providers("a-provider", aModelId)),
      () => Promise.resolve(null)
    );
    aClient.setModelEnabled = async () => {
      await mutationMayLand.promise;
      aModelId = "a-after-mutation";
      return _providers("a-provider", aModelId);
    };
    const bClient = _client(
      () => Promise.resolve(_providers("b-provider", "b-model")),
      () => Promise.resolve(null)
    );
    let actions!: {
      refresh: () => Promise<void>;
      setModelEnabled: (
        providerId: string,
        modelId: string,
        enabled: boolean
      ) => Promise<void>;
    };
    const modelIds: (string | null)[] = [];
    const probe = (
      <_MutationProbe
        onActions={(next) => {
          actions = next;
        }}
        onModelId={(modelId) => modelIds.push(modelId)}
      />
    );
    activeRoot = _createRoot();
    await act(async () => {
      activeRoot?.render(
        <ModelProvider client={aClient}>{probe}</ModelProvider>
      );
      await Promise.resolve();
    });
    const oldEpochMutation = actions.setModelEnabled(
      "a-provider",
      "a-model",
      false
    );
    await act(async () => {
      activeRoot?.render(
        <ModelProvider client={bClient}>{probe}</ModelProvider>
      );
      await Promise.resolve();
    });
    await act(async () => {
      activeRoot?.render(
        <ModelProvider client={aClient}>{probe}</ModelProvider>
      );
      await Promise.resolve();
    });
    expect(modelIds.at(-1)).toBeNull();

    mutationMayLand.resolve();
    await act(async () => {
      await oldEpochMutation;
      await Promise.resolve();
    });

    expect(modelIds.at(-1)).toBe("a-after-mutation");
  });

  test("a failed later mutation leaves the last successful backend state visible", async () => {
    const disableResult = _deferred<ModelProviderGroup[]>();
    const enableResult = _deferred<ModelProviderGroup[]>();
    let backendModelId = "enabled";
    const client = _client(
      () => Promise.resolve(_providers("provider", backendModelId)),
      () => Promise.resolve(null)
    );
    client.setModelEnabled = async (_providerId, _modelId, enabled) =>
      enabled ? enableResult.promise : disableResult.promise;
    let actions!: {
      refresh: () => Promise<void>;
      setModelEnabled: (
        providerId: string,
        modelId: string,
        enabled: boolean
      ) => Promise<void>;
    };
    const modelIds: (string | null)[] = [];
    activeRoot = _createRoot();
    await act(async () => {
      activeRoot?.render(
        <ModelProvider client={client}>
          <_MutationProbe
            onActions={(next) => {
              actions = next;
            }}
            onModelId={(modelId) => modelIds.push(modelId)}
          />
        </ModelProvider>
      );
      await Promise.resolve();
    });

    const disable = actions.setModelEnabled("provider", "model", false);
    const enable = actions.setModelEnabled("provider", "model", true);
    backendModelId = "disabled";
    await act(async () => {
      disableResult.resolve(_providers("provider", backendModelId));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    enableResult.reject(new Error("enable failed"));
    await Promise.allSettled([disable, enable]);

    expect(modelIds.at(-1)).toBe("disabled");
  });
});
