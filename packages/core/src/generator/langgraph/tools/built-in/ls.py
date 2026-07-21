import os

from langchain.tools import tool

# Directory and file names the traversal tools (`ls`, `glob`, `grep`) skip by
# default — dependency, version-control, build-output, and OS-cruft entries that
# add noise without signal.
DEFAULT_IGNORES = [
    "node_modules",
    ".git",
    ".svn",
    ".hg",
    ".DS_Store",
    "Thumbs.db",
    ".cache",
    ".next",
    ".nuxt",
    ".turbo",
    ".parcel-cache",
    "dist",
    "build",
    "out",
    "coverage",
    "__pycache__",
    ".pytest_cache",
    ".mypy_cache",
    ".venv",
    "venv",
]

IGNORED_NAMES = set(DEFAULT_IGNORES)


def _is_ignored(name: str) -> bool:
    """Whether a single entry name should be ignored."""
    return name in IGNORED_NAMES


@tool
def ls(description: str, path: str) -> str:
    """Lists files and directories at a given path, newest first.

    Lists files and directories at a given path. Returns entry names sorted by
    modification time (newest first). Common noise directories (node_modules,
    .git, build output, etc.) are omitted. Use to explore directory structure
    before reading or editing files.

    Args:
        description: Must be the first parameter in the tool call. A short
            human-readable summary explaining why this directory is being listed.
        path: Absolute path to the directory to list.
    """
    entries = [e for e in os.scandir(path) if not _is_ignored(e.name)]
    with_mtime: list[tuple[str, float]] = []
    for entry in entries:
        mtime_ms = 0.0
        try:
            mtime_ms = entry.stat().st_mtime * 1000
        except OSError:
            # Broken symlink or race — keep it at the bottom.
            pass
        name = f"{entry.name}/" if entry.is_dir() else entry.name
        with_mtime.append((name, mtime_ms))

    if not with_mtime:
        return f"{path} is empty."

    with_mtime.sort(key=lambda e: e[1], reverse=True)
    return "\n".join(name for name, _ in with_mtime)
