import path from "node:path";

import { callEveTool, importEveProjectToThread } from "../src";

const projectRoot = path.join(import.meta.dir, "basic-agent");

const result = await importEveProjectToThread({ projectRoot, source: "manual" });
const tools = result.thread.context?.tools?.map((tool) => tool.name) ?? [];

console.info("Imported thread:", result.thread.title);
console.info("Tools:", tools.join(", "));

const weather = await callEveTool({
  projectRoot,
  runtime: "tool",
  toolName: "get_weather",
  arguments: { city: "Tokyo" },
});

console.info("get_weather:", weather.contentText);
