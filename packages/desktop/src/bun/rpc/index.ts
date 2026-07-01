import { ModelProviderGroup } from "@llm-space/core";
import { BrowserView } from "electrobun/bun";

import type { DesktopRPCType } from "../../shared/rpc";
import { moveToTrash, revealInFileManager } from "../fs";
import { modelManager } from "../models";
import { localFs } from "../storage";
import { abortStreamThread, runStreamThread } from "../streaming";

async function getModelProviderGroups() {
  const models = await modelManager.getAvailableModels();
  return Promise.all(
    models.getProviders().map(async (provider) => ({
      id: provider.id,
      name: provider.name,
      models: provider.getModels(),
      apiKey: await modelManager.getApiKey(provider.id, false),
      baseUrl: modelManager.getBaseUrl(provider.id),
      disabledModels: modelManager.getDisabledModels(provider.id),
      websiteLink: modelManager.getWebsiteLink(provider.id),
    }))
  ) as Promise<ModelProviderGroup[]>;
}

/**
 * The handler for `sendStreamThreadRequest` references `mainWindowRPC` inside
 * its own initializer, so an explicit annotation is required — otherwise TS
 * infers `mainWindowRPC` (and everything built from it) as `any`.
 */
type MainWindowRPC = ReturnType<typeof BrowserView.defineRPC<DesktopRPCType>>;

export const mainWindowRPC: MainWindowRPC =
  BrowserView.defineRPC<DesktopRPCType>({
    maxRequestTime: 10_000,
    handlers: {
      requests: {
        availableModels: async () => getModelProviderGroups(),
        removeProvider: async ({ providerId }) => {
          modelManager.removeProvider(providerId);
          return getModelProviderGroups();
        },
        builtinProviders: async () => modelManager.getBuiltinProviders(),
        addProvider: async ({ providerId }) => {
          modelManager.addBuiltInProvider({ id: providerId });
          return getModelProviderGroups();
        },
        updateProvider: async ({ providerId, apiKey, baseUrl }) => {
          modelManager.updateProvider(providerId, { apiKey, baseUrl });
          return getModelProviderGroups();
        },
        setModelEnabled: async ({ providerId, modelId, enabled }) => {
          modelManager.setModelEnabled(providerId, modelId, enabled);
          return getModelProviderGroups();
        },
        setAllModelsEnabled: async ({ providerId, enabled }) => {
          modelManager.setAllModelsEnabled(providerId, enabled);
          return getModelProviderGroups();
        },
        toggleMaximized: async () => {
          const { mainWindow } = await import("../app/window");
          if (mainWindow.isMaximized()) {
            mainWindow.unmaximize();
          } else {
            mainWindow.maximize();
          }
          return { maximized: mainWindow.isMaximized() };
        },
        isFullScreen: async () => {
          const { mainWindow } = await import("../app/window");
          return { fullScreen: mainWindow.isFullScreen() };
        },
        fsLs: ({ path }) => localFs.ls(path),
        fsMkdir: async ({ path }) => {
          await localFs.mkdir(path);
          return null;
        },
        fsCp: async ({ src, dest }) => {
          await localFs.cp(src, dest);
          return null;
        },
        fsMv: async ({ src, dest }) => {
          await localFs.mv(src, dest);
          return null;
        },
        fsRm: async ({ path }) => {
          // Recoverable delete: move to the OS trash rather than `rm`-ing.
          const abs = localFs.realpath(path);
          if (abs === localFs.realpath("")) {
            throw new Error("Cannot delete the workspace root.");
          }
          await moveToTrash(abs);
          return null;
        },
        fsRead: ({ path }) => localFs.read(path),
        fsWrite: async ({ path, thread }) => {
          await localFs.write(path, thread);
          return null;
        },
        fsReveal: async ({ path }) => {
          await revealInFileManager(localFs.realpath(path));
          return null;
        },
      },
      messages: {
        sendStreamThreadRequest: (payload) => {
          // Fire-and-forget: stream events back as `receiveStreamThreadResponse`
          // messages. `mainWindowRPC` is assigned by the time this handler runs.
          void runStreamThread(payload, (message) =>
            mainWindowRPC.send.receiveStreamThreadResponse(message)
          );
        },
        abortStreamThread: (payload) => abortStreamThread(payload),
        executeCommand: async (command) => {
          const { executeCommandInBun } = await import("../commands");
          const { mainWindow } = await import("../app/window");
          executeCommandInBun(command, mainWindow);
        },
      },
    },
  });
