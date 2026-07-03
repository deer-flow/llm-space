import { basename } from "node:path";

import { Utils } from "electrobun/bun";

import type { ImportFilePayload } from "../shared/commands";

import { mainWindowRPC } from "./rpc";

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
export async function importFilesWithNativePicker(parent = "") {
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
  mainWindowRPC.send.executeCommand({
    type: "importFiles",
    args: { parent, files },
  });
}
