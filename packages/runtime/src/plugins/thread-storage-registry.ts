import type {
  ReadableThreadStorage,
  Thread,
  ThreadLocator,
  ThreadStorageView,
  WritableThreadStorage,
} from "@llm-space/core";

import type { PluginOperationErrorHandler } from "./plugin-command-registry";
import type { PluginSubprocessHost } from "./plugin-subprocess-host";

interface BuiltinEntry {
  view: ThreadStorageView;
  reader?: ReadableThreadStorage;
  writer?: WritableThreadStorage;
}
interface PluginEntry {
  view: ThreadStorageView;
  host: PluginSubprocessHost;
}
type Entry = BuiltinEntry | PluginEntry;

const DEEP_LINK_ID_PATTERN = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/;

export class ThreadStorageRegistry {
  private readonly _entries = new Map<string, Entry>();

  constructor(private readonly _onError?: PluginOperationErrorHandler) {}

  registerBuiltin(input: {
    id: string;
    deepLinkId?: string;
    displayName: string;
    description?: string;
    reader?: ReadableThreadStorage;
    writer?: WritableThreadStorage;
  }): void {
    if (this._entries.has(input.id))
      throw new Error(`Duplicate Thread Storage id: ${input.id}`);
    this._assertDeepLinkId(input.deepLinkId);
    this._entries.set(input.id, {
      view: {
        id: input.id,
        deepLinkId: input.deepLinkId,
        displayName: input.displayName,
        description: input.description,
        capabilities: {
          read: Boolean(input.reader),
          write: Boolean(input.writer),
        },
        source: "builtin",
      },
      reader: input.reader,
      writer: input.writer,
    });
  }

  replacePlugin(
    pluginId: string,
    host: PluginSubprocessHost | undefined,
    storages: Omit<ThreadStorageView, "pluginId" | "source">[]
  ): void {
    const ids = new Set(
      [...this._entries.entries()]
        .filter(([, entry]) => entry.view.pluginId !== pluginId)
        .map(([id]) => id)
    );
    const deepLinkIds = new Set(
      [...this._entries.values()]
        .filter((entry) => entry.view.pluginId !== pluginId)
        .map((entry) => entry.view.deepLinkId)
        .filter((id): id is string => Boolean(id))
    );
    for (const storage of storages) {
      if (ids.has(storage.id))
        throw new Error(`Duplicate Thread Storage id: ${storage.id}`);
      ids.add(storage.id);
      this._assertDeepLinkId(storage.deepLinkId, deepLinkIds);
      if (storage.deepLinkId) deepLinkIds.add(storage.deepLinkId);
    }

    this.removePlugin(pluginId);
    if (!host) return;
    for (const storage of storages)
      this._entries.set(storage.id, {
        view: { ...storage, pluginId, source: "plugin" },
        host,
      });
  }

  removePlugin(pluginId: string): void {
    for (const [id, entry] of this._entries)
      if (entry.view.pluginId === pluginId) this._entries.delete(id);
  }

  list(): ThreadStorageView[] {
    return [...this._entries.values()]
      .map((entry) => structuredClone(entry.view))
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  }

  findByDeepLinkId(deepLinkId: string): ThreadStorageView | undefined {
    const entry = [...this._entries.values()].find(
      (candidate) => candidate.view.deepLinkId === deepLinkId
    );
    return entry ? structuredClone(entry.view) : undefined;
  }

  async resolveLatest(id: string, resourceId: string): Promise<ThreadLocator> {
    const entry = this._readable(id);
    try {
      return "host" in entry
        ? await entry.host.call("storage.resolveLatest", { id, resourceId })
        : await entry.reader!.resolveLatest(resourceId);
    } catch (error) {
      throw this._safeError(entry, "storage-resolve", id, error);
    }
  }

  async read(id: string, locator: ThreadLocator): Promise<Thread> {
    const entry = this._readable(id);
    try {
      return "host" in entry
        ? await entry.host.call("storage.read", { id, locator })
        : await entry.reader!.read(locator);
    } catch (error) {
      throw this._safeError(entry, "storage-read", id, error);
    }
  }

  async write(
    id: string,
    thread: Thread,
    resourceId?: string
  ): Promise<ThreadLocator> {
    const entry = this._writable(id);
    try {
      return "host" in entry
        ? await entry.host.call("storage.write", { id, thread, resourceId })
        : await entry.writer!.write(thread, resourceId);
    } catch (error) {
      throw this._safeError(entry, "storage-write", id, error);
    }
  }

  private _readable(id: string): Entry {
    const entry = this._entries.get(id);
    if (!entry?.view.capabilities.read)
      throw new Error(`Thread Storage is not readable: ${id}`);
    return entry;
  }

  private _writable(id: string): Entry {
    const entry = this._entries.get(id);
    if (!entry?.view.capabilities.write)
      throw new Error(`Thread Storage is not writable: ${id}`);
    return entry;
  }

  private _safeError(
    entry: Entry,
    stage: string,
    id: string,
    error: unknown
  ): Error {
    if (!("host" in entry) || !entry.view.pluginId) {
      return error instanceof Error ? error : new Error(String(error));
    }
    return (
      this._onError?.(
        entry.view.pluginId,
        stage,
        id,
        error,
        entry.host.output
      ) ?? new Error("Plugin Thread Storage failed.")
    );
  }

  private _assertDeepLinkId(
    deepLinkId: string | undefined,
    existing = new Set(
      [...this._entries.values()]
        .map((entry) => entry.view.deepLinkId)
        .filter((id): id is string => Boolean(id))
    )
  ): void {
    if (!deepLinkId) return;
    if (!DEEP_LINK_ID_PATTERN.test(deepLinkId)) {
      throw new Error(`Invalid Thread Storage deep-link id: ${deepLinkId}`);
    }
    if (existing.has(deepLinkId)) {
      throw new Error(`Duplicate Thread Storage deep-link id: ${deepLinkId}`);
    }
  }
}
