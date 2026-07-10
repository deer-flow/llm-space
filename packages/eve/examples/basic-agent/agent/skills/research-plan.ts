import { defineSkill } from "eve/skills";

export default defineSkill({
  description: "Plan a short research pass before answering.",
  markdown: [
    "# Research plan",
    "",
    "Clarify the objective, identify the smallest useful source set, and report uncertainty explicitly.",
  ].join("\n"),
});
