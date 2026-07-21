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

# Default and safety-cap depths for `tree`.
TREE_DEFAULT_DEPTH = 5
TREE_MAX_DEPTH = 20


def _is_ignored(name: str) -> bool:
    """Whether a single entry name should be ignored."""
    return name in IGNORED_NAMES


def _build_tree(
    directory: str, prefix: str, remaining: int, lines: list[str]
) -> None:
    """Append a directory's children to ``lines`` as tree rows.

    Recurses up to ``remaining`` more levels. Directories sort before files,
    ignored names are skipped, and symlinks are not descended into (avoiding
    loops).
    """
    if remaining <= 0:
        return
    try:
        entries = list(os.scandir(directory))
    except OSError:
        # Unreadable directory (permissions, race) — render it as a leaf.
        return
    visible = sorted(
        (e for e in entries if not _is_ignored(e.name)),
        key=lambda e: (0 if e.is_dir() else 1, e.name),
    )

    for i, entry in enumerate(visible):
        last = i == len(visible) - 1
        is_dir = entry.is_dir()
        connector = "└── " if last else "├── "
        suffix = "/" if is_dir else ""
        lines.append(f"{prefix}{connector}{entry.name}{suffix}")
        if is_dir:
            child_prefix = f"{prefix}{'    ' if last else '│   '}"
            _build_tree(
                os.path.join(directory, entry.name),
                child_prefix,
                remaining - 1,
                lines,
            )


@tool
def tree(description: str, path: str, max_depth: int = TREE_DEFAULT_DEPTH) -> str:
    """Prints a directory as an indented tree up to a maximum depth.

    Prints a directory as an indented tree up to a maximum depth (default 5
    levels). Common noise directories (node_modules, .git, build output, etc.)
    are skipped. Use to understand a project's layout at a glance before reading
    individual files.

    Args:
        description: Must be the first parameter in the tool call. A short
            human-readable summary explaining why this tree is being generated.
        path: Absolute path to the directory to print as a tree.
        max_depth: Maximum directory depth to descend. Defaults to 5, capped at
            20.
    """
    if not os.path.isdir(path):
        raise ValueError(f"{path} is not a directory.")
    if max_depth is not None and max_depth > 0:
        depth = min(int(max_depth), TREE_MAX_DEPTH)
    else:
        depth = TREE_DEFAULT_DEPTH

    lines = [path]
    _build_tree(path, "", depth, lines)
    if len(lines) == 1:
        return f"{path} is empty."
    return "\n".join(lines)
