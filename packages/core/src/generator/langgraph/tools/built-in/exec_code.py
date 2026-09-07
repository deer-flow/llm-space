import atexit
import json
import os
import queue
import shutil
import subprocess
import sys
import threading
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal, Optional

from langchain.tools import tool


DEFAULT_TIMEOUT_MS = 120_000
MAX_TIMEOUT_MS = 600_000
MAX_SESSIONS = 8
SESSION_IDLE_TTL_SECONDS = 30 * 60
WORKSPACE_ROOT = os.getcwd()


PYTHON_WORKER_SOURCE = r'''
import ast
import contextlib
import io
import json
import os
import sys
import traceback

protocol_in = sys.stdin
protocol_out = sys.stdout
namespace = {"__name__": "__main__"}
execution_count = 0

for line in protocol_in:
    request = json.loads(line)
    execution_count += 1
    stdout_buffer = io.StringIO()
    stderr_buffer = io.StringIO()
    result_text = None
    exit_code = 0
    original_stdin = sys.stdin
    try:
        os.chdir(request["cwd"])
        sys.stdin = io.StringIO("")
        with contextlib.redirect_stdout(stdout_buffer), contextlib.redirect_stderr(stderr_buffer):
            tree = ast.parse(request["code"], mode="exec")
            if tree.body and isinstance(tree.body[-1], ast.Expr):
                statements = ast.Module(body=tree.body[:-1], type_ignores=[])
                ast.fix_missing_locations(statements)
                exec(compile(statements, "<exec_code>", "exec"), namespace)
                expression = ast.Expression(tree.body[-1].value)
                ast.fix_missing_locations(expression)
                value = eval(compile(expression, "<exec_code>", "eval"), namespace)
                namespace["_"] = value
                if value is not None:
                    result_text = repr(value)
            else:
                exec(compile(tree, "<exec_code>", "exec"), namespace)
    except BaseException:
        exit_code = 1
        traceback.print_exc(file=stderr_buffer)
    finally:
        sys.stdin = original_stdin
    response = {
        "request_id": request["request_id"],
        "execution_count": execution_count,
        "stdout": stdout_buffer.getvalue(),
        "stderr": stderr_buffer.getvalue(),
        "result": result_text,
        "exit_code": exit_code,
        "cwd": os.getcwd(),
    }
    protocol_out.write(json.dumps(response, ensure_ascii=False) + "\n")
    protocol_out.flush()
'''


BUN_WORKER_SOURCE = r'''
import vm from "node:vm";
import { createRequire } from "node:module";
import { inspect, format } from "node:util";
import { createInterface } from "node:readline";

const protocolWrite = process.stdout.write.bind(process.stdout);
let executionCount = 0;
let stdout = "";
let stderr = "";
const notebookConsole = {
  log: (...args) => { stdout += format(...args) + "\n"; },
  info: (...args) => { stdout += format(...args) + "\n"; },
  debug: (...args) => { stdout += format(...args) + "\n"; },
  warn: (...args) => { stderr += format(...args) + "\n"; },
  error: (...args) => { stderr += format(...args) + "\n"; },
};
const context = vm.createContext({
  Bun,
  Buffer,
  URL,
  URLSearchParams,
  TextEncoder,
  TextDecoder,
  AbortController,
  AbortSignal,
  Blob,
  Request,
  Response,
  Headers,
  fetch,
  structuredClone,
  crypto,
  process,
  console: notebookConsole,
  require: createRequire(import.meta.url),
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  queueMicrotask,
});
const transpiler = new Bun.Transpiler({ loader: "ts", target: "bun" });
const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });

for await (const line of lines) {
  const request = JSON.parse(line);
  executionCount += 1;
  stdout = "";
  stderr = "";
  let result = null;
  let exitCode = 0;
  const originalStdoutWrite = process.stdout.write;
  const originalStderrWrite = process.stderr.write;
  process.stdout.write = ((chunk, encoding, callback) => {
    stdout += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString(typeof encoding === "string" ? encoding : "utf8");
    if (typeof encoding === "function") encoding();
    if (typeof callback === "function") callback();
    return true;
  });
  process.stderr.write = ((chunk, encoding, callback) => {
    stderr += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString(typeof encoding === "string" ? encoding : "utf8");
    if (typeof encoding === "function") encoding();
    if (typeof callback === "function") callback();
    return true;
  });
  try {
    process.chdir(request.cwd);
    const javascript = transpiler.transformSync(request.code);
    let value = vm.runInContext(javascript, context, { filename: "<exec_code>" });
    if (value && typeof value.then === "function") value = await value;
    context._ = value;
    if (value !== undefined) result = inspect(value, { depth: 5, colors: false, maxArrayLength: 100 });
  } catch (error) {
    exitCode = 1;
    stderr += (error && error.stack ? error.stack : String(error)) + "\n";
  } finally {
    process.stdout.write = originalStdoutWrite;
    process.stderr.write = originalStderrWrite;
  }
  protocolWrite(JSON.stringify({
    request_id: request.request_id,
    execution_count: executionCount,
    stdout,
    stderr,
    result,
    exit_code: exitCode,
    cwd: process.cwd(),
  }) + "\n");
}
'''


@dataclass
class CodeSession:
    id: str
    runtime: str
    process: subprocess.Popen
    cwd: str
    last_used_at: float = field(default_factory=time.monotonic)
    lock: threading.Lock = field(default_factory=threading.Lock)


SESSIONS: dict[str, CodeSession] = {}
SESSIONS_LOCK = threading.Lock()


def _resolve_cwd(requested_cwd: Optional[str], fallback: str) -> str:
    if requested_cwd:
        requested_path = Path(requested_cwd).expanduser()
        resolved = (
            requested_path
            if requested_path.is_absolute()
            else Path(WORKSPACE_ROOT) / requested_path
        ).resolve()
    else:
        resolved = Path(fallback).resolve()
    if not resolved.exists():
        raise ValueError(f"cwd does not exist: {resolved}")
    if not resolved.is_dir():
        raise ValueError(f"cwd is not a directory: {resolved}")
    return str(resolved)


def _destroy_session(session: CodeSession) -> None:
    with SESSIONS_LOCK:
        if SESSIONS.get(session.id) is session:
            del SESSIONS[session.id]
    if session.process.poll() is None:
        session.process.kill()
    try:
        session.process.wait(timeout=1)
    except subprocess.TimeoutExpired:
        pass


def _prune_sessions() -> None:
    cutoff = time.monotonic() - SESSION_IDLE_TTL_SECONDS
    with SESSIONS_LOCK:
        idle = [
            session
            for session in SESSIONS.values()
            if session.last_used_at < cutoff and not session.lock.locked()
        ]
    for session in idle:
        _destroy_session(session)


def _spawn_session(runtime: str, cwd: str) -> CodeSession:
    _prune_sessions()
    with SESSIONS_LOCK:
        while len(SESSIONS) >= MAX_SESSIONS:
            candidates = [
                session for session in SESSIONS.values() if not session.lock.locked()
            ]
            if not candidates:
                raise RuntimeError("All code sessions are currently busy.")
            oldest = min(candidates, key=lambda session: session.last_used_at)
            del SESSIONS[oldest.id]
            if oldest.process.poll() is None:
                oldest.process.kill()

        if runtime == "python":
            command = [sys.executable, "-u", "-c", PYTHON_WORKER_SOURCE]
        else:
            bun = shutil.which("bun")
            if bun is None:
                raise RuntimeError(
                    "Bun runtime is unavailable: bun was not found on PATH."
                )
            command = [bun, "-e", BUN_WORKER_SOURCE]
        process = subprocess.Popen(
            command,
            cwd=WORKSPACE_ROOT,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,
        )
        session = CodeSession(
            id=f"code_{uuid.uuid4()}", runtime=runtime, process=process, cwd=cwd
        )
        SESSIONS[session.id] = session
        return session


def _get_session(session_id: str, runtime: str) -> CodeSession:
    _prune_sessions()
    with SESSIONS_LOCK:
        session = SESSIONS.get(session_id)
    if session is None or session.process.poll() is not None:
        if session is not None:
            _destroy_session(session)
        raise ValueError(
            f"Code session not found or expired: {session_id}. "
            "Pass session_id null to create a new session."
        )
    if session.runtime != runtime:
        raise ValueError(
            f'Code session {session_id} uses runtime "{session.runtime}", '
            f'not "{runtime}".'
        )
    return session


def _readline(stream, output: queue.Queue) -> None:
    output.put(stream.readline())


def _execute_cell(
    session: CodeSession, code: str, cwd: str, timeout_ms: float
) -> dict:
    with session.lock:
        if session.process.poll() is not None:
            _destroy_session(session)
            raise RuntimeError(f"Code session exited unexpectedly: {session.id}.")
        request_id = str(uuid.uuid4())
        request = {"request_id": request_id, "code": code, "cwd": cwd}
        try:
            session.process.stdin.write(json.dumps(request) + "\n")
            session.process.stdin.flush()
        except (BrokenPipeError, OSError) as error:
            _destroy_session(session)
            raise RuntimeError(f"Code session exited unexpectedly: {session.id}.") from error

        output: queue.Queue = queue.Queue(maxsize=1)
        reader = threading.Thread(
            target=_readline, args=(session.process.stdout, output), daemon=True
        )
        reader.start()
        try:
            line = output.get(timeout=timeout_ms / 1000)
        except queue.Empty:
            _destroy_session(session)
            raise TimeoutError(
                f"Code execution timed out after {timeout_ms:g}ms; "
                f"session {session.id} was destroyed."
            ) from None
        if not line:
            details = session.process.stderr.read().strip()
            _destroy_session(session)
            suffix = f": {details}" if details else "."
            raise RuntimeError(f"Code session exited unexpectedly{suffix}")
        response = json.loads(line)
        if response.get("request_id") != request_id:
            _destroy_session(session)
            raise RuntimeError("Code session returned an unexpected response.")
        del response["request_id"]
        session.cwd = response["cwd"]
        session.last_used_at = time.monotonic()
        return {"session_id": session.id, **response}


@atexit.register
def _shutdown_sessions() -> None:
    with SESSIONS_LOCK:
        sessions = list(SESSIONS.values())
        SESSIONS.clear()
    for session in sessions:
        if session.process.poll() is None:
            session.process.kill()


@tool
def exec_code(
    description: str,
    runtime: Literal["python", "bun"],
    code: str,
    session_id: Optional[str],
    cwd: Optional[str] = None,
    timeout_ms: float = DEFAULT_TIMEOUT_MS,
) -> dict:
    """Execute code in a persistent notebook-style session.

    Pass session_id null to create a session, then reuse the returned session_id
    to retain variables, imports, and working-directory state. You must use
    runtime ``bun`` whenever executing JavaScript or TypeScript. Use this tool
    for arithmetic and scientific calculations, CodeAct-style workflows,
    multi-step computation, data processing, and verifiable logic. For
    exploratory or advanced data analysis, use runtime ``python`` and reuse the
    returned session_id across calls so variables, imports, loaded datasets,
    and intermediate results remain available. Sessions expire after 30 minutes
    of inactivity.

    Args:
        description: A short explanation of what the code does and why.
        runtime: ``python`` for Python or ``bun`` for JavaScript/TypeScript.
        code: Source code for this notebook cell. Its last expression is
            returned without requiring print(). In Bun sessions, load modules
            with require() rather than static import declarations.
        session_id: Null to create a session, or a returned ID to continue one.
        cwd: Optional working directory. Relative paths use the workspace root.
        timeout_ms: Optional timeout in milliseconds; defaults to 120000 and is
            capped at 600000. A timeout destroys the session.

    Returns:
        Session ID, execution count, stdout, stderr, last result, exit code,
        and current working directory.
    """
    del description
    if runtime not in ("python", "bun"):
        raise ValueError('runtime must be either "python" or "bun".')
    if not isinstance(code, str) or not code.strip():
        raise ValueError("code must be a non-empty string.")
    if session_id is not None and not isinstance(session_id, str):
        raise ValueError("session_id must be a string or null.")
    if cwd is not None and not isinstance(cwd, str):
        raise ValueError("cwd must be a string when provided.")
    if (
        not isinstance(timeout_ms, (int, float))
        or isinstance(timeout_ms, bool)
        or timeout_ms <= 0
    ):
        raise ValueError("timeout_ms must be a positive number.")

    session = (
        _get_session(session_id, runtime)
        if session_id
        else _spawn_session(runtime, _resolve_cwd(cwd, WORKSPACE_ROOT))
    )
    requested_cwd = _resolve_cwd(cwd, session.cwd)
    return _execute_cell(
        session, code, requested_cwd, min(timeout_ms, MAX_TIMEOUT_MS)
    )
