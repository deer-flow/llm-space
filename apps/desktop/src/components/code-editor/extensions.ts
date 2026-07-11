import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

export function createExtensions(language: "markdown" | "json" | "none") {
  const extensions: Extension[] = [EditorView.lineWrapping];
  switch (language) {
    case "none":
      break;
    case "json":
      extensions.push(json());
      break;
    default:
      extensions.push(
        markdown({
          codeLanguages: languages,
        })
      );
      break;
  }
  return extensions;
}
