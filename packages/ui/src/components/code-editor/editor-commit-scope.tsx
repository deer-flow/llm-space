"use client";

import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";

export interface EditorCommitScopeHandle {
  /** Commit every mounted editor draft owned by this View. */
  commitAll(): void;
}

interface EditorCommitRegistry {
  register(commit: () => void): () => void;
}

const EditorCommitContext = createContext<EditorCommitRegistry | null>(null);

export function EditorCommitScope({
  children,
  onReady,
}: {
  children: ReactNode;
  onReady?: (handle: EditorCommitScopeHandle | null) => void;
}) {
  const commitsRef = useRef(new Set<() => void>());
  const register = useCallback((commit: () => void) => {
    commitsRef.current.add(commit);
    return () => commitsRef.current.delete(commit);
  }, []);
  const registry = useMemo<EditorCommitRegistry>(() => ({ register }), [register]);
  const handle = useMemo<EditorCommitScopeHandle>(
    () => ({
      commitAll() {
        for (const commit of [...commitsRef.current]) {
          commit();
        }
      },
    }),
    []
  );

  useLayoutEffect(() => {
    onReady?.(handle);
    return () => onReady?.(null);
  }, [handle, onReady]);

  return (
    <EditorCommitContext.Provider value={registry}>
      {children}
    </EditorCommitContext.Provider>
  );
}

/** Register an editor's stable imperative commit with the nearest View scope. */
export function useRegisterEditorCommit(commit: () => void): void {
  const registry = useContext(EditorCommitContext);
  useLayoutEffect(() => registry?.register(commit), [commit, registry]);
}
