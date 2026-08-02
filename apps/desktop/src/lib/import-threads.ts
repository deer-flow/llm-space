import {
  createDefaultThreadParserRegistry,
  type ModelProviderGroup,
} from "@llm-space/core";
import {
  importStemFromFileName,
  joinPath,
  uniqueThreadFileName,
} from "@llm-space/ui/lib/thread-file";

import { createFileSystemClient } from "@/client";
import type { RuntimeId } from "@/shared/runtime";

export interface ThreadImportFile {
  name: string;
  text: string;
}

/**
 * Parse each supported thread file and write the ones that yield a thread into
 * `parent` as new `.json` files, mirroring the "New File" naming/creation.
 * Files that don't parse into a thread are skipped. Returns the created
 * workspace-relative paths and the total number of files processed. The on-disk
 * title is normalized to the file name by the scoped filesystem client, same as
 * New File.
 */
export async function importThreadFileRecords(
  parent: string,
  files: ThreadImportFile[],
  availableModels: readonly ModelProviderGroup[],
  runtimeId?: RuntimeId
): Promise<{
  created: string[];
  total: number;
  recovered: number;
  warnings: string[];
}> {
  const registry = createDefaultThreadParserRegistry();
  const fs = createFileSystemClient(runtimeId);
  // Snapshot the directory once; grow it as we write so a batch import can't
  // collide with itself.
  const existing = new Set((await fs.ls(parent)).map((n) => n.name));
  const created: string[] = [];
  const warnings: string[] = [];
  let recovered = 0;

  for (const file of files) {
    try {
      const result = await registry.parseDetailed(file.name, file.text, {
        availableModels,
      });
      if (result.status !== "parsed") {
        warnings.push(`${file.name}: ${result.message}`);
        continue;
      }
      if (result.recovered) {
        recovered++;
        warnings.push(`${file.name}: recovered from truncated JSON.`);
      }

      const name = uniqueThreadFileName(
        existing,
        importStemFromFileName(file.name)
      );
      existing.add(name);
      const path = joinPath(parent, name);
      await fs.write(path, { ...result.thread, runtimeId });
      created.push(path);
    } catch (error) {
      warnings.push(
        `${file.name}: ${
          error instanceof Error ? error.message : "Import failed."
        }`
      );
    }
  }

  return { created, total: files.length, recovered, warnings };
}

/**
 * Browser File adapter for drag/drop and renderer-side file input imports.
 */
export async function importThreadFiles(
  parent: string,
  files: File[],
  availableModels: readonly ModelProviderGroup[],
  runtimeId?: RuntimeId
): Promise<{
  created: string[];
  total: number;
  recovered: number;
  warnings: string[];
}> {
  const records: ThreadImportFile[] = [];
  for (const file of files) {
    records.push({ name: file.name, text: await file.text() });
  }
  return importThreadFileRecords(parent, records, availableModels, runtimeId);
}
