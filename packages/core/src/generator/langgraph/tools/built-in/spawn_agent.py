from typing import Literal

from langchain.tools import tool


@tool
def spawn_agent(
    description: str,
    task_name: str,
    prompt: str,
    subagent_type: Literal["general-purpose", "researcher", "code-reviewer"] = "general-purpose",
) -> str:
    """Request manual creation of a subtask thread in the LLM Space desktop app.

    Unsupported in Python exports. This tool does not run an agent or create files.

    Args:
        description: A short (3-6 word) summary of the task.
        task_name: A short, human-readable title with natural capitalization and spaces,
            e.g. US 2026 GDP Research. The desktop app converts it to lowercase with
            hyphens only when creating the filename.
        prompt: The complete self-contained task and expected output.
        subagent_type: The task role; defaults to general-purpose.
    """
    raise NotImplementedError(
        "spawn_agent is not supported in Python exports. "
        "Create subtask threads manually in the LLM Space desktop app."
    )
