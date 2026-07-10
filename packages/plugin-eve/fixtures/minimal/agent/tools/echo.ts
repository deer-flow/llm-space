import { defineTool } from "eve/tools";
import { z } from "zod";

export default defineTool({
  description: "Echo a short piece of text.",
  inputSchema: z.object({
    text: z.string().optional().describe("Text to echo."),
  }),
  async execute(input) {
    return `echo:${String(input.text ?? "")}`;
  },
});
