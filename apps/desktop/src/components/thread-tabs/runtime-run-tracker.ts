import type { RuntimeId } from "@/shared/runtime";

export type PaneRunStart = (
  paneId: string,
  runtimeId: RuntimeId,
  runId: string,
  path?: string
) => boolean;
export type PaneRunSettled = (paneId: string, runId: string) => void;
export type PanePersistenceChange = (
  paneId: string,
  runtimeId: RuntimeId,
  owner: object,
  busy: boolean,
  path?: string
) => void;

export interface PaneRunLease {
  paneId: string;
  runId: string;
  runtimeId: RuntimeId;
  path?: string;
}

interface PanePersistenceLease {
  owner: object;
  path?: string;
  runtimeId: RuntimeId;
}

function _normalizePath(path: string): string {
  const parts: string[] = [];
  for (const part of path.replaceAll("\\", "/").split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      parts.pop();
      continue;
    }
    parts.push(part);
  }
  return parts.join("/");
}

function _pathsOverlap(left: string, right: string): boolean {
  return (
    left === "" ||
    right === "" ||
    left === right ||
    left.startsWith(`${right}/`) ||
    right.startsWith(`${left}/`)
  );
}

/** Tracks panes whose run or terminal persistence still owns its runtime. */
export class RuntimeRunTracker {
  private _globalMutation = false;
  private readonly _closingPanes = new Set<string>();
  private readonly _mutatingPanes = new Set<string>();
  private readonly _mutatingPaths = new Map<RuntimeId, Map<object, string[]>>();
  private readonly _mutatingRuntimes = new Set<RuntimeId>();
  private readonly _persistingPanes = new Map<
    string,
    Map<object, PanePersistenceLease>
  >();
  private readonly _runningPanes = new Map<string, Map<string, PaneRunLease>>();
  private readonly _listeners = new Set<() => void>();
  private _version = 0;

  readonly subscribe = (listener: () => void): (() => void) => {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  };

  readonly getSnapshot = (): number => this._version;

  beginRun(
    paneId: string,
    runtimeId: RuntimeId,
    runId: string,
    path?: string
  ): boolean {
    if (
      this._closingPanes.has(paneId) ||
      this.isMutationReserved(paneId, runtimeId, path)
    ) {
      return false;
    }
    let leases = this._runningPanes.get(paneId);
    if (!leases) {
      leases = new Map();
      this._runningPanes.set(paneId, leases);
    }
    leases.set(runId, {
      paneId,
      runId,
      runtimeId,
      path: path === undefined ? undefined : _normalizePath(path),
    });
    return true;
  }

  settleRun(paneId: string, runId: string): boolean {
    const leases = this._runningPanes.get(paneId);
    if (!leases?.delete(runId)) return false;
    if (leases.size === 0) this._runningPanes.delete(paneId);
    return true;
  }

  hasRunning(runtimeId: RuntimeId): boolean {
    return [...this._runningPanes.values()].some((leases) =>
      [...leases.values()].some((lease) => lease.runtimeId === runtimeId)
    );
  }

  isPaneRunning(paneId: string): boolean {
    return (this._runningPanes.get(paneId)?.size ?? 0) > 0;
  }

  setPersistenceBusy(
    paneId: string,
    runtimeId: RuntimeId,
    owner: object,
    busy: boolean,
    path?: string
  ): void {
    if (busy) {
      let leases = this._persistingPanes.get(paneId);
      if (!leases) {
        leases = new Map();
        this._persistingPanes.set(paneId, leases);
      }
      leases.set(owner, {
        owner,
        runtimeId,
        path: path === undefined ? undefined : _normalizePath(path),
      });
      return;
    }
    const leases = this._persistingPanes.get(paneId);
    leases?.delete(owner);
    if (leases?.size === 0) this._persistingPanes.delete(paneId);
  }

  isPaneBusy(paneId: string): boolean {
    return (
      this.isPaneRunning(paneId) ||
      (this._persistingPanes.get(paneId)?.size ?? 0) > 0
    );
  }

  isMutationReserved(
    paneId: string,
    runtimeId: RuntimeId,
    path?: string
  ): boolean {
    if (
      this._globalMutation ||
      this._mutatingRuntimes.has(runtimeId) ||
      this._mutatingPanes.has(paneId)
    ) {
      return true;
    }
    if (path === undefined) return false;
    const normalized = _normalizePath(path);
    return [...(this._mutatingPaths.get(runtimeId)?.values() ?? [])].some(
      (paths) => paths.some((reserved) => _pathsOverlap(normalized, reserved))
    );
  }

  reservePanes(paneIds: Iterable<string>): (() => void) | null {
    const ids = [...new Set(paneIds)];
    if (
      this._globalMutation ||
      this._mutatingRuntimes.size > 0 ||
      ids.some(
        (paneId) =>
          this.isPaneBusy(paneId) ||
          this._mutatingPanes.has(paneId) ||
          this._closingPanes.has(paneId)
      )
    ) {
      return null;
    }
    ids.forEach((paneId) => this._mutatingPanes.add(paneId));
    this._notifyMutationChange();
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      ids.forEach((paneId) => this._mutatingPanes.delete(paneId));
      this._notifyMutationChange();
    };
  }

  /**
   * Blocks new runs and competing mutations while a close synchronously commits
   * editor drafts. Unlike a destructive mutation reservation, this must not
   * suppress the closing pane's own Store-to-persistence notification.
   */
  reservePanesForClose(paneIds: Iterable<string>): (() => void) | null {
    const ids = [...new Set(paneIds)];
    if (
      this._globalMutation ||
      this._mutatingRuntimes.size > 0 ||
      ids.some(
        (paneId) =>
          this.isPaneBusy(paneId) ||
          this._mutatingPanes.has(paneId) ||
          this._closingPanes.has(paneId)
      )
    ) {
      return null;
    }
    ids.forEach((paneId) => this._closingPanes.add(paneId));
    this._notifyMutationChange();
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      ids.forEach((paneId) => this._closingPanes.delete(paneId));
      this._notifyMutationChange();
    };
  }

  reservePaths(
    runtimeId: RuntimeId,
    paths: Iterable<string>,
    paneIds: Iterable<string> = []
  ): (() => void) | null {
    const normalizedPaths = [...new Set([...paths].map(_normalizePath))];
    const ids = [...new Set(paneIds)];
    const existingPaths = [
      ...(this._mutatingPaths.get(runtimeId)?.values() ?? []),
    ].flat();
    const pathIsBusy = (path: string | undefined) =>
      path !== undefined &&
      normalizedPaths.some((reserved) =>
        _pathsOverlap(_normalizePath(path), reserved)
      );
    if (
      this._globalMutation ||
      this._mutatingRuntimes.has(runtimeId) ||
      ids.some(
        (paneId) =>
          this.isPaneBusy(paneId) ||
          this._mutatingPanes.has(paneId) ||
          this._closingPanes.has(paneId)
      ) ||
      normalizedPaths.some((path) =>
        existingPaths.some((reserved) => _pathsOverlap(path, reserved))
      ) ||
      [...this._runningPanes.values()].some((leases) =>
        [...leases.values()].some(
          (lease) => lease.runtimeId === runtimeId && pathIsBusy(lease.path)
        )
      ) ||
      [...this._persistingPanes.values()].some((leases) =>
        [...leases.values()].some(
          (lease) => lease.runtimeId === runtimeId && pathIsBusy(lease.path)
        )
      )
    ) {
      return null;
    }

    const owner = {};
    let reservations = this._mutatingPaths.get(runtimeId);
    if (!reservations) {
      reservations = new Map();
      this._mutatingPaths.set(runtimeId, reservations);
    }
    reservations.set(owner, normalizedPaths);
    ids.forEach((paneId) => this._mutatingPanes.add(paneId));
    this._notifyMutationChange();
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      const current = this._mutatingPaths.get(runtimeId);
      current?.delete(owner);
      if (current?.size === 0) this._mutatingPaths.delete(runtimeId);
      ids.forEach((paneId) => this._mutatingPanes.delete(paneId));
      this._notifyMutationChange();
    };
  }

  reserveRuntime(runtimeId: RuntimeId): (() => void) | null {
    if (
      this._globalMutation ||
      this._mutatingRuntimes.has(runtimeId) ||
      this._mutatingPaths.has(runtimeId) ||
      this._mutatingPanes.size > 0 ||
      this._closingPanes.size > 0 ||
      this.hasRunning(runtimeId) ||
      this._persistingPanes
        .values()
        .some((leases) =>
          [...leases.values()].some((entry) => entry.runtimeId === runtimeId)
        )
    ) {
      return null;
    }
    this._mutatingRuntimes.add(runtimeId);
    this._notifyMutationChange();
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      this._mutatingRuntimes.delete(runtimeId);
      this._notifyMutationChange();
    };
  }

  reserveAll(): (() => void) | null {
    if (
      this._globalMutation ||
      this._mutatingRuntimes.size > 0 ||
      this._mutatingPaths.size > 0 ||
      this._mutatingPanes.size > 0 ||
      this._closingPanes.size > 0 ||
      this.hasAnyRunning() ||
      [...this._persistingPanes.values()].some((leases) => leases.size > 0)
    ) {
      return null;
    }
    this._globalMutation = true;
    this._notifyMutationChange();
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      this._globalMutation = false;
      this._notifyMutationChange();
    };
  }

  hasAnyRunning(): boolean {
    return [...this._runningPanes.values()].some((leases) => leases.size > 0);
  }

  canTransition(current: RuntimeId, next: RuntimeId): boolean {
    return current === next || !this.hasRunning(current);
  }

  canDisconnect(runtimeId: RuntimeId): boolean {
    return (
      !this.hasRunning(runtimeId) &&
      !this._persistingPanes
        .values()
        .some((leases) =>
          [...leases.values()].some((entry) => entry.runtimeId === runtimeId)
        )
    );
  }

  private _notifyMutationChange(): void {
    this._version += 1;
    this._listeners.forEach((listener) => listener());
  }
}
