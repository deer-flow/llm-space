import subprocess

from langchain.tools import tool

BASH_DEFAULT_TIMEOUT_MS = 120_000
BASH_MAX_TIMEOUT_MS = 600_000


@tool
def bash(description: str, command: str, timeout: int = 120000) -> dict:
    """Execute a bash command and return stdout, stderr, and exit code.

    Executes a bash command and returns stdout, stderr, and exit code. Each
    invocation runs in a fresh shell — cwd, exported variables, and other shell
    state do not persist. Every command must be self-contained: re-cd to the
    target directory, re-export env vars, and re-source files as needed on every
    call.

    Args:
        description: Must be the first parameter in the tool call. A short
            human-readable summary explaining the purpose of the command.
        command: The bash command to execute. Must be self-contained — include
            cd, export, and any other setup inline, because prior invocations
            leave no lasting shell state.
        timeout: Timeout in milliseconds (max 600000ms, 120000ms by default).
    """
    timeout_ms = min(
        timeout if timeout is not None else BASH_DEFAULT_TIMEOUT_MS,
        BASH_MAX_TIMEOUT_MS,
    )
    # subprocess expects seconds; the tool contract is milliseconds.
    result = subprocess.run(
        ["bash", "-c", command],
        capture_output=True,
        text=True,
        timeout=timeout_ms / 1000,
    )
    return {
        "stdout": result.stdout,
        "stderr": result.stderr,
        "exit_code": result.returncode,
    }
