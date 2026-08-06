import type { TextContent } from "@llm-space/core";

import { normalizeSafeUrl } from "./provider-hosted-tool-activity-utils";

export interface CitationRange {
  from: number;
  to: number;
  url: string;
  title?: string;
}

export function normalizeCitationRanges(
  contents: readonly TextContent[]
): CitationRange[] {
  const candidates: CitationRange[] = [];
  let blockOffset = 0;
  for (const content of contents) {
    for (const annotation of content.annotations ?? []) {
      const { startIndex, endIndex } = annotation;
      const url = normalizeSafeUrl(annotation.url);
      if (
        !url ||
        !Number.isInteger(startIndex) ||
        !Number.isInteger(endIndex) ||
        startIndex === undefined ||
        endIndex === undefined ||
        startIndex < 0 ||
        endIndex <= startIndex ||
        endIndex > content.text.length
      ) {
        continue;
      }
      candidates.push({
        from: blockOffset + startIndex,
        to: blockOffset + endIndex,
        url,
        ...(annotation.title ? { title: annotation.title } : {}),
      });
    }
    blockOffset += content.text.length + 1;
  }
  candidates.sort((left, right) => left.from - right.from || left.to - right.to);
  const result: CitationRange[] = [];
  for (const candidate of candidates) {
    if (result.length > 0 && candidate.from < result[result.length - 1].to) {
      continue;
    }
    result.push(candidate);
  }
  return result;
}
