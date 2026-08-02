export function isFatalThreadLoadError({
  hasThread,
  isError,
  isLoading,
}: {
  hasThread: boolean;
  isError: boolean;
  isLoading: boolean;
}): boolean {
  return !hasThread && (isError || !isLoading);
}
