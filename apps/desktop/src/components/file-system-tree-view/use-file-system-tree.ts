"use client";

import { uuid, type FileNode, type Thread } from "@llm-space/core";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { localFs } from "@/client";
import {
  basename,
  joinPath,
  normalizeThreadForPath,
  parentOf,
  threadTitleFromPath,
  uniqueThreadFileName,
} from "@/lib/thread-file";

/** Query-key factory for a directory listing. */
export const fsKeys = {
  ls: (path: string) => ["fs", "local", "ls", path] as const,
};

/** localStorage key under which the expanded directory paths live. */
const EXPANDED_KEY = "llm-space:fs-tree:expanded";

/**
 * Deepest directory level whose expanded state is persisted across sessions.
 * Level 1 is a direct child of the root, level 2 its child, and so on.
 */
const MAX_PERSISTED_DEPTH = 5;

/** Path depth (segment count), used to order ancestors before descendants. */
function _depth(path: string): number {
  return path.split("/").length;
}

/**
 * Read the persisted expanded paths, sorted shallowest-first so that a parent
 * is always restored (and its listing loaded) before its descendants. Returns
 * `[]` when storage is unavailable or malformed.
 */
function _loadPersistedExpanded(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(EXPANDED_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((p): p is string => typeof p === "string")
      .sort((a, b) => _depth(a) - _depth(b));
  } catch {
    return [];
  }
}

/** Persist the expanded paths, ignoring any storage failure. */
function _savePersistedExpanded(paths: string[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(EXPANDED_KEY, JSON.stringify(paths));
  } catch {
    // Storage unavailable (private mode, quota) ⇒ persistence is best-effort.
  }
}

/**
 * Pick an unused "untitled" name in a directory: `untitled<ext>`, then
 * `untitled-1<ext>`, `untitled-2<ext>`, … `index` is 0 for the bare name.
 */
function uniqueUntitled(
  names: Set<string>,
  ext: string
): { name: string; index: number } {
  if (!names.has(`untitled${ext}`)) return { name: `untitled${ext}`, index: 0 };
  let n = 1;
  while (names.has(`untitled-${n}${ext}`)) n++;
  return { name: `untitled-${n}${ext}`, index: n };
}

/**
 * The collision-free `_copy` name for duplicating `name` in a directory:
 * `foo_copy`, then `foo_copy_2`, `foo_copy_3`, … A `.json` extension (the only
 * file kind shown in the tree) is preserved on the stem.
 */
function uniqueCopyName(names: Set<string>, name: string): string {
  const ext = name.endsWith(".json") ? ".json" : "";
  const stem = ext ? name.slice(0, -ext.length) : name;
  let candidate = `${stem}_copy${ext}`;
  let n = 2;
  while (names.has(candidate)) candidate = `${stem}_copy_${n++}${ext}`;
  return candidate;
}

function isSelfOrDescendant(ancestor: string, path: string): boolean {
  return path === ancestor || path.startsWith(`${ancestor}/`);
}

/** Match the server's ordering: directories first, then name ascending. */
function sortNodes(nodes: FileNode[]): FileNode[] {
  return [...nodes].sort((a, b) => {
    if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

/**
 * Create a blank thread for users who want an empty canvas. The title must come
 * from the destination path so the on-disk file name and thread title stay in
 * sync from the first write.
 */
function _createBlankThread(title: string): Thread {
  return {
    title,
    context: {
      messages: [
        { id: uuid(), role: "user", content: [{ type: "text", text: "" }] },
      ],
    },
  };
}

/**
 * Create a user-owned copy of a prompt example. The prompt becomes the system
 * prompt, while the user message stays empty so the example behaves as a ready
 * starting point rather than a pre-run transcript.
 */
function _createThreadFromPromptExample(
  title: string,
  systemPrompt: string
): Thread {
  return {
    title,
    context: {
      systemPrompt,
      messages: [
        { id: uuid(), role: "user", content: [{ type: "text", text: "" }] },
      ],
    },
  };
}

export interface FileSystemTree {
  /** Cached listing for each loaded directory path. */
  nodesByPath: Map<string, FileNode[]>;
  /** Directory paths whose listing is currently loading. */
  loadingByPath: Set<string>;
  /** Whether the root listing is still loading. */
  isRootLoading: boolean;
  /** Expanded directory paths (mirrors the tree's open state). */
  expanded: Set<string>;
  toggle: (path: string) => void;
  /** Expand a directory (idempotent; does not collapse). */
  expand: (path: string) => void;
  /** Re-fetch all loaded directory listings. */
  refresh: () => void;
  /** Create an auto-named `untitled` folder under `parent`; returns its path. */
  createFolder: (parent: string) => Promise<string | null>;
  /** Create an auto-named thread under `parent`; returns its path. */
  createFile: (parent: string) => Promise<string | null>;
  /** Create a thread from a built-in prompt example; returns its path. */
  createFileFromPromptExample: (
    parent: string,
    example: { fileStem: string; systemPrompt: string }
  ) => Promise<string | null>;
  /** Delete a file or directory; resolves to whether it succeeded. */
  remove: (path: string) => Promise<boolean>;
  /** Copy a file/directory beside itself as `<name>_copy`; returns the new path. */
  duplicate: (path: string) => Promise<string | null>;
  /** Reveal a file/directory in the OS file manager (Finder/Explorer). */
  reveal: (path: string) => Promise<void>;
  /** Move into `destDir`; resolves to the new path, or null on no-op/error. */
  move: (src: string, destDir: string) => Promise<string | null>;
  /** Rename within the same directory; resolves to the new path, or null. */
  rename: (path: string, newBase: string) => Promise<string | null>;
}

/**
 * Owns all server state for the file tree via React Query: one lazily-enabled
 * `ls` query per expanded directory (root always loaded), plus mutations that
 * invalidate the affected directories. `move` is optimistic with rollback.
 */
export function useFileSystemTree(): FileSystemTree {
  const qc = useQueryClient();
  // Restore the directories that were open last session (shallowest-first, so
  // each parent loads before its children); entries whose directory no longer
  // exists are pruned once their parent's listing loads.
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(_loadPersistedExpanded())
  );

  // Root ("") is always queried; each expanded directory adds one query.
  const paths = useMemo(() => ["", ...expanded], [expanded]);
  const results = useQueries({
    queries: paths.map((path) => ({
      queryKey: fsKeys.ls(path),
      queryFn: () => localFs.ls(path),
    })),
  });

  const nodesByPath = useMemo(() => {
    const map = new Map<string, FileNode[]>();
    paths.forEach((path, i) => {
      const data = results[i]?.data;
      if (data) map.set(path, data);
    });
    return map;
  }, [paths, results]);

  const loadingByPath = useMemo(() => {
    const set = new Set<string>();
    paths.forEach((path, i) => {
      if (results[i]?.isLoading) set.add(path);
    });
    return set;
  }, [paths, results]);

  // Persist expanded directories up to MAX_PERSISTED_DEPTH, shallowest-first so
  // the restore order opens ancestors before descendants.
  useEffect(() => {
    _savePersistedExpanded(
      [...expanded]
        .filter((p) => _depth(p) <= MAX_PERSISTED_DEPTH)
        .sort((a, b) => _depth(a) - _depth(b))
    );
  }, [expanded]);

  // Prune restored directories that no longer exist. A directory is dropped when
  // either its parent fell away (ancestor pruned/collapsed) or its parent's
  // listing has loaded and no longer lists it — both ignored silently, never
  // surfaced as an error. Walking shallowest-first lets a removed ancestor
  // cascade to its descendants within a single pass.
  useEffect(() => {
    setExpanded((prev) => {
      const ordered = [...prev].sort((a, b) => _depth(a) - _depth(b));
      const next = new Set(prev);
      let changed = false;
      for (const path of ordered) {
        const parent = parentOf(path);
        if (parent !== "" && !next.has(parent)) {
          next.delete(path);
          changed = true;
          continue;
        }
        const siblings = nodesByPath.get(parent);
        // Undefined ⇒ the parent's listing is still loading; leave it for now.
        if (
          siblings &&
          !siblings.some((n) => n.path === path && n.type === "directory")
        ) {
          next.delete(path);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [nodesByPath]);

  const toggle = useCallback((path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const expand = useCallback((path: string) => {
    setExpanded((prev) => (prev.has(path) ? prev : new Set(prev).add(path)));
  }, []);

  const refresh = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ["fs", "local", "ls"] });
  }, [qc]);

  const createFolder = useCallback(
    async (parent: string): Promise<string | null> => {
      let path: string;
      try {
        const names = new Set((await localFs.ls(parent)).map((n) => n.name));
        const { name } = uniqueUntitled(names, "");
        path = joinPath(parent, name);
        await localFs.mkdir(path);
      } catch (err) {
        toast.error((err as Error).message);
        return null;
      }
      void qc.invalidateQueries({ queryKey: fsKeys.ls(parent) });
      return path;
    },
    [qc]
  );

  const createFile = useCallback(
    async (parent: string): Promise<string | null> => {
      let path: string;
      try {
        const names = new Set((await localFs.ls(parent)).map((n) => n.name));
        const name = uniqueUntitled(names, ".json").name;
        path = joinPath(parent, name);
        const title = threadTitleFromPath(path);
        // Model-less by default; the UI resolves a fallback model at run time.
        await localFs.write(path, _createBlankThread(title));
      } catch (err) {
        toast.error((err as Error).message);
        return null;
      }
      void qc.invalidateQueries({ queryKey: fsKeys.ls(parent) });
      return path;
    },
    [qc]
  );

  const createFileFromPromptExample = useCallback(
    async (
      parent: string,
      example: { fileStem: string; systemPrompt: string }
    ): Promise<string | null> => {
      let path: string;
      try {
        const names = new Set((await localFs.ls(parent)).map((n) => n.name));
        const name = uniqueThreadFileName(names, example.fileStem);
        path = joinPath(parent, name);
        const title = threadTitleFromPath(path);
        await localFs.write(
          path,
          _createThreadFromPromptExample(title, example.systemPrompt)
        );
      } catch (err) {
        toast.error((err as Error).message);
        return null;
      }
      void qc.invalidateQueries({ queryKey: fsKeys.ls(parent) });
      return path;
    },
    [qc]
  );

  const remove = useCallback(
    async (path: string): Promise<boolean> => {
      try {
        await localFs.rm(path);
      } catch (err) {
        toast.error((err as Error).message);
        // The delete may still have landed even though it reported failure
        // (e.g. the RPC timed out while the OS waited on a permission
        // prompt), so re-fetch rather than leaving a stale entry in the tree.
        void qc.invalidateQueries({ queryKey: fsKeys.ls(parentOf(path)) });
        return false;
      }
      // Prune the removed subtree from the expanded set.
      setExpanded((prev) => {
        const next = new Set(prev);
        for (const p of prev) {
          if (isSelfOrDescendant(path, p)) next.delete(p);
        }
        return next;
      });
      void qc.invalidateQueries({ queryKey: fsKeys.ls(parentOf(path)) });
      return true;
    },
    [qc]
  );

  const duplicate = useCallback(
    async (path: string): Promise<string | null> => {
      const parent = parentOf(path);
      let dest: string;
      try {
        const names = new Set((await localFs.ls(parent)).map((n) => n.name));
        dest = joinPath(parent, uniqueCopyName(names, basename(path)));
        await localFs.cp(path, dest);
      } catch (err) {
        toast.error((err as Error).message);
        return null;
      }
      void qc.invalidateQueries({ queryKey: fsKeys.ls(parent) });
      return dest;
    },
    [qc]
  );

  const reveal = useCallback(async (path: string): Promise<void> => {
    try {
      await localFs.reveal(path);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }, []);

  const move = useCallback(
    async (src: string, destDir: string): Promise<string | null> => {
      if (!src) return null;
      if (isSelfOrDescendant(src, destDir)) {
        toast.error("Cannot move a folder into itself.");
        return null;
      }
      const srcParent = parentOf(src);
      if (srcParent === destDir) return null; // no-op

      const name = basename(src);
      const dest = joinPath(destDir, name);
      const srcKey = fsKeys.ls(srcParent);
      const destKey = fsKeys.ls(destDir);

      await Promise.all([
        qc.cancelQueries({ queryKey: srcKey }),
        qc.cancelQueries({ queryKey: destKey }),
      ]);
      const prevSrc = qc.getQueryData<FileNode[]>(srcKey);
      const prevDest = qc.getQueryData<FileNode[]>(destKey);
      const moved = prevSrc?.find((n) => n.path === src);

      // Optimistically remove from the source and add to the destination.
      if (prevSrc) {
        qc.setQueryData<FileNode[]>(
          srcKey,
          prevSrc.filter((n) => n.path !== src)
        );
      }
      if (moved && prevDest) {
        qc.setQueryData<FileNode[]>(
          destKey,
          sortNodes([...prevDest, { ...moved, path: dest, name }])
        );
      }

      let ok = true;
      try {
        await localFs.mv(src, dest);
      } catch (err) {
        // Roll back.
        if (prevSrc) qc.setQueryData(srcKey, prevSrc);
        if (prevDest) qc.setQueryData(destKey, prevDest);
        toast.error((err as Error).message);
        ok = false;
      } finally {
        void qc.invalidateQueries({ queryKey: srcKey });
        void qc.invalidateQueries({ queryKey: destKey });
      }
      // Moving a subtree invalidates the expanded paths under it.
      if (ok) {
        setExpanded((prev) => {
          const next = new Set(prev);
          for (const p of prev) {
            if (isSelfOrDescendant(src, p)) next.delete(p);
          }
          return next;
        });
      }
      return ok ? dest : null;
    },
    [qc]
  );

  const rename = useCallback(
    async (path: string, newBase: string): Promise<string | null> => {
      const dest = joinPath(parentOf(path), newBase);
      if (dest === path) return null;
      try {
        await localFs.mv(path, dest);
        if (dest.endsWith(".json")) {
          const thread = await localFs.read(dest);
          await localFs.write(dest, normalizeThreadForPath(thread, dest));
        }
      } catch (err) {
        toast.error((err as Error).message);
        return null;
      }
      // The renamed subtree's old paths are no longer valid query keys; collapse
      // it so its children reload under the new path on next expand.
      setExpanded((prev) => {
        const next = new Set(prev);
        for (const p of prev) {
          if (isSelfOrDescendant(path, p)) next.delete(p);
        }
        return next;
      });
      void qc.invalidateQueries({ queryKey: fsKeys.ls(parentOf(path)) });
      return dest;
    },
    [qc]
  );

  return {
    nodesByPath,
    loadingByPath,
    isRootLoading: loadingByPath.has(""),
    expanded,
    toggle,
    expand,
    refresh,
    createFolder,
    createFile,
    createFileFromPromptExample,
    remove,
    duplicate,
    reveal,
    move,
    rename,
  };
}
