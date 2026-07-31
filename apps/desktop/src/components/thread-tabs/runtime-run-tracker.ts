import type { RuntimeId } from "@/shared/runtime";

export type PaneStreamingChange = (
  paneId: string,
  runtimeId: RuntimeId,
  running: boolean
) => void;

/** Tracks panes whose run or terminal persistence still owns its runtime. */
export class RuntimeRunTracker {
  private readonly _runningPanes = new Map<string, RuntimeId>();

  setRunning(paneId: string, runtimeId: RuntimeId, running: boolean): void {
    if (running) {
      this._runningPanes.set(paneId, runtimeId);
      return;
    }
    this._runningPanes.delete(paneId);
  }

  hasRunning(runtimeId: RuntimeId): boolean {
    return this._runningPanes.values().some((value) => value === runtimeId);
  }

  hasAnyRunning(): boolean {
    return this._runningPanes.size > 0;
  }

  canTransition(current: RuntimeId, next: RuntimeId): boolean {
    return current === next || !this.hasRunning(current);
  }

  canDisconnect(runtimeId: RuntimeId): boolean {
    return !this.hasRunning(runtimeId);
  }
}

/** Keep a pane marked busy until its terminal thread write has completed. */
export async function settleStreamingPane(
  flushPending: () => Promise<void>,
  markSettled: () => void
): Promise<void> {
  await flushPending();
  markSettled();
}
