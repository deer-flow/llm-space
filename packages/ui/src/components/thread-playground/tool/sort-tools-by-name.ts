export function sortToolsByName<T extends { name: string }>(
  tools: readonly T[]
): T[] {
  return [...tools].sort((left, right) =>
    left.name.localeCompare(right.name, undefined, { sensitivity: "base" })
  );
}
