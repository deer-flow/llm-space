/// <reference types="vite/client" />

// Bun-side `with { type: "text" }` markdown imports reachable through the shared
// package; typed here so the web app's tsc resolves them too.
declare module "*.md" {
  const content: string;
  export default content;
}
