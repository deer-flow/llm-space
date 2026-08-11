import type {
  JsonObject,
  JsonValue,
  BuiltinToolCallResponse,
  PluginCommandExecutionResult,
  PluginCommandView,
  PluginView,
  PluginTool,
  Thread,
  ThreadLocator,
  ThreadStorageView,
} from "@llm-space/core";

import { electrobun } from "@/lib/electrobun";
import type { RuntimeId } from "@/shared/runtime";

function _rpc() {
  if (!electrobun.rpc) throw new Error("Electrobun RPC is not initialized");
  return electrobun.rpc;
}

const MAX_PLUGIN_ZIP_BYTES = 50 * 1024 * 1024;

/** The mounted pane snapshot captured when a Plugin Command starts. */
export interface PluginActiveTab {
  tabId: string;
  paneId: string;
  path: string;
  filename: string;
  runtimeId: RuntimeId;
  thread: Thread;
}

export const listPlugins = (): Promise<PluginView[]> =>
  _rpc().request.pluginsList({});

export const refreshPlugins = (): Promise<PluginView[]> =>
  _rpc().request.pluginsRefresh({});

export const installPluginZip = (
  fileName: string,
  dataBase64: string
): Promise<{
  pluginId: string;
  version: string;
  path: string;
  plugins: PluginView[];
}> =>
  _rpc().request.pluginsInstallZip({ fileName, dataBase64 });

export function isPluginZipFile(file: Pick<File, "name">): boolean {
  return file.name.toLowerCase().endsWith(".zip");
}

export async function installPluginFile(
  file: File
): Promise<{
  pluginId: string;
  version: string;
  path: string;
  plugins: PluginView[];
}> {
  if (!isPluginZipFile(file)) {
    throw new Error("Only .zip plugin packages can be installed.");
  }
  if (file.size > MAX_PLUGIN_ZIP_BYTES) {
    throw new Error("The plugin ZIP exceeds the 50 MB size limit.");
  }
  return installPluginZip(file.name, await _readFileAsBase64(file));
}

export const reloadPlugin = (pluginId: string): Promise<PluginView[]> =>
  _rpc().request.pluginsReload({ pluginId });

export const uninstallPlugin = (pluginId: string): Promise<PluginView[]> =>
  _rpc().request.pluginsUninstall({ pluginId });

export const setPluginEnabled = (
  pluginId: string,
  enabled: boolean
): Promise<PluginView[]> =>
  _rpc().request.pluginsSetEnabled({ pluginId, enabled });

export const setPluginSettings = (
  pluginId: string,
  settings: JsonObject
): Promise<PluginView[]> =>
  _rpc().request.pluginsSetSettings({ pluginId, settings });

export const listPluginCommands = (): Promise<PluginCommandView[]> =>
  _rpc().request.pluginCommandsList({});

export const executePluginCommand = (
  executionId: string,
  commandId: string,
  activeTab: Pick<PluginActiveTab, "filename" | "thread"> | null,
  args: string[]
): Promise<PluginCommandExecutionResult> =>
  _rpc().request.pluginCommandExecute({
    executionId,
    commandId,
    activeTab,
    arguments: args,
  });

export const listPluginTools = (): Promise<PluginTool[]> =>
  _rpc().request.pluginToolsList({});

export const executePluginTool = (
  tool: PluginTool,
  thread: Thread,
  variables: Record<string, JsonValue>,
  args: Record<string, unknown>
): Promise<BuiltinToolCallResponse> =>
  _rpc().request.pluginToolExecute({
    tool,
    thread,
    variables,
    arguments: args,
  });

export const listThreadStorages = (): Promise<ThreadStorageView[]> =>
  _rpc().request.threadStoragesList({});

export const resolveLatestThreadStorage = (
  storageId: string,
  resourceId: string
): Promise<ThreadLocator> =>
  _rpc().request.threadStorageResolveLatest({ storageId, resourceId });

export const readThreadStorage = (
  storageId: string,
  locator: ThreadLocator
): Promise<Thread> => _rpc().request.threadStorageRead({ storageId, locator });

export const writeThreadStorage = (
  storageId: string,
  thread: Thread,
  resourceId?: string
): Promise<ThreadLocator> =>
  _rpc().request.threadStorageWrite({ storageId, thread, resourceId });

function _readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("Read failed."));
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error(`Could not read ${file.name}.`));
        return;
      }
      const separator = result.indexOf(",");
      if (separator < 0) {
        reject(new Error(`Could not read ${file.name}.`));
        return;
      }
      resolve(result.slice(separator + 1));
    };
    reader.readAsDataURL(file);
  });
}
