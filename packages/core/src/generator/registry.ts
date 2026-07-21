import { langgraphGenerator } from "./langgraph";
import type { GeneratorDefinition } from "./types";

/**
 * All registered project generators, keyed by id. V1 ships only the LangGraph
 * (Python) generator; PI Agent and others can be added here.
 */
const GENERATORS: Record<string, GeneratorDefinition> = {
  [langgraphGenerator.id]: langgraphGenerator,
};

/** List every registered generator (for a host picker). */
export function listGenerators(): GeneratorDefinition[] {
  return Object.values(GENERATORS);
}

/** Look up a generator by id, or `undefined` when unknown. */
export function getGenerator(id: string): GeneratorDefinition | undefined {
  return GENERATORS[id];
}
