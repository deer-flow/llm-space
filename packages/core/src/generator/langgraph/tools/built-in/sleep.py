import math
import time

from langchain.tools import tool


@tool
def sleep(description: str, duration_ms: int) -> str:
    """Pause for a given number of milliseconds before returning.

    Pause for a given number of milliseconds before returning. Use to wait
    between polling steps or to space out actions.

    Args:
        description: Must be the first parameter in the tool call. A short
            human-readable summary explaining why the sleep is being performed.
        duration_ms: How long to sleep, in milliseconds.

    Returns:
        The string "OK".
    """
    if (
        not isinstance(duration_ms, (int, float))
        or isinstance(duration_ms, bool)
        or not math.isfinite(duration_ms)
        or duration_ms < 0
    ):
        raise ValueError("duration_ms must be a non-negative number.")
    time.sleep(duration_ms / 1000)
    return "OK"
