import os

from langchain.tools import tool


@tool
def write(description: str, path: str, contents: str) -> str:
    """Writes content to a file on the local filesystem, creating parent dirs.

    Writes content to a file on the local filesystem, creating parent
    directories if needed. Overwrites the file if it already exists. Use for
    creating new files or fully replacing file contents.

    Args:
        description: Must be the first parameter in the tool call. A short
            human-readable summary explaining what is being written and why.
        path: Absolute path to the file to write.
        contents: The full text content to write to the file.
    """
    parent = os.path.dirname(path)
    if parent:
        os.makedirs(parent, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(contents)
    num_bytes = len(contents.encode("utf-8"))
    return f"Wrote {num_bytes} bytes to {path}"
