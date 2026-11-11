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

export function reconcileRecentPaneKeys({
  previousKeys,
  availableKeys,
  activeKey,
  limit,
}: {
  previousKeys: readonly string[];
  availableKeys: readonly string[];
  activeKey: string | null;
  limit: number;
}): { retained: string[]; evicted: string[] } {
  const retained = retainRecentPaneKeys(
    previousKeys,
    availableKeys,
    activeKey,
    limit
  );
  const retainedSet = new Set(retained);
  const availableSet = new Set(availableKeys);
  const evicted = [...new Set(previousKeys)].filter(
    (key) => availableSet.has(key) && !retainedSet.has(key)
  );
  return { retained, evicted };
}
