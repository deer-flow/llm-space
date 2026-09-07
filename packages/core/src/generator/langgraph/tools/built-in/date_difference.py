import re
from datetime import datetime

from langchain.tools import tool


DATE_PATTERN = re.compile(r"^(\d{4})-(\d{2})-(\d{2})$")
DATE_TIME_PATTERN = re.compile(
    r"^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$"
)
SECONDS_PER_DAY = 86_400


def _parse_date_time(value: str, field: str) -> tuple[datetime, str]:
    if not isinstance(value, str):
        raise ValueError(f"{field} must be a string.")

    date_time_match = DATE_TIME_PATTERN.fullmatch(value)
    date_match = None if date_time_match else DATE_PATTERN.fullmatch(value)
    match = date_time_match or date_match
    if match is None:
        raise ValueError(
            f"{field} must use YYYY-MM-DD or YYYY-MM-DD HH:mm:ss format."
        )

    precision = "datetime" if date_time_match else "date"
    values = [int(part) for part in match.groups()]
    year, month, day = values[:3]
    hour, minute, second = (values[3:] if date_time_match else [0, 0, 0])
    if year < 1:
        raise ValueError(f"{field} year must be between 0001 and 9999.")
    try:
        parsed = datetime(year, month, day, hour, minute, second)
    except ValueError as error:
        message = str(error)
        if "month" in message:
            detail = "an invalid month"
        elif "day" in message:
            detail = "an invalid day"
        elif "hour" in message or "minute" in message or "second" in message:
            detail = "an invalid time"
        else:
            detail = "an invalid date or time"
        raise ValueError(f"{field} contains {detail}.") from None
    return parsed, precision


def _format_unit(value: int, unit: str) -> str:
    suffix = "" if value == 1 else "s"
    return f"{value} {unit}{suffix}"


def _format_duration(total_seconds: int) -> str:
    days, remaining = divmod(total_seconds, SECONDS_PER_DAY)
    hours, remaining = divmod(remaining, 3_600)
    minutes, seconds = divmod(remaining, 60)
    parts = []
    if days > 0:
        parts.append(_format_unit(days, "day"))
    if hours > 0:
        parts.append(_format_unit(hours, "hour"))
    if minutes > 0:
        parts.append(_format_unit(minutes, "minute"))
    if seconds > 0:
        parts.append(_format_unit(seconds, "second"))
    return ", ".join(parts) if parts else "0 seconds"


@tool
def date_difference(
    start: str,
    end: str,
    include_start: bool = True,
    include_end: bool = False,
) -> str:
    """Calculate the difference between two dates or date-times.

    You must use this tool for every task that involves calculating a date,
    time, duration, or interval difference, even when the calculation seems
    simple; never calculate the result yourself. Inputs must both use either
    YYYY-MM-DD or YYYY-MM-DD HH:mm:ss. The calculation is timezone-free. By
    default it includes the start and excludes the end ([start, end)).

    Args:
        start: The earlier boundary in YYYY-MM-DD or YYYY-MM-DD HH:mm:ss format.
        end: The later boundary, using the same format and precision as start.
        include_start: Whether to include the start boundary.
        include_end: Whether to include the end boundary.

    Returns:
        A human-readable duration with explicit units.
    """
    if not isinstance(include_start, bool):
        raise ValueError("include_start must be a boolean.")
    if not isinstance(include_end, bool):
        raise ValueError("include_end must be a boolean.")

    parsed_start, start_precision = _parse_date_time(start, "start")
    parsed_end, end_precision = _parse_date_time(end, "end")
    if start_precision != end_precision:
        raise ValueError(
            "start and end must use the same format and precision: "
            "both dates or both date-times."
        )
    if parsed_end < parsed_start:
        raise ValueError("end must not be earlier than start.")

    unit_seconds = SECONDS_PER_DAY if start_precision == "date" else 1
    elapsed_seconds = int((parsed_end - parsed_start).total_seconds())
    adjusted_seconds = max(
        0,
        elapsed_seconds
        + (unit_seconds if include_end else 0)
        - (0 if include_start else unit_seconds),
    )
    if start_precision == "date":
        return _format_unit(adjusted_seconds // SECONDS_PER_DAY, "day")
    return _format_duration(adjusted_seconds)
