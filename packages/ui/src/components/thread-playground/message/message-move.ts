export interface MessageMove {
  sourceIndex: number;
  destinationIndex: number;
}

/** Resolve stable DnD message IDs into one store reorder operation. */
export function resolveMessageMove(
  messageIds: readonly string[],
  activeId: string,
  overId: string | null
): MessageMove | null {
  if (overId === null || activeId === overId) return null;
  const sourceIndex = messageIds.indexOf(activeId);
  const destinationIndex = messageIds.indexOf(overId);
  return sourceIndex < 0 || destinationIndex < 0
    ? null
    : { sourceIndex, destinationIndex };
}
