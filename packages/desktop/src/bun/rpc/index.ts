import { BrowserView } from "electrobun/bun";

import type { DesktopRPCType } from "../../shared/rpc";
import { getAvailableModelGroups } from "../models";
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
        availableModels: () => getAvailableModelGroups(),
        toggleMaximized: async () => {
          const { mainWindow } = await import("../app/window");
          if (mainWindow.isMaximized()) {
            mainWindow.unmaximize();
          } else {
            mainWindow.maximize();
          }
          return { maximized: mainWindow.isMaximized() };
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
