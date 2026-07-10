import { defineTool } from "eve/tools";
import { z } from "zod";

export default defineTool({
  description: "Get the current weather for a city.",
  inputSchema: z.object({
    city: z.string().min(1).describe("City to check."),
  }),
  execute({ city }) {
    return { city, condition: "Sunny", temperatureF: 72 };
  },
  toModelOutput(output) {
    return {
      type: "text",
      value: `Weather for ${output.city}: ${output.condition}, ${output.temperatureF}F`,
    };
  },
});
