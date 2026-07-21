import os
import subprocess
import sys
import webbrowser
from pathlib import Path

from langchain.tools import tool


def _is_html_file(file_path: str) -> bool:
    ext = Path(file_path).suffix.lower()
    return ext in (".html", ".htm")


def _reveal_in_file_manager(file_path: str) -> None:
    # The desktop version uses a native "Reveal in Finder" action. Here we do a
    # best-effort reveal per platform, falling back to opening the enclosing
    # folder.
    if sys.platform == "darwin":
        subprocess.run(["open", "-R", file_path], check=False)
    elif os.name == "nt":
        subprocess.run(["explorer", "/select,", file_path], check=False)
    else:
        folder = str(Path(file_path).parent)
        subprocess.run(["xdg-open", folder], check=False)


@tool
def present_files(description: str, paths: list[str]) -> str:
    """Present files to the user so they can see or download them.

    You should always use this tool to present the artifacts and foundings after
    each creation or edit. Other wise the user won't be able to "see" them. Use
    when delivering final artifacts, reports, charts, or other outputs the user
    should see or download.

    HTML files are opened directly with the OS default handler (so a generated
    page renders in the browser); everything else is revealed in the file
    manager (Finder on macOS, Explorer on Windows, the enclosing folder on
    Linux).

    Args:
        description: Must be the first parameter in the tool call. A short
            human-readable summary explaining what files are being presented and
            why.
        paths: Absolute paths to the files to present to the user.
    """
    for p in paths:
        if _is_html_file(p):
            webbrowser.open(Path(p).resolve().as_uri())
        else:
            _reveal_in_file_manager(p)
    return "OK"
