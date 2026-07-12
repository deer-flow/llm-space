import { basename } from "node:path";

import { Utils } from "electrobun/bun";

import type { Command, ImportFilePayload } from "../shared/commands";

type SendCommand = (command: Command) => void;

function _normalizeSelectedPaths(paths: string[]): string[] {
  return paths.map((path) => path.trim()).filter(Boolean);
}

async function _readImportFile(path: string): Promise<ImportFilePayload> {
  return {
    name: basename(path),
    text: await Bun.file(path).text(),
  };
}

/**
 * Native import entrypoint for the application menu. The renderer still owns
 * parsing/writing so imports use the same model normalization as drag/drop.
 */
export async function importFilesWithNativePicker(
  sendCommand: SendCommand,
  parent = ""
) {
  const paths = _normalizeSelectedPaths(
    await Utils.openFileDialog({
      startingFolder: Utils.paths.documents,
      allowedFileTypes: "json",
      canChooseFiles: true,
      canChooseDirectory: false,
      allowsMultipleSelection: true,
    })
  );
  if (paths.length === 0) return;

  const files = await Promise.all(paths.map((path) => _readImportFile(path)));
  sendCommand({
    type: "importFiles",
    args: { parent, files },
  });
}

/**
 * Native clipboard import entrypoint. Clipboard access belongs to the bun side;
 * the renderer still owns parsing/writing through the regular file-import path.
 */
export function importTextFromClipboard(sendCommand: SendCommand, parent = "") {
  const text = Utils.clipboardReadText();
  sendCommand({
    type: "importFiles",
    args: {
      parent,
      files: [{ name: "clipboard.json", text: text ?? "" }],
    },
  });
}
