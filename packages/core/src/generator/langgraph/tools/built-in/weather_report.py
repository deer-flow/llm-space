from urllib.parse import quote

import requests
from langchain.tools import tool


def _encode_wttr_city(city: str) -> str:
    parts = city.strip().split()
    return "+".join(quote(part) for part in parts)


def _get_weather_description(data: dict) -> str:
    weather = data.get("weather") or []
    today = weather[0] if weather else None

    hourly = (today or {}).get("hourly") or []
    noon = next((item for item in hourly if item.get("time") == "1200"), None)
    if noon:
        noon_desc_list = noon.get("weatherDesc") or []
        noon_desc = noon_desc_list[0].get("value") if noon_desc_list else None
        if noon_desc:
            return noon_desc

    current = data.get("current_condition") or []
    if current:
        current_desc_list = current[0].get("weatherDesc") or []
        current_desc = current_desc_list[0].get("value") if current_desc_list else None
        if current_desc:
            return current_desc

    return "Unknown"


@tool
def weather_report(location: str) -> dict:
    """Get today's weather report for a location.

    Get today's weather report for a location.

    Args:
        location: The location to get today's weather report for.
    """
    normalized_location = location.strip()
    if not normalized_location:
        raise ValueError("location is required.")
    encoded_location = _encode_wttr_city(normalized_location)

    res = requests.get(
        f"https://wttr.in/{encoded_location}?format=j1&lang=en",
        headers={
            "Accept": "application/json",
            "Accept-Language": "en",
            "User-Agent": "llm-space-weather-tool/1.0",
        },
    )

    if not res.ok:
        raise RuntimeError(f"weather_report failed: {res.status_code}")

    data = res.json()
    weather = data.get("weather") or []
    today = weather[0] if weather else None

    if (
        not today
        or not today.get("date")
        or not today.get("maxtempC")
        or not today.get("mintempC")
    ):
        raise RuntimeError("weather_report failed: missing today's forecast")

    return {
        "city": normalized_location,
        "date": today["date"],
        "weather": _get_weather_description(data),
        "temperature": {
            "unit": "celsius",
            "max": int(today["maxtempC"]),
            "min": int(today["mintempC"]),
        },
    }
