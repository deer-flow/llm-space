const SKILL_LOCATOR_PREFIX = "llm-space://internal/skills/";
const SKILL_NAME_PATTERN = /^(?!-)(?!.*--)[a-z0-9-]{1,64}(?<!-)$/;

/**
 * Format a skill name as an internal LLM Space resource locator.
 *
 * The name follows the Agent Skills naming rules so locators cannot smuggle
 * extra path segments or URL syntax into the RPC path parameter.
 */
export function formatSkillLocator(name: string): string {
  if (!SKILL_NAME_PATTERN.test(name)) {
    throw new Error(`Invalid skill name: ${name}`);
  }
  return `${SKILL_LOCATOR_PREFIX}${encodeURIComponent(name)}`;
}

/**
 * Parse an internal skill locator, returning the decoded skill name.
 *
 * Returns `null` for anything outside the exact
 * `llm-space://internal/skills/<name>` shape.
 */
export function parseSkillLocator(value: string): string | null {
  if (!value.startsWith(SKILL_LOCATOR_PREFIX)) {
    return null;
  }

  let locator: URL;
  try {
    locator = new URL(value);
  } catch {
    return null;
  }

  if (
    locator.protocol !== "llm-space:" ||
    locator.hostname !== "internal" ||
    locator.username !== "" ||
    locator.password !== "" ||
    locator.port !== "" ||
    locator.search !== "" ||
    locator.hash !== ""
  ) {
    return null;
  }

  const match = /^\/skills\/([^/]+)$/.exec(locator.pathname);
  if (!match) {
    return null;
  }

  let name: string;
  try {
    name = decodeURIComponent(match[1]!);
  } catch {
    return null;
  }
  return SKILL_NAME_PATTERN.test(name) ? name : null;
}
