import type {
  PluginThreadStorage,
  Thread,
  ThreadLocator,
  ThreadStorageContext,
} from "@llm-space/core";

export default class WorkspaceLibraryStorage
  implements PluginThreadStorage
{
  displayName = "Atlas Workspace Library";
  description = "Read and write versionless Thread JSON files in the workspace.";
  deepLinkId = "atlas-library";
  capabilities = { read: true, write: true };

  async resolveLatest(
    id: string,
    context: ThreadStorageContext
  ): Promise<ThreadLocator> {
    const resourceId = _resourceId(id);
    const filename = `${resourceId}.json`;
    await context.readWorkspaceFile(_storagePath(context, filename));
    return { id: resourceId, filename };
  }

  async read(
    locator: ThreadLocator,
    context: ThreadStorageContext
  ): Promise<Thread> {
    const filename = locator.filename ?? `${_resourceId(locator.id)}.json`;
    const content = await context.readWorkspaceFile(
      _storagePath(context, filename)
    );
    const value: unknown = JSON.parse(content);
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("Stored content is not a Thread object.");
    }
    return value;
  }

  async write(
    thread: Thread,
    id: string | undefined,
    context: ThreadStorageContext
  ): Promise<ThreadLocator> {
    const resourceId = _resourceId(id ?? crypto.randomUUID());
    const filename = `${resourceId}.json`;
    await context.writeWorkspaceFile(
      _storagePath(context, filename),
      `${JSON.stringify(thread, null, 2)}\n`
    );
    return { id: resourceId, filename };
  }
}

function _storagePath(
  context: ThreadStorageContext,
  filename: string
): string {
  const configuredDirectory = context.settings.notesDirectory;
  const directory = (typeof configuredDirectory === "string"
    ? configuredDirectory
    : "atlas")
    .replace(/\\/g, "/")
    .replace(/^\/+|\/+$/g, "");
  if (!directory || directory.split("/").includes("..")) {
    throw new Error("notesDirectory must be workspace-relative.");
  }
  return `${directory}/thread-library/${_resourceId(filename)}.json`;
}

function _resourceId(value: string): string {
  const resource = value.split(/[?#]/, 1)[0] ?? "";
  const normalized = resource
    .replace(/\.json$/i, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);
  if (!normalized) throw new Error("A non-empty Thread resource ID is required.");
  return normalized;
}
