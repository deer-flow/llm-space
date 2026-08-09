const DOCS_BASE_URL =
  "https://github.com/deer-flow/llm-space/blob/main/docs";

export type DocsPage =
  | "compaction"
  | "generating-projects"
  | "sharing"
  | "variables-and-templates";

/** Return the localized GitHub URL for one user-guide page. */
export function docsUrl(page: DocsPage): string {
  const locale =
    typeof navigator === "undefined"
      ? ""
      : (navigator.languages[0] ?? navigator.language).toLowerCase();
  const suffix = locale.startsWith("zh") ? ".zh-CN" : "";
  return `${DOCS_BASE_URL}/${page}${suffix}.md`;
}
