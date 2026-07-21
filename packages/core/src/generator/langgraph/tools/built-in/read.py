import os

from langchain.tools import tool

IMAGE_EXTENSIONS = {
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".webp",
    ".bmp",
    ".svg",
    ".ico",
}

# Upper bound on the bytes a single ``read`` returns. An unbounded read (no
# ``limit``) still stops here so a huge file can't blow past the model's context
# — the output is truncated with a notice pointing at ``offset``/``limit``.
READ_MAX_SIZE_BYTES = 256 * 1024


@tool
def read(
    description: str,
    path: str,
    offset: int = 1,
    limit: int | None = None,
) -> str:
    """Reads a file from the local filesystem, returning contents with line numbers.

    Reads a file from the local filesystem. Use when you need to inspect source
    code, config, or any text file. Returns file contents with line numbers; for
    images, returns a text placeholder with the file's size rather than the image
    itself. Reads the whole file by default; pass offset/limit to read a specific
    line range. Output is capped at 256KB and truncated beyond that. Prefer this
    over bash for reading files. Do NOT use read to load a skill's SKILL.md — use
    the skill tool instead, unless you specifically need to edit that skill.

    Args:
        description: Must be the first parameter in the tool call. A short
            human-readable summary explaining why this file is being read.
        path: Absolute path to the file to read.
        offset: 1-based line number to start reading from. Defaults to 1 (the
            first line).
        limit: Maximum number of lines to read from offset. Defaults to unlimited
            (the rest of the file), still capped by the 256KB output limit.
    """
    if os.path.isdir(path):
        raise ValueError(f"{path} is a directory, not a file.")
    if os.path.splitext(path)[1].lower() in IMAGE_EXTENSIONS:
        size = os.path.getsize(path)
        return f"[image file: {path} ({size} bytes)]"

    with open(path, "r", encoding="utf-8") as f:
        content = f.read()
    lines = content.split("\n")

    start = offset - 1 if offset and offset > 1 else 0
    end = start + max(0, limit) if limit is not None else len(lines)
    selected = lines[start : max(start, end)]

    # Number lines by their real position and stop once the output would exceed
    # the size cap, so an unbounded read stays bounded.
    out: list[str] = []
    num_bytes = 0
    truncated = False
    for i, line in enumerate(selected):
        rendered = f"{start + i + 1}\t{line}"
        size = len(rendered.encode("utf-8")) + 1  # + newline
        if out and num_bytes + size > READ_MAX_SIZE_BYTES:
            truncated = True
            break
        num_bytes += size
        out.append(rendered)

    result = "\n".join(out)
    if truncated:
        result += (
            f"\n... [truncated at {READ_MAX_SIZE_BYTES} bytes; "
            "pass offset/limit to read a specific range]"
        )
    return result
