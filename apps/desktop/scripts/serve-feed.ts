/**
 * Static file server for the local update feed — the mise `feed:serve` task.
 * Serves apps/desktop/.dev-feed on :8321, which is the
 * LLM_SPACE_UPDATE_BASE_URL that `pack:feed` builds burn into the bundle.
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const FEED_DIR = join(import.meta.dir, "..", ".dev-feed");
const PORT = 8321;

mkdirSync(FEED_DIR, { recursive: true });

Bun.serve({
  port: PORT,
  async fetch(request) {
    const pathname = decodeURIComponent(new URL(request.url).pathname);
    // ponytail: crude traversal guard — local dev server, loopback only.
    const file = Bun.file(join(FEED_DIR, pathname.replaceAll("..", "")));
    if (!(await file.exists())) {
      return new Response("not found", { status: 404 });
    }
    return new Response(file);
  },
});

console.info(`update feed: http://localhost:${PORT} ← ${FEED_DIR}`);
