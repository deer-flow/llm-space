import { defineTool } from "eve/tools";
import { z } from "zod";

export default defineTool({
  description: "Score an answer.",
  inputSchema: z.object({
    answer: z.string().min(1).describe("The answer to score."),
    strict: z.boolean().optional().describe("Whether to score strictly."),
  }),
  async execute(input) {
    return { score: input.strict ? 1 : 0.5, answer: input.answer };
  },
});
