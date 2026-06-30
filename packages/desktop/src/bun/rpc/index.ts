import { BrowserView } from "electrobun/bun";

import type { DesktopRPCType } from "../../shared/rpc";
import { moveToTrash, revealInFileManager } from "../fs";
import { modelManager } from "../models";
import { localFs } from "../storage";
import { abortStreamThread, runStreamThread } from "../streaming";

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
        availableModels: async () => {
          const models = await modelManager.getAvailableModels();
          return models.getProviders().map((provider) => ({
            id: provider.id,
            name: provider.name,
            models: provider.getModels(),
          }));
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
      },
    },
  });
