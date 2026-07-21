from langchain.tools import tool


@tool
def todo_write(todos: list[dict]) -> str:
    """Create or update the assistant's visible todo list for tracking multi-step work.

    Creates or updates the assistant's visible todo list for tracking multi-step
    work. Only use for non-trivial tasks with several concrete steps where
    tracking progress helps the user — skip it for single-step or trivial
    requests, where it just adds overhead. Each call replaces the entire list, so
    pass the full set of todos every time, and keep statuses current as work
    progresses.

    Args:
        todos: The complete set of todo items to display. Each item is a dict with:
            - content (str): Short description of the work item.
            - status (str): Current state of the todo item. One of
              "pending", "in_progress", "completed", or "cancelled".

    Returns:
        The string "OK".
    """
    # No-op: the desktop implementation simply echoes the list back to the UI and
    # returns "OK".
    return "OK"
