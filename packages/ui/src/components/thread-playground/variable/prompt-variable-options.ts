import type {
  PromptDateVariableFormat,
  PromptSkillsVariableFormat,
} from "@llm-space/core/thread";

interface PromptVariableFormatOption<T extends string> {
  value: T;
  label: string;
}

export const PROMPT_DATE_FORMATS: readonly PromptVariableFormatOption<PromptDateVariableFormat>[] =
  [
    { value: "readable-date", label: "Readable date" },
    { value: "iso-date", label: "ISO date" },
    { value: "local-date-time", label: "Local date and time" },
  ];

export const PROMPT_SKILLS_FORMATS: readonly PromptVariableFormatOption<PromptSkillsVariableFormat>[] =
  [
    { value: "xml", label: "XML" },
    { value: "markdown-list", label: "Markdown list" },
  ];

export const PROMPT_SKILLS_INDENTS = [0, 2, 4] as const;
