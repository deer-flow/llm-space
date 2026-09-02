import { describe, expect, test } from "bun:test";

import { PROMPT_EXAMPLES } from "../../../../src/components/thread-playground/examples/prompts";
import { getToolExample } from "../../../../src/components/thread-playground/examples/tools";

describe("General Agent tool examples", () => {
  test("includes exec_code as a built-in tool immediately after bash", () => {
    const generalAgent = PROMPT_EXAMPLES.find(
      (example) => example.type === "example" && example.id === "general-agent"
    );
    expect(generalAgent?.type).toBe("example");
    if (generalAgent?.type !== "example" || !Array.isArray(generalAgent.tools)) {
      throw new Error("Expected General Agent to define a static tool list.");
    }

    const tools = generalAgent.tools;
    const bashIndex = tools.findIndex(
      (tool) => "name" in tool && tool.name === "bash"
    );

    expect(tools[bashIndex + 1]).toMatchObject({
      type: "builtin",
      name: "exec_code",
    });
  });
});

describe("generate_image tool example", () => {
  test("offers an optional generated-file output directory", () => {
    const tool = getToolExample("generate_image");

    expect(tool).toMatchObject({
      parameters: {
        properties: {
          output_directory: {
            type: "string",
            description:
              "Optional absolute directory for the generated image file; a leading ~/ is expanded to the current user's home directory. Invalid or unwritable directories fall back to the system temporary directory.",
          },
        },
      },
    });
    expect(tool?.parameters).toMatchObject({
      required: ["prompt", "aspect_ratio"],
    });
  });
});
