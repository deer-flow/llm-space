import { describe, expect, test } from "bun:test";

import { getToolExample } from "../../../../src/components/thread-playground/examples/tools";

describe("generate_image tool example", () => {
  test("offers an optional generated-file output directory", () => {
    const tool = getToolExample("generate_image");

    expect(tool).toMatchObject({
      parameters: {
        properties: {
          output_directory: {
            type: "string",
            minLength: 1,
            description:
              "Optional absolute directory for the generated image file; a leading ~/ is expanded to the current user's home directory. Omit it to use the system temporary directory.",
          },
        },
      },
    });
    expect(tool?.parameters).toMatchObject({
      required: ["prompt", "aspect_ratio"],
    });
  });
});
