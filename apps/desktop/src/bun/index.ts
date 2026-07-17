/* eslint-disable import-x/order -- load order is load-bearing: `./env/hydrate`
   must resolve the real login-shell environment (API keys, PATH) before any
   other module reads `process.env`. GUI launches don't inherit it. */
import "./env/hydrate";
// Attach the deep-link (`open-url`) listener at the earliest possible point so a
// cold-start launch URL isn't dropped before the composition root is ready.
import "./deep-link/launch";
// Seed a fresh workspace (before `./app` pulls in storage/RPC).
import "./workspace/seed";
// Seed the managed skills folder (before `./app` pulls in the SkillsManager).
import "./skills/seed";
/* eslint-enable import-x/order */

// Dynamic import is intentional: environment hydration and seeding must finish
// before the composition root evaluates manager modules and reads configuration.
const { startDesktopApp } = await import("./app");
await startDesktopApp();
