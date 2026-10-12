import {
  createRegexHighlightEnhancement,
  type CodeMirrorOnlyEnhancement,
} from "../../code-editor/editor-enhancement";

import {
  createPromptSyntaxEditingExtensions,
  PROMPT_TEMPLATE_TAG_PATTERN,
  PROMPT_TEMPLATE_TAG_STYLE,
  PROMPT_VARIABLE_PATTERN,
  PROMPT_VARIABLE_STYLE,
  type PromptSyntaxEditingOptions,
} from "./prompt-variable-extension";

export const PROMPT_VARIABLE_HIGHLIGHT =
  createRegexHighlightEnhancement({
    id: "prompt-variable-highlight",
    pattern: PROMPT_VARIABLE_PATTERN,
    className: "cm-prompt-variable",
    style: PROMPT_VARIABLE_STYLE,
    priority: 10,
  });

export const PROMPT_TEMPLATE_TAG_HIGHLIGHT =
  createRegexHighlightEnhancement({
    id: "prompt-template-tag-highlight",
    pattern: PROMPT_TEMPLATE_TAG_PATTERN,
    className: "cm-template-tag",
    style: PROMPT_TEMPLATE_TAG_STYLE,
    priority: 20,
  });

export function createPromptSyntaxEditingEnhancement(
  options: PromptSyntaxEditingOptions
): CodeMirrorOnlyEnhancement {
  return {
    kind: "code-mirror-only",
    id: "prompt-syntax-editing",
    extensions: createPromptSyntaxEditingExtensions(options),
  };
}
