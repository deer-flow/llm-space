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
} from "@llm-space/ui/components/model-provider";
import type { ModelClient } from "@llm-space/ui/host";

interface Deferred<T> {
  promise: Promise<T>;
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
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
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

function ModelProbe({
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

function RefreshProbe({
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
    <ModelProbe
      onMount={onMount}
      onSnapshot={onSnapshot}
      onUnmount={onUnmount}
    />
  );
}

const NEVER = new Promise<never>(() => undefined);

function SuspendedProbe(): never {
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
      <ModelProbe
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
            <RefreshProbe
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
              <SuspendedProbe />
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
});
