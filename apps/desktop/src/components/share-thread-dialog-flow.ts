import type { RuntimeId } from "@/shared/runtime";

export interface ShareThreadTarget {
  runtimeId: RuntimeId;
  path: string;
}

export interface ShareThreadDraft {
  title: string;
  description: string;
}

/** Immutable payload captured before auth or publication starts. */
export interface ShareThreadTransaction extends ShareThreadTarget {
  readonly id: number;
  readonly title?: string;
  readonly description: string;
}

interface ShareThreadOperation extends ShareThreadTarget {
  id: number;
}

interface PendingAuth {
  transaction: ShareThreadTransaction;
  sawSigningIn: boolean;
}

export type ShareAuthStatus = "signedOut" | "signingIn" | "signedIn";

export type ShareAuthObservation =
  | { type: "none" }
  | { type: "cancelled" }
  | { type: "resume"; transaction: ShareThreadTransaction };

export interface SharePublishResult {
  shareUrl: string;
}

interface SharePublishCallbacks<T extends SharePublishResult> {
  onStart(): void;
  onSuccess(result: T): void;
  onError(error: unknown): void;
}

/**
 * Owns the monotonic lifetime of one Share dialog target.
 *
 * Every async operation captures the current epoch and target. Closing,
 * reopening, or changing either target field invalidates prior work, even when
 * a later target happens to reuse the same path.
 */
export class ShareThreadDialogFlow {
  private _epoch = 0;
  private _open = false;
  private _target: ShareThreadTarget = { runtimeId: "local", path: "" };
  private _pendingAuth: PendingAuth | null = null;

  sync(open: boolean, target: ShareThreadTarget): void {
    if (
      this._open === open &&
      this._target.runtimeId === target.runtimeId &&
      this._target.path === target.path
    ) {
      return;
    }
    this._epoch += 1;
    this._open = open;
    this._target = { ...target };
    this._pendingAuth = null;
  }

  /** Invalidate immediately, before the parent has committed `open=false`. */
  invalidate(): void {
    this._epoch += 1;
    this._open = false;
    this._pendingAuth = null;
  }

  createTransaction(draft: ShareThreadDraft): ShareThreadTransaction | null {
    if (!this._open) return null;
    const title = draft.title.trim();
    return Object.freeze({
      ...this._captureOperation(),
      title: title || undefined,
      description: draft.description.trim(),
    });
  }

  async prefillTitle(
    read: (target: ShareThreadTarget) => Promise<{ title?: string }>,
    display: (title: string) => void
  ): Promise<void> {
    if (!this._open) return;
    const operation = this._captureOperation();
    try {
      const thread = await read({
        runtimeId: operation.runtimeId,
        path: operation.path,
      });
      if (thread.title && this._isCurrent(operation)) display(thread.title);
    } catch {
      // Title prefill is non-fatal; the dialog keeps the path-derived title.
    }
  }

  beginAuth(transaction: ShareThreadTransaction): boolean {
    if (!this._isCurrent(transaction)) return false;
    this._pendingAuth = { transaction, sawSigningIn: false };
    return true;
  }

  observeAuth(status: ShareAuthStatus): ShareAuthObservation {
    const pending = this._pendingAuth;
    if (!pending || !this._isCurrent(pending.transaction)) {
      this._pendingAuth = null;
      return { type: "none" };
    }
    if (status === "signingIn") {
      pending.sawSigningIn = true;
      return { type: "none" };
    }
    if (status === "signedIn") {
      this._pendingAuth = null;
      return { type: "resume", transaction: pending.transaction };
    }
    if (pending.sawSigningIn) {
      this._pendingAuth = null;
      return { type: "cancelled" };
    }
    return { type: "none" };
  }

  async publish<T extends SharePublishResult>(
    transaction: ShareThreadTransaction,
    request: (transaction: ShareThreadTransaction) => Promise<T>,
    callbacks: SharePublishCallbacks<T>
  ): Promise<void> {
    if (!this._isCurrent(transaction)) return;
    callbacks.onStart();
    try {
      const result = await request(transaction);
      if (this._isCurrent(transaction)) callbacks.onSuccess(result);
    } catch (error) {
      if (this._isCurrent(transaction)) callbacks.onError(error);
    }
  }

  private _captureOperation(): ShareThreadOperation {
    return {
      id: this._epoch,
      runtimeId: this._target.runtimeId,
      path: this._target.path,
    };
  }

  private _isCurrent(operation: ShareThreadOperation): boolean {
    return (
      this._open &&
      operation.id === this._epoch &&
      operation.runtimeId === this._target.runtimeId &&
      operation.path === this._target.path
    );
  }
}
