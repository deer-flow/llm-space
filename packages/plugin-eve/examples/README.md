# Eve Package Examples

`basic-agent/` is a tiny Eve-style project used to show the supported local
debug path:

- `agent/instructions.ts` exports `defineInstructions()`.
- `agent/tools/get_weather.ts` exports `defineTool()`.
- `agent/skills/research-plan.ts` exports `defineSkill()`.

Run the importer example from the repository root:

```sh
bun run packages/plugin-eve/examples/import-basic-agent.ts
```
