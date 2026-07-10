import path from "node:path";

import {
  callEveTool,
  importEveProjectToThread,
  listEveProjectSkills,
} from "../src";

const root = path.resolve(import.meta.dir, "..");
const minimal = path.join(root, "fixtures", "minimal");
const zod = path.join(root, "fixtures", "static-zod");

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

const minimalResult = await importEveProjectToThread({
  projectRoot: minimal,
  source: "manual",
});
assert(
  minimalResult.thread.context?.systemPrompt?.includes("minimal Eve fixture"),
  "imports instructions into the system prompt"
);
assert(
  minimalResult.thread.context?.eve?.projectRoot === minimal,
  "persists the Eve project root"
);
const tools = minimalResult.thread.context?.tools ?? [];
assert(
  tools.some((tool) => tool.name === "echo"),
  "imports echo tool"
);
assert(
  tools.some((tool) => tool.name === "skill"),
  "adds scoped skill tool"
);

const skills = await listEveProjectSkills(minimal);
assert(skills.length === 1, "lists one project skill");
assert(skills[0]?.name === "research-helper", "lists project skill by name");

const echo = await callEveTool({
  projectRoot: minimal,
  runtime: "tool",
  toolName: "echo",
  arguments: { text: "ok" },
});
assert(echo.contentText === "echo:ok", "executes a basic Eve tool");

const skill = await callEveTool({
  projectRoot: minimal,
  runtime: "skill",
  toolName: "skill",
  arguments: { name: "research-helper" },
});
assert(
  skill.contentText.includes("Break the research task"),
  "loads a project-scoped skill"
);

const zodResult = await importEveProjectToThread({ projectRoot: zod });
const score = zodResult.thread.context?.tools?.find(
  (tool) => tool.name === "score"
);
const scoreParameters = score?.parameters as
  | {
      type?: string;
      required?: string[];
      properties?: { answer?: { minLength?: number } };
    }
  | undefined;
assert(scoreParameters?.type === "object", "converts z.object to JSON Schema");
assert(
  scoreParameters.required?.includes("answer"),
  "preserves required Zod fields"
);
assert(
  scoreParameters.properties?.answer?.minLength === 1,
  "preserves simple Zod string refinements"
);

console.info("Eve smoke checks passed.");
