/** Keep a pane marked busy until its terminal thread write has completed. */
export async function settleStreamingPane(
  flushPending: () => Promise<void>,
  markSettled: () => void
): Promise<void> {
  await flushPending();
  markSettled();
}
