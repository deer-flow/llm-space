export function retainRecentPaneKeys(
  previousKeys: readonly string[],
  availableKeys: readonly string[],
  activeKey: string | null,
  limit: number
): string[] {
  if (limit <= 0) {
    return [];
  }

  const available = new Set(availableKeys);
  const candidates = [
    ...(activeKey === null ? [] : [activeKey]),
    ...previousKeys,
    ...[...availableKeys].reverse(),
  ];
  const retained: string[] = [];
  const seen = new Set<string>();

  for (const key of candidates) {
    if (!available.has(key) || seen.has(key)) {
      continue;
    }
    retained.push(key);
    seen.add(key);
    if (retained.length === limit) {
      break;
    }
  }

  return retained;
}
