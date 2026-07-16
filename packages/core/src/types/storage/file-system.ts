export type FileNodeType = "file" | "directory";

/**
 * A single entry in the virtual file system.
 */
export interface FileNode {
  /**
   * The base name, e.g. "thread.json".
   */
  name: string;

  /**
   * The POSIX-style path relative to the storage root, e.g.
   * "threads/demo.json". The root itself is "".
   */
  path: string;

  type: FileNodeType;

  /**
   * For directories only: whether the directory contains any children, so a
   * tree view can decide whether to render an expand arrow. Undefined for
   * files.
   */
  hasChildren?: boolean;
}

/**
 * The virtual file system backing a file tree view. All paths are POSIX-style
 * paths relative to the storage root (the root itself is ""). Methods reject on
 * error.
 */
export interface FileSystem {
  /**
   * List the direct children of a directory (one level only, for lazy
   * loading the tree view).
   */
  ls(path: string): Promise<FileNode[]>;

  /**
   * Create a directory, creating parent directories as needed.
   */
  mkdir(path: string): Promise<void>;

  /**
   * Copy a file or directory (directories are copied recursively).
   */
  cp(src: string, dest: string): Promise<void>;

  /**
   * Move or rename a file or directory. Rejects if the destination already
   * exists; callers that explicitly support replacing an entry must remove it
   * first.
   */
  mv(src: string, dest: string): Promise<void>;

  /**
   * Remove a file or directory (directories are removed recursively).
   */
  rm(path: string): Promise<void>;
}
