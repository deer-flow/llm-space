import { afterEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { createMediaBuiltInTools } from "../../../src/tools/built-in/media";
import { ToolRegistry } from "../../../src/tools/tool-registry";

const TEMP_PATHS: string[] = [];

afterEach(async () => {
  await Promise.all(
    TEMP_PATHS.splice(0).map((temporaryPath) =>
      rm(temporaryPath, { recursive: true, force: true })
    )
  );
});

describe("generate_image built-in tool", () => {
  test("writes the generated image to the requested directory", async () => {
    const outputDirectory = await mkdtemp(
      path.join(os.tmpdir(), "generate-image-tool-")
    );
    TEMP_PATHS.push(outputDirectory);
    let generatedInput: unknown;
    const tools = _createTools((input) => {
      generatedInput = input;
      return Promise.resolve({
        data: "aW1hZ2U=",
        mimeType: "image/png",
        model: "seedream-fixture",
        size: "2048x2048",
      });
    });

    expect(tools.listTools()[0]).toMatchObject({
      name: "generate_image",
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

    const result = await tools.call({
      name: "generate_image",
      arguments: {
        prompt: "A red circle",
        output_directory: outputDirectory,
      },
      config: {
        model: "seedream-fixture",
        size: "2K",
        watermark: true,
      },
      connection: { providerId: "ark", profileId: "profile-work" },
    });
    const generatedPath = _savedPath(result.content);

    expect(generatedPath).toStartWith(`${outputDirectory}${path.sep}`);
    expect(path.extname(generatedPath)).toBe(".png");
    expect(await readFile(generatedPath, "utf8")).toBe("image");
    expect(result.content).toEqual([
      {
        type: "text",
        text: `Generated image with seedream-fixture at 2048x2048. Saved image to ${generatedPath}.`,
      },
      { type: "image", data: "aW1hZ2U=", mimeType: "image/png" },
    ]);
    expect(generatedInput).toEqual({
      prompt: "A red circle",
      model: "seedream-fixture",
      size: "2K",
      watermark: true,
      connection: { providerId: "ark", profileId: "profile-work" },
    });
  });

  test("writes to the system temporary directory when none is requested", async () => {
    const tools = _createTools(() =>
      Promise.resolve({
        data: "aW1hZ2U=",
        mimeType: "image/jpeg",
        model: "seedream-fixture",
        size: "2048x2048",
      })
    );

    const result = await tools.call({
      name: "generate_image",
      arguments: { prompt: "A blue square" },
      config: {
        model: "seedream-fixture",
        size: "2K",
        watermark: false,
      },
    });
    const generatedPath = _savedPath(result.content);
    TEMP_PATHS.push(generatedPath);

    expect(path.dirname(generatedPath)).toBe(os.tmpdir());
    expect(path.extname(generatedPath)).toBe(".jpg");
    expect(await readFile(generatedPath, "utf8")).toBe("image");
  });

  test("expands a home directory and uses img for an unknown MIME type", async () => {
    const directoryName = `llm-space-generate-image-${randomUUID()}`;
    const outputDirectory = path.join(os.homedir(), directoryName);
    TEMP_PATHS.push(outputDirectory);
    const tools = _createTools(() =>
      Promise.resolve({
        data: "aW1hZ2U=",
        mimeType: "image/vnd.fixture",
        model: "seedream-fixture",
        size: "2048x2048",
      })
    );

    const result = await tools.call({
      name: "generate_image",
      arguments: {
        prompt: "A violet star",
        output_directory: `~/${directoryName}`,
      },
      config: {
        model: "seedream-fixture",
        size: "2K",
        watermark: false,
      },
    });
    const generatedPath = _savedPath(result.content);

    expect(path.dirname(generatedPath)).toBe(outputDirectory);
    expect(path.extname(generatedPath)).toBe(".img");
    expect(await readFile(generatedPath, "utf8")).toBe("image");
  });

  test("returns image content without a saved-path claim when writing fails", async () => {
    const directory = await mkdtemp(
      path.join(os.tmpdir(), "generate-image-tool-")
    );
    TEMP_PATHS.push(directory);
    const nonDirectoryPath = path.join(directory, "not-a-directory");
    await writeFile(nonDirectoryPath, "occupied");
    const tools = _createTools(() =>
      Promise.resolve({
        data: "aW1hZ2U=",
        mimeType: "image/webp",
        model: "seedream-fixture",
        size: "2048x2048",
      })
    );

    const result = await tools.call({
      name: "generate_image",
      arguments: {
        prompt: "A green triangle",
        output_directory: nonDirectoryPath,
      },
      config: {
        model: "seedream-fixture",
        size: "2K",
        watermark: false,
      },
    });

    expect(result.content).toEqual([
      {
        type: "text",
        text: "Generated image with seedream-fixture at 2048x2048.",
      },
      { type: "image", data: "aW1hZ2U=", mimeType: "image/webp" },
    ]);
  });

  test("rejects blank and relative output directories", async () => {
    const tools = _createTools(() => Promise.reject(new Error("unused")));
    const config = {
      model: "seedream-fixture",
      size: "2K",
      watermark: false,
    };

    expect(
      tools.call({
        name: "generate_image",
        arguments: { prompt: "A circle", output_directory: " " },
        config,
      })
    ).rejects.toThrow("output_directory must be a non-empty string");
    expect(
      tools.call({
        name: "generate_image",
        arguments: { prompt: "A circle", output_directory: "images" },
        config,
      })
    ).rejects.toThrow("output_directory must be an absolute path");
  });
});

/** Register one media contribution and freeze it as production does. */
function _createTools(
  generateImage: Parameters<typeof createMediaBuiltInTools>[0]["generateImage"]
): ToolRegistry {
  const tools = new ToolRegistry();
  tools.register({
    id: "test.media",
    entries: createMediaBuiltInTools({ generateImage }),
  });
  tools.freeze();
  return tools;
}

/** Extract the model-visible saved path and fail clearly if it is absent. */
function _savedPath(
  content: Awaited<ReturnType<ToolRegistry["call"]>>["content"]
): string {
  const text = content.find((item) => item.type === "text")?.text;
  const savedPath = text?.match(/Saved image to (.+)\.$/)?.[1];
  if (!savedPath) {
    throw new Error("generate_image did not report a saved file path.");
  }
  return savedPath;
}
