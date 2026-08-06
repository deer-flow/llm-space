import { type Extension } from "@codemirror/state";
import { Decoration, EditorView } from "@codemirror/view";
import type { TextContent } from "@llm-space/core";
import { useMemo } from "react";

import { useHostServices } from "@llm-space/ui/host";

import { normalizeCitationRanges } from "./text-citation-utils";

export function useTextCitationExtension(
  contents: readonly TextContent[]
): Extension[] {
  const { actions } = useHostServices();
  return useMemo(() => {
    const ranges = normalizeCitationRanges(contents);
    if (ranges.length === 0) return [];
    const decorations = Decoration.set(
      ranges.map((range) =>
        Decoration.mark({
          class:
            "text-primary cursor-pointer underline decoration-dotted underline-offset-2",
          attributes: {
            "data-native-citation-url": range.url,
            ...(range.title ? { title: range.title } : {}),
          },
        }).range(range.from, range.to)
      ),
      true
    );
    return [
      EditorView.decorations.of(decorations),
      EditorView.domEventHandlers({
        click(event) {
          const element =
            event.target instanceof Element
              ? event.target.closest<HTMLElement>(
                  "[data-native-citation-url]"
                )
              : null;
          const url = element?.dataset.nativeCitationUrl;
          if (!url) return false;
          event.preventDefault();
          actions.openLink(url);
          return true;
        },
      }),
    ];
  }, [actions, contents]);
}
