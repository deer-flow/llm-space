import path from "node:path";

import { callEveTool, importEveProject } from "../src/eve";

const projectRoot = path.join(import.meta.dir, "basic-agent");

const result = await importEveProject({ projectRoot, source: "manual" });
const tools = result.tools.map((tool) => tool.name);

console.info("Imported project:", result.title);
console.info("Tools:", tools.join(", "));

const weather = await callEveTool({
  projectRoot,
  runtime: "tool",
  toolName: "get_weather",
  arguments: { city: "Tokyo" },
});

console.info("get_weather:", weather.contentText);
