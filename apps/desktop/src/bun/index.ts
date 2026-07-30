import { hydrateShellEnv } from "./env/hydrate";

/**
 * Initialize process state before loading the desktop composition root.
 */
async function _bootstrapDesktopApp(): Promise<void> {
  hydrateShellEnv();

  // Attach the listener immediately after hydration so cold-start deep links
  // are buffered before the longer bootstrap imports evaluate.
  await import("./deep-link/launch");

  const { seedWorkspace } = await import("./workspace/seed");
  seedWorkspace();

  const { seedSkills } = await import("./skills/seed");
  seedSkills();

  const { startDesktopApp } = await import("./app");
  await startDesktopApp();
}

await _bootstrapDesktopApp();
