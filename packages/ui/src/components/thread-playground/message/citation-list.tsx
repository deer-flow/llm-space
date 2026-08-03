import type { TextContent } from "@llm-space/core";
import { memo, useMemo } from "react";

import { Link } from "@llm-space/ui/components/link";

import { collectCitations } from "./provider-hosted-tool-activity-utils";

function _CitationList({ contents }: { contents: readonly TextContent[] }) {
  const citations = useMemo(() => collectCitations(contents), [contents]);
  if (citations.length === 0) return null;
  return (
    <div className="text-muted-foreground flex flex-wrap gap-2 px-2 pb-2 text-xs">
      {citations.map((citation, index) => (
        <Link
          key={citation.url}
          className="hover:text-foreground underline underline-offset-2"
          href={citation.url}
          title={citation.title}
        >
          [{index + 1}] {citation.title ?? new URL(citation.url).hostname}
        </Link>
      ))}
    </div>
  );
}

export const CitationList = memo(_CitationList);
