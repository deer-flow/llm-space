/* eslint-disable import-x/order -- load order is load-bearing: `./env/hydrate`
   must resolve the real login-shell environment (API keys, PATH) before any
   other module reads `process.env`. GUI launches don't inherit it. */
import "./env/hydrate";
// Seed a fresh workspace (before `./app` pulls in storage/RPC).
import "./workspace/seed";
// Seed the managed skills folder (before `./app` pulls in the SkillsManager).
import "./skills/seed";
import "./app";
import { app } from "electrobun/bun";
import { analytics } from "./analytics";
/* eslint-enable import-x/order */

// Anonymous launch signal. See `shared/analytics.ts` for the privacy contract.
analytics.capture("app_opened", { isFirstOpen: analytics.isFirstRun });

// Best-effort flush on the real quit path: GUI quits (Cmd+Q, window close) run
// through Electrobun's `quit()`, which emits `before-quit` - and Electrobun's
// own SIGINT/SIGTERM handlers call `quit()` too, so this hook covers them all.
// (Node-style `beforeExit` would never fire here: the PostHog flush-interval
// timer keeps the event loop alive.)
app.on("before-quit", () => {
  void analytics.shutdown();
});
