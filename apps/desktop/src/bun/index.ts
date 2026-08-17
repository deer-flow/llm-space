import { hydrateShellEnv } from "./env/hydrate";

/**
 * Initialize process state before loading the desktop composition root.
 */
async function _bootstrapDesktopApp(): Promise<void> {
  hydrateShellEnv();

  // Start the launcher inbox + Electrobun listener immediately after hydration
  // so cold- and warm-start deep links survive the longer bootstrap imports.
  await import("./deep-link/launch");

  const { seedWorkspace } = await import("./workspace/seed");
  seedWorkspace();

  const { seedSkills } = await import("./skills/seed");
  seedSkills();

  const { startDesktopApp } = await import("./app");
  await startDesktopApp();
}

await _bootstrapDesktopApp();
