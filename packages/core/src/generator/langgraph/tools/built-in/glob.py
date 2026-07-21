import os
from pathlib import Path

from langchain.tools import tool

# Common noise directories/files skipped while walking. Copied verbatim from
# the desktop TypeScript tool.
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

_IGNORED_NAMES = set(DEFAULT_IGNORES)


def _has_ignored_segment(relative_path: str) -> bool:
    """Whether any segment of a relative path is an ignored name."""
    return any(
        segment in _IGNORED_NAMES
        for segment in relative_path.replace("\\", "/").split("/")
    )


@tool
def glob(
    description: str,
    glob_pattern: str,
    target_directory: str | None = None,
) -> str:
    """Find files matching a glob pattern, sorted by modification time.

    Find files matching a glob pattern, sorted by modification time (newest
    first). Common noise directories (node_modules, .git, build output, etc.)
    are skipped. Use when you need to locate files by name or extension rather
    than search their contents.

    Args:
        description: Must be the first parameter in the tool call. A short
            human-readable summary explaining what files are being searched for.
        glob_pattern: Glob pattern to match (e.g. "*.ts", "**/test_*.ts").
        target_directory: Absolute path to the directory to search in. Defaults
            to the current working directory if omitted (the desktop tool
            defaults to the workspace root).
    """
    root = target_directory if target_directory is not None else os.getcwd()
    root_path = Path(root)

    matches: list[tuple[str, float]] = []
    # rglob with dotfiles included mirrors Bun.Glob scan({ dot: true }).
    for full in root_path.rglob(glob_pattern):
        try:
            relative = str(full.relative_to(root_path))
        except ValueError:
            relative = str(full)
        if _has_ignored_segment(relative):
            continue
        try:
            mtime = full.stat().st_mtime
        except OSError:
            # File vanished between scan and stat — skip it.
            continue
        matches.append((str(full.resolve()), mtime))

    if not matches:
        return "No files matched."

    matches.sort(key=lambda m: m[1], reverse=True)
    return "\n".join(path for path, _ in matches)
