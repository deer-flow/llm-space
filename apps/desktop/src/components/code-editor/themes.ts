import { basicLightInit } from "@uiw/codemirror-theme-basic";
import { monokaiInit } from "@uiw/codemirror-theme-monokai";

export const dark = monokaiInit({
  settings: {
    background: "var(--textarea)",
    gutterBackground: "transparent",
    gutterForeground: "#555",
    gutterActiveForeground: "#FFF",
    fontSize: "var(--text-sm)",
  },
});

export const light = basicLightInit({
  settings: {
    // Match the editor surface to the container (--textarea); basicLight's
    // default is a plain white that clashes with the app's light-gray fields.
    background: "var(--textarea)",
    gutterBackground: "transparent",
    fontSize: "var(--text-sm)",
  },
});
