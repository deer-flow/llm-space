interface SerializedPersistenceOptions {
  onBusyChange?: (busy: boolean) => void;
  onWriteError?: (error: unknown) => void;
  waitBeforeRetry?: (attempt: number) => Promise<void>;
}

interface PendingValue<T> {
  revision: number;
  value: T;
}

const _waitBeforeRetry = (attempt: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, Math.min(1_000 * 2 ** (attempt - 1), 5_000));
  });

/**
 * Persists only ordered revisions. Failed writes stay inside the drain loop, so
 * a terminal flush remains a real durability barrier and never needs a second
 * user action to recover after storage becomes writable again.
 */
export class SerializedPersistence<T> {
  private _drainPromise: Promise<void> | null = null;
  private _latestRevision = 0;
  private _pending: PendingValue<T> | null = null;
  private _persistedRevision = 0;
  private _busy = false;
  private readonly _onBusyChange?: (busy: boolean) => void;
  private readonly _onWriteError?: (error: unknown) => void;
  private readonly _waitBeforeRetry: (attempt: number) => Promise<void>;

  constructor(
    private readonly _write: (value: T) => Promise<void>,
    options: SerializedPersistenceOptions = {}
  ) {
    this._onBusyChange = options.onBusyChange;
    this._onWriteError = options.onWriteError;
    this._waitBeforeRetry = options.waitBeforeRetry ?? _waitBeforeRetry;
  }

  setPending(value: T): number {
    const revision = ++this._latestRevision;
    this._pending = { revision, value };
    this._setBusy(true);
    return revision;
  }

  discardPending(): void {
    if (this._pending) {
      this._persistedRevision = Math.max(
        this._persistedRevision,
        this._pending.revision
      );
      this._pending = null;
      if (!this._drainPromise) this._setBusy(false);
    }
  }

  async flush(): Promise<void> {
    const targetRevision = this._latestRevision;
    if (this._drainPromise) await this._drainPromise;
    while (this._persistedRevision < targetRevision) {
      await this._ensureDrain();
    }
  }

  private _ensureDrain(): Promise<void> {
    if (this._drainPromise) return this._drainPromise;
    const drain = this._drain().finally(() => {
      if (this._drainPromise === drain) {
        this._drainPromise = null;
        this._setBusy(this._pending !== null);
      }
    });
    this._drainPromise = drain;
    return drain;
  }

  private async _drain(): Promise<void> {
    let attempt = 0;
    while (this._pending) {
      const candidate = this._pending;
      this._pending = null;
      try {
        await this._write(candidate.value);
        this._persistedRevision = Math.max(
          this._persistedRevision,
          candidate.revision
        );
        attempt = 0;
      } catch (error) {
        attempt += 1;
        if (attempt === 1) this._onWriteError?.(error);
        // Preserve a newer edit when one arrived during the failed write. If
        // none did, restore the failed revision itself for the retry.
        if (
          !this._pending &&
          candidate.revision > this._persistedRevision
        ) {
          this._pending = candidate;
        }
        await this._waitBeforeRetry(attempt);
      }
    }
  }

  private _setBusy(busy: boolean): void {
    if (this._busy === busy) return;
    this._busy = busy;
    this._onBusyChange?.(busy);
  }
}
