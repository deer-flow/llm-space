"""Built-in prompt variables, ported from LLM Space (``prompt-variables.ts``).

These mirror the values LLM Space substitutes into prompt templates:

- ``current_date(format)`` — the current local date/time in one of three formats.
- ``available_skills(paths, format, indent)`` — a listing of skills (name +
  one-line description + base path) without inlining their full instructions.
"""

import re
from datetime import datetime, timedelta
from pathlib import Path

# -- current_date -------------------------------------------------------------

# English weekday names, indexed by ``date.weekday()`` (Monday == 0). Fixed
# rather than ``strftime("%A")`` so the output is locale-independent, matching
# the desktop's ``Intl.DateTimeFormat("en", ...)``.
_WEEKDAYS = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
]


def current_date(format: str = "readable-date") -> str:
    """Format the current system date in a stable, local-time representation.

    Args:
        format: One of:
            - ``"readable-date"`` (default) — ``"2026-07-21, Tuesday"``.
            - ``"iso-date"`` — ``"2026-07-21"``.
            - ``"local-date-time"`` —
              ``"2026-07-21 15:04:05 GMT+08:00 (Asia/Shanghai)"``.
            Any unrecognized value falls back to ``"readable-date"``.
    """
    now = datetime.now().astimezone()
    date_text = now.strftime("%Y-%m-%d")

    if format == "iso-date":
        return date_text
    if format == "local-date-time":
        time_text = now.strftime("%H:%M:%S")
        return f"{date_text} {time_text} {_gmt_offset(now)} ({_time_zone_name(now)})"
    # "readable-date" (default)
    return f"{date_text}, {_WEEKDAYS[now.weekday()]}"


def _gmt_offset(dt: datetime) -> str:
    """Local UTC offset as ``GMT+HH:MM`` / ``GMT-HH:MM``."""
    offset = dt.utcoffset() or timedelta(0)
    total_minutes = int(offset.total_seconds() // 60)
    sign = "+" if total_minutes >= 0 else "-"
    absolute = abs(total_minutes)
    return f"GMT{sign}{absolute // 60:02d}:{absolute % 60:02d}"


def _time_zone_name(dt: datetime) -> str:
    """Best-effort local time-zone label.

    The desktop uses the IANA zone name (e.g. ``Asia/Shanghai``) from
    ``Intl.DateTimeFormat``. The standard library can't reliably recover that
    key, so this falls back to the local abbreviation (e.g. ``CST``).
    """
    return dt.tzname() or "local"


# -- available_skills ---------------------------------------------------------


def available_skills(
    paths: list[str],
    format: str = "xml",
    indent: int = 0,
) -> str:
    """Format a group of skills without inlining their full instructions.

    Each path is a skill base directory (or its ``SKILL.md``); the skill's
    ``name`` and one-line ``description`` are read from the ``SKILL.md`` YAML
    frontmatter.

    Args:
        paths: Skill directories (or ``SKILL.md`` file paths) to include.
        format: One of:
            - ``"xml"`` (default) — an ``<available-skills>`` block with one
              ``<skill name="..." path="...">description</skill>`` per skill.
            - ``"markdown-list"`` — ``- **name**: description`` entries joined by
              blank lines.
            Any unrecognized value falls back to ``"xml"``.
        indent: Number of leading spaces to add to every line. One of ``0``
            (default), ``2``, or ``4``; other values are treated as ``0``.
    """
    skills = [_load_skill(path) for path in paths]
    value = (
        _format_skills_markdown_list(skills)
        if format == "markdown-list"
        else _format_skills_xml(skills)
    )
    return _indent_lines(value, indent)


def _load_skill(path: str) -> dict:
    """Read a skill's ``name``/``description``/base ``path`` from its SKILL.md."""
    p = Path(path)
    md = p / "SKILL.md" if p.is_dir() else p
    base_dir = str(md.parent)
    name = md.parent.name
    description = ""
    try:
        name, description = _parse_frontmatter(
            md.read_text(encoding="utf-8"), fallback_name=name
        )
    except OSError:
        pass  # Missing/unreadable SKILL.md — fall back to the directory name.
    return {"name": name, "description": description, "path": base_dir}


def _parse_frontmatter(text: str, fallback_name: str) -> tuple[str, str]:
    """Pull ``name`` and ``description`` from a leading ``---`` YAML frontmatter
    block. Values may be quoted; missing keys fall back to sensible defaults."""
    name = fallback_name
    description = ""
    match = re.match(r"^---\s*\n(.*?)\n---\s*(?:\n|$)", text, re.DOTALL)
    if not match:
        return name, description
    for line in match.group(1).splitlines():
        field = re.match(r"\s*(name|description)\s*:\s*(.*)$", line)
        if not field:
            continue
        value = field.group(2).strip().strip("'\"")
        if field.group(1) == "name" and value:
            name = value
        elif field.group(1) == "description":
            description = value
    return name, description


def _format_skills_xml(skills: list[dict]) -> str:
    lines = ["<available-skills>"]
    for skill in skills:
        lines.append(
            f'<skill name="{_escape_xml(skill["name"])}" '
            f'path="{_escape_xml(skill["path"])}">'
        )
        lines.append(_escape_xml(_single_line(skill["description"])))
        lines.append("</skill>")
    lines.append("</available-skills>")
    return "\n".join(lines)


def _format_skills_markdown_list(skills: list[dict]) -> str:
    return "\n\n".join(
        f"- **{_escape_markdown_code(skill['name'])}**: "
        f"{_single_line(skill['description'])}"
        for skill in skills
    )


def _indent_lines(value: str, indent: int) -> str:
    normalized = _normalize_indent(indent)
    if normalized == 0:
        return value
    prefix = " " * normalized
    return "\n".join(f"{prefix}{line}" for line in value.split("\n"))


def _normalize_indent(value: int) -> int:
    return value if value in (2, 4) else 0


def _single_line(value: str) -> str:
    return re.sub(r"\s+", " ", value.strip()) or "No description"


def _escape_xml(value: str) -> str:
    return (
        value.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


def _escape_markdown_code(value: str) -> str:
    return value.replace("`", "\\`")
