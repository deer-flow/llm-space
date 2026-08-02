import { getMessageText, type ThreadContext } from "@llm-space/core";
import { renderThreadPromptVariables } from "@llm-space/core/thread";

import type { FilesHost } from "../../../host/types";
import { createRuntimePromptFiles } from "../runtime-prompt-files";
import type { ThreadStore } from "../stores/thread-store";
import { listEnabledPromptVariableSkills } from "../variable/prompt-variable-skills";

/** `{{@include("path")}}` macro with a single quoted path argument. */
const INCLUDE_MACRO_RE = /\{\{\s*@include\(\s*(['"])([\s\S]*?)\1\s*\)\s*\}\}/g;

/**
 * Expand LLM Space's `@include(...)` macro by inlining referenced files so the
 * generated project, which renders with plain Jinja2, does not need it.
 */
async function _expandIncludes(
  text: string,
  readText: (path: string) => Promise<string>,
  depth = 0
): Promise<string> {
  if (depth > 10 || !text.includes("@include")) {
    return text;
  }
  const matches = [...text.matchAll(INCLUDE_MACRO_RE)];
  if (matches.length === 0) {
    return text;
  }
  let out = "";
  let last = 0;
  for (const match of matches) {
    out += text.slice(last, match.index);
    let content: string;
    try {
      content = await readText(match[2]);
    } catch {
      content = "";
    }
    out += await _expandIncludes(content, readText, depth + 1);
    last = (match.index ?? 0) + match[0].length;
  }
  return out + text.slice(last);
}

async function _prepareGenerateProjectPromptContext({
  context,
  files,
  runtimeId,
  skillList,
  useMetaUserPrompt,
}: {
  context: ThreadContext;
  files: FilesHost;
  runtimeId: string;
  skillList: Awaited<ReturnType<typeof listEnabledPromptVariableSkills>>;
  useMetaUserPrompt: boolean;
}) {
  const promptFiles = createRuntimePromptFiles(files, runtimeId);
  const rendered = await renderThreadPromptVariables({
    context,
    loadSkills: () => Promise.resolve(skillList),
    loadFile: promptFiles.loadFile,
    fileExists: promptFiles.fileExists,
  });
  const systemPromptTemplate = await _expandIncludes(
    context.systemPrompt ?? "",
    promptFiles.loadFile
  );
  const firstMessage = context.messages?.[0];
  const firstUserMessageTemplate =
    useMetaUserPrompt && firstMessage?.role === "user"
      ? await _expandIncludes(getMessageText(firstMessage), promptFiles.loadFile)
      : undefined;
  const renderedVariableValues: Record<string, string> = Object.fromEntries(
    rendered.variables.map((variable) => [variable.name, variable.value])
  );

  return {
    rendered,
    systemPromptTemplate,
    firstUserMessageTemplate,
    renderedVariableValues,
  };
}

/** Bind Generate Project prompt reads directly to one owning thread store. */
export function createGenerateProjectPromptPreparer({
  files,
  store,
}: {
  files: FilesHost;
  store: ThreadStore;
}) {
  return ({
    skillList,
    useMetaUserPrompt,
  }: {
    skillList: Awaited<ReturnType<typeof listEnabledPromptVariableSkills>>;
    useMetaUserPrompt: boolean;
  }) => {
    const { runtimeId, thread } = store.getState();
    if (!runtimeId) {
      throw new Error("Generate Project requires an owning runtimeId");
    }
    return _prepareGenerateProjectPromptContext({
      context: thread.context ?? {},
      files,
      runtimeId,
      skillList,
      useMetaUserPrompt,
    });
  };
}
