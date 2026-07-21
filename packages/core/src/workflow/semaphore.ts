/**
 * A minimal counting semaphore used to cap concurrent `agent()` calls. On
 * release, a waiting acquirer is handed the slot directly (rather than
 * incrementing the counter) so the permit count can never drift above `max`.
 */
export class Semaphore {
  private _available: number;
  private readonly _queue: (() => void)[] = [];

  constructor(max: number) {
    this._available = Math.max(1, Math.floor(max));
  }

  /** Run `fn` once a permit is free, releasing the permit when it settles. */
  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this._acquire();
    try {
      return await fn();
    } finally {
      this._release();
    }
  }

  private async _acquire(): Promise<void> {
    if (this._available > 0) {
      this._available -= 1;
      return;
    }
    await new Promise<void>((resolve) => this._queue.push(resolve));
  }

  private _release(): void {
    const next = this._queue.shift();
    if (next) {
      next();
    } else {
      this._available += 1;
    }
  }
}
