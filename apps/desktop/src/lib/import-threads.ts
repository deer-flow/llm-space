import {
  createDefaultThreadParserRegistry,
  type ModelProviderGroup,
} from "@llm-space/core";
import {
  importStemFromFileName,
  joinPath,
  uniqueThreadFileName,
} from "@llm-space/ui/lib/thread-file";

import { localFs } from "@/client";


export interface ThreadImportFile {
  name: string;
  text: string;
}

/**
 * Parse each file payload (OpenAI ChatCompletion / Anthropic Messages / native thread
 * JSON) and write the ones that yield a thread into `parent` as new `.json`
 * files, mirroring the "New File" naming/creation. Files that don't parse into
 * a thread are skipped. Returns the created workspace-relative paths and the
 * total number of files processed. The on-disk title is normalized to the file
 * name by `localFs.write`, same as New File.
 */
export async function importThreadFileRecords(
  parent: string,
  files: ThreadImportFile[],
  availableModels: readonly ModelProviderGroup[]
): Promise<{ created: string[]; total: number }> {
  const registry = createDefaultThreadParserRegistry();
  // Snapshot the directory once; grow it as we write so a batch import can't
  // collide with itself.
  const existing = new Set((await localFs.ls(parent)).map((n) => n.name));
  const created: string[] = [];

  for (const file of files) {
    const thread = await registry.parse(file.name, file.text, { availableModels });
    if (!thread) continue;

    const name = uniqueThreadFileName(existing, importStemFromFileName(file.name));
    existing.add(name);
    const path = joinPath(parent, name);
    await localFs.write(path, thread);
    created.push(path);
  }

  return { created, total: files.length };
}

/**
 * Browser File adapter for drag/drop and renderer-side file input imports.
 */
export async function importThreadFiles(
  parent: string,
  files: File[],
  availableModels: readonly ModelProviderGroup[]
): Promise<{ created: string[]; total: number }> {
  const records: ThreadImportFile[] = [];
  for (const file of files) {
    records.push({ name: file.name, text: await file.text() });
  }
  return importThreadFileRecords(parent, records, availableModels);
}
