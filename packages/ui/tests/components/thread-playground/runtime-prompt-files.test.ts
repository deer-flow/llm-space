import { describe, expect, test } from "bun:test";

import { renderThreadPromptVariables } from "@llm-space/core/thread";
import type { ThreadContext } from "@llm-space/core/types";

import { createRuntimePromptFiles } from "../../../src/components/thread-playground/runtime-prompt-files";
import type { FilesHost } from "../../../src/host/types";

describe("runtime prompt files", () => {
  test("requires explicit ownership instead of falling through to a default", () => {
    const files = {
      readText: () => Promise.resolve("LOCAL LEAK"),
      exists: () => Promise.resolve(true),
      directoryExists: () => Promise.resolve(null),
      pickFile: () => Promise.resolve(null),
      pickDirectory: () => Promise.resolve(null),
    } satisfies FilesHost;

    expect(() =>
      createRuntimePromptFiles(files, undefined as unknown as string)
    ).toThrow("runtimeId");
  });

  test("resolves includes, exists, file variables, and AGENTS.md only on the owning runtime", async () => {
    const localFiles: Record<string, string> = {
      "/workspace/AGENTS.md": "LOCAL AGENTS",
      "/workspace/nested.md": "LOCAL NESTED",
      "/workspace/local-only.md": "LOCAL LEAK",
      "/workspace/unreadable.md": "LOCAL UNREADABLE LEAK",
      "~/note.md": "LOCAL HOME",
    };
    const remoteFiles: Record<string, string> = {
      "/workspace/AGENTS.md":
        'REMOTE AGENTS {{@include("/workspace/nested.md")}}',
      "/workspace/nested.md": "REMOTE NESTED",
      "/workspace/remote-only.md": "REMOTE FILE VARIABLE",
      "~/note.md": "REMOTE HOME",
    };
    const accesses: {
      operation: "read" | "exists";
      path: string;
      runtimeId?: string;
    }[] = [];
    const files = {
      readText: (
        path: string,
        options?: { runtimeId?: string }
      ): Promise<string> => {
        accesses.push({ operation: "read", path, runtimeId: options?.runtimeId });
        const source =
          options?.runtimeId === "remote:test" ? remoteFiles : localFiles;
        return Promise.resolve(source[path] ?? "");
      },
      exists: (
        path: string,
        options?: { runtimeId?: string }
      ): Promise<boolean> => {
        accesses.push({
          operation: "exists",
          path,
          runtimeId: options?.runtimeId,
        });
        const source =
          options?.runtimeId === "remote:test" ? remoteFiles : localFiles;
        return Promise.resolve(Object.hasOwn(source, path));
      },
      directoryExists: () => Promise.resolve(null),
      pickFile: () => Promise.resolve(null),
      pickDirectory: () => Promise.resolve(null),
    } satisfies FilesHost;
    const promptFiles = createRuntimePromptFiles(files, "remote:test");
    const context: ThreadContext = {
      systemPrompt: `
{% set agents_path = current_working_directory ~ "/AGENTS.md" %}
{% if exists(agents_path) %}{{@include((agents_path))}}{% endif %}
|{{ doc }}
|{{@include("~/note.md")}}
|{{@include("/workspace/local-only.md")}}
|{% if exists("/workspace/unreadable.md") %}LEAK{% else %}SAFE{% endif %}`,
      variables: {
        current_working_directory: {
          type: "workingDirectory",
          value: "/workspace",
        },
        doc: { type: "file", value: "/workspace/remote-only.md" },
      },
    };

    const rendered = await renderThreadPromptVariables({
      context,
      loadFile: promptFiles.loadFile,
      fileExists: promptFiles.fileExists,
    });

    expect((rendered.context.systemPrompt ?? "").replace(/\s+/g, " ").trim()).toBe(
      "REMOTE AGENTS REMOTE NESTED |REMOTE FILE VARIABLE |REMOTE HOME | |SAFE"
    );
    expect(accesses.length).toBeGreaterThan(0);
    expect(accesses.every(({ runtimeId }) => runtimeId === "remote:test")).toBe(
      true
    );
    expect(accesses).toContainEqual({
      operation: "read",
      path: "~/note.md",
      runtimeId: "remote:test",
    });
  });
});
