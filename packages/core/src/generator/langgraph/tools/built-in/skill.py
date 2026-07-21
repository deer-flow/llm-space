from pathlib import Path

from langchain.tools import tool


@tool
def skill(name: str) -> str:
    """Load a skill within the main conversation.

    Load a skill within the main conversation. When users ask you to perform
    tasks, check if any of the available skills match. Skills provide
    specialized capabilities and domain knowledge. Prefer this over read for
    loading a skill's instructions.

    Args:
        name: The name of the skill to load (its SKILL.md `name`).
    """
    # The desktop version resolves skills through an injected registry
    # (findSkill). Here we do a best-effort lookup for a SKILL.md under the
    # conventional skills directories relative to the current working directory.
    for base in (Path("skills"), Path(".agents") / "skills"):
        skill_md = base / name / "SKILL.md"
        if skill_md.is_file():
            content = skill_md.read_text(encoding="utf-8")
            return f"Base directory for this skill: {skill_md.parent}\n\n{content.strip()}"
    raise ValueError(f'Skill "{name}" not found.')
