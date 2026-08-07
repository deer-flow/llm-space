import type {
  PluginThreadStorage,
  Thread,
  ThreadLocator,
} from "@llm-space/core";

export default class MemoryShelfStorage implements PluginThreadStorage {
  displayName = "Atlas Memory Shelf";
  description = "Keep temporary Thread copies for the lifetime of the Plugin process.";
  deepLinkId = "atlas-memory";
  capabilities = { read: true, write: true };

  private readonly _threads = new Map<string, Thread>();

  resolveLatest(id: string): Promise<ThreadLocator> {
    const resourceId = _resourceId(id);
    if (!this._threads.has(resourceId)) {
      throw new Error(`No in-memory Thread exists for ${resourceId}.`);
    }
    return Promise.resolve({ id: resourceId, filename: `${resourceId}.json` });
  }

  read(locator: ThreadLocator): Promise<Thread> {
    const resourceId = _resourceId(locator.id);
    const thread = this._threads.get(resourceId);
    if (!thread) throw new Error(`No in-memory Thread exists for ${resourceId}.`);
    return Promise.resolve(structuredClone(thread));
  }

  write(thread: Thread, id?: string): Promise<ThreadLocator> {
    const resourceId = _resourceId(id ?? crypto.randomUUID());
    this._threads.set(resourceId, structuredClone(thread));
    return Promise.resolve({
      id: resourceId,
      filename: `${resourceId}.json`,
    });
  }

  dispose() {
    this._threads.clear();
  }
}

function _resourceId(value: string): string {
  const resource = value.split(/[?#]/, 1)[0] ?? "";
  const normalized = resource
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);
  if (!normalized) throw new Error("A non-empty Thread resource ID is required.");
  return normalized;
}
