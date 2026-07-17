// Asset imports handled by the consuming app's bundler (Vite). Declared here so
// the package typechecks standalone without depending on `vite/client`.
declare module "*?raw" {
  const src: string;
  export default src;
}
declare module "*.md" {
  const content: string;
  export default content;
}
