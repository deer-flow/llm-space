/**
 * Cut a release: preflight checks → commit-and-tag-version (bump the version in
 * apps/desktop/package.json, commit, tag) → push. The tag push triggers the
 * release workflow; the `-canary` suffix selects the channel.
 *
 * Usage:
 *   mise run release                          # stable (graduates a prerelease)
 *   mise run release:canary                   # next canary prerelease
 *   mise run release -- --release-as 0.2.0    # force an exact version
 *   mise run release -- --dry-run             # preview without touching anything
 */
import { $ } from "bun";

const args = process.argv.slice(2);
const isDryRun = args.includes("--dry-run");

function fail(message: string): never {
  console.error(`✖ ${message}`);
  process.exit(1);
}

const branch = (await $`git rev-parse --abbrev-ref HEAD`.text()).trim();
if (branch !== "main") fail(`releases are cut from main (current: ${branch})`);

const dirty = (await $`git status --porcelain`.text()).trim();
if (dirty) fail("working tree is dirty — commit or stash first");

await $`git fetch origin main --tags`;
const local = (await $`git rev-parse HEAD`.text()).trim();
const remote = (await $`git rev-parse origin/main`.text()).trim();
if (local !== remote) fail("main is not in sync with origin/main — pull first");

await $`bunx commit-and-tag-version ${args}`;

if (isDryRun) process.exit(0);

// --atomic: all-or-nothing — if main is rejected (e.g. someone pushed in the
// meantime), the tag must not land alone and trigger a release off an orphan.
await $`git push --atomic --follow-tags origin main`;

const { version } = (await Bun.file("apps/desktop/package.json").json()) as {
  version: string;
};
console.info(
  `\n✔ v${version} pushed — release CI: https://github.com/deer-flow/llm-space/actions`
);
