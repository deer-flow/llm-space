"use client";

import type { FileNode } from "@llm-space/core";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";

import { localFs } from "@/client";
import { useModels } from "@/components/model-provider";

/** Query-key factory for a directory listing. */
export const fsKeys = {
  ls: (path: string) => ["fs", "local", "ls", path] as const,
};

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

// --- POSIX path helpers (paths are relative to the storage root) -----------

export function joinPath(parent: string, name: string): string {
  return parent ? `${parent}/${name}` : name;
}

export function parentOf(path: string): string {
  const i = path.lastIndexOf("/");
  return i === -1 ? "" : path.slice(0, i);
}

export function basename(path: string): string {
  const i = path.lastIndexOf("/");
  return i === -1 ? path : path.slice(i + 1);
}

export function ensureJson(name: string): string {
  return name.endsWith(".json") ? name : `${name}.json`;
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
  /** Create an auto-named `untitled.json` thread under `parent`; returns its path. */
  createFile: (parent: string) => Promise<string | null>;
  /** Delete a file or directory; resolves to whether it succeeded. */
  remove: (path: string) => Promise<boolean>;
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
  const modelGroups = useModels();
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

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
        const { name, index } = uniqueUntitled(names, ".json");
        const title = index === 0 ? "Untitled" : `Untitled ${index}`;
        path = joinPath(parent, name);
        const model = modelGroups[0]?.models[0];
        if (!model) {
          throw new Error("No models configured");
        }
        await localFs.write(path, {
          title,
          model,
        });
      } catch (err) {
        toast.error((err as Error).message);
        return null;
      }
      void qc.invalidateQueries({ queryKey: fsKeys.ls(parent) });
      return path;
    },
    [modelGroups, qc]
  );

  const remove = useCallback(
    async (path: string): Promise<boolean> => {
      try {
        await localFs.rm(path);
      } catch (err) {
        toast.error((err as Error).message);
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
    remove,
    move,
    rename,
  };
}
