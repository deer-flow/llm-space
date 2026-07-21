from langchain.tools import tool


@tool
def edit(
    description: str,
    path: str,
    old_string: str,
    new_string: str,
    replace_all: bool = False,
) -> str:
    """Performs an exact string replacement in a file.

    Performs an exact string replacement in a file. old_string must match the
    file contents exactly (including whitespace and indentation) and be unique
    unless replace_all is set. Use for surgical edits; prefer write when
    replacing the entire file.

    Args:
        description: Must be the first parameter in the tool call. A short
            human-readable summary explaining the edit being made.
        path: Absolute path to the file to edit.
        old_string: The exact text to replace (must be unique within the file
            unless replace_all is true).
        new_string: The replacement text (must differ from old_string).
        replace_all: Replace all occurrences of old_string. Defaults to false
            (first match only).
    """
    if old_string == new_string:
        raise ValueError("new_string must differ from old_string.")
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()
    occurrences = content.count(old_string)
    if occurrences == 0:
        raise ValueError("old_string was not found in the file.")
    if not replace_all and occurrences > 1:
        raise ValueError(
            f"old_string is not unique ({occurrences} matches). "
            "Provide a larger unique string or set replace_all."
        )
    if replace_all:
        updated = content.replace(old_string, new_string)
    else:
        updated = content.replace(old_string, new_string, 1)
    with open(path, "w", encoding="utf-8") as f:
        f.write(updated)
    total_replaced = occurrences if replace_all else 1
    suffix = "" if total_replaced == 1 else "s"
    return f"Replaced {total_replaced} occurrence{suffix} in {path}"
