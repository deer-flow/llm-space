import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";
import { stat } from "node:fs/promises";
import path from "node:path";

import type { BuiltinTool } from "@llm-space/core";

import type { ToolEntry } from "../tool-registry";

const DEFAULT_TIMEOUT_MS = 120_000;
const MAX_TIMEOUT_MS = 600_000;
const MAX_SESSIONS = 8;
const SESSION_IDLE_TTL_MS = 30 * 60 * 1_000;
const REAPER_INTERVAL_MS = 60_000;

export type ExecCodeRuntime = "python" | "bun";

export interface ExecCodeResult {
  session_id: string;
  execution_count: number;
  stdout: string;
  stderr: string;
  result: string | null;
  exit_code: number;
  cwd: string;
}

interface WorkerResponse extends Omit<ExecCodeResult, "session_id"> {
  request_id: string;
}

interface PendingRequest {
  requestId: string;
  resolve: (response: WorkerResponse) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

interface CodeSession {
  id: string;
  runtime: ExecCodeRuntime;
  child: ChildProcessWithoutNullStreams;
  cwd: string;
  lastUsedAt: number;
  stdoutBuffer: string;
  workerStderr: string;
  pending: PendingRequest | null;
  queue: Promise<void>;
  activeOperations: number;
  closed: boolean;
}

export const execCodeTool: BuiltinTool = {
  type: "builtin",
  name: "exec_code",
  icon: "code-2",
  description:
    'Execute Python, JavaScript, or TypeScript code in a persistent notebook-style session and return stdout, stderr, the last expression result, and execution metadata. Pass session_id null to create a session, then reuse the returned session_id to keep variables, imports, and working-directory state. You must use this tool with runtime "bun" whenever you need to execute a JavaScript or TypeScript script. Use it for CodeAct-style workflows, exploratory data analysis, advanced data analysis, multi-step computation, data processing, and verifiable logic. Sessions are isolated from one another and expire after inactivity. Use dedicated file tools instead when the task is simply to read or modify files.',
  strict: true,
  parameters: {
    type: "object",
    required: ["description", "runtime", "code", "session_id"],
    properties: {
      description: {
        type: "string",
        description:
          "Must be the first parameter. A short human-readable explanation of what the code does and why it is being run.",
      },
      runtime: {
        type: "string",
        enum: ["python", "bun"],
        description:
          "The execution runtime. Use python for Python and bun for JavaScript or TypeScript.",
      },
      code: {
        type: "string",
        description:
          "Source code for this notebook cell. The last expression is returned as result without requiring print(). In Bun sessions, load modules with require() rather than static import declarations.",
      },
      session_id: {
        anyOf: [{ type: "string" }, { type: "null" }],
        description:
          "Pass null to create a new session. To retain variables and imports, pass the session_id returned by the previous call and keep runtime unchanged.",
      },
      cwd: {
        type: "string",
        description:
          "Optional working directory for this cell. Relative paths resolve from the workspace root. If omitted, a new session starts at the workspace root and an existing session keeps its current directory.",
      },
      timeout_ms: {
        type: "number",
        description:
          "Optional execution timeout in milliseconds. Defaults to 120000 and is capped at 600000. A timeout destroys the session.",
        default: DEFAULT_TIMEOUT_MS,
      },
    },
    additionalProperties: false,
  },
};

export class ExecCodeSessionManager {
  private readonly sessions = new Map<string, CodeSession>();
  private reaper: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly workspaceRoot: string) {}

  start(): void {
    if (this.reaper) return;
    this.reaper = setInterval(() => this.pruneIdleSessions(), REAPER_INTERVAL_MS);
    this.reaper.unref();
  }

  async execute({
    runtime,
    code,
    sessionId,
    cwd,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  }: {
    runtime: ExecCodeRuntime;
    code: string;
    sessionId: string | null;
    cwd?: string;
    timeoutMs?: number;
  }): Promise<ExecCodeResult> {
    validateExecutionInput(runtime, code, timeoutMs);
    const session = sessionId
      ? this.getSession(sessionId, runtime)
      : await this.createSession(runtime, cwd);
    const effectiveTimeoutMs = Math.min(timeoutMs, MAX_TIMEOUT_MS);
    session.activeOperations += 1;
    session.lastUsedAt = Date.now();

    let resolveOperation!: (value: ExecCodeResult) => void;
    let rejectOperation!: (error: Error) => void;
    const operation = new Promise<ExecCodeResult>((resolve, reject) => {
      resolveOperation = resolve;
      rejectOperation = reject;
    });
    session.queue = session.queue.then(async () => {
      try {
        const requestedCwd = await this.resolveCwd(cwd, session.cwd);
        const response = await this.sendRequest(
          session,
          code,
          requestedCwd,
          effectiveTimeoutMs
        );
        session.cwd = response.cwd;
        session.lastUsedAt = Date.now();
        resolveOperation({
          session_id: session.id,
          execution_count: response.execution_count,
          stdout: response.stdout,
          stderr: response.stderr,
          result: response.result,
          exit_code: response.exit_code,
          cwd: response.cwd,
        });
      } catch (error) {
        rejectOperation(asError(error));
      } finally {
        session.activeOperations -= 1;
      }
    });
    return operation;
  }

  async shutdown(): Promise<void> {
    if (this.reaper) {
      clearInterval(this.reaper);
      this.reaper = null;
    }
    for (const session of [...this.sessions.values()]) {
      this.destroySession(session, new Error("Code session was closed."));
    }
    await Promise.resolve();
  }

  private async createSession(
    runtime: ExecCodeRuntime,
    cwd?: string
  ): Promise<CodeSession> {
    while (this.sessions.size >= MAX_SESSIONS) {
      const oldest = [...this.sessions.values()]
        .filter((session) => session.activeOperations === 0)
        .sort((left, right) => left.lastUsedAt - right.lastUsedAt)[0];
      if (!oldest) {
        throw new Error("All code sessions are currently busy.");
      }
      this.destroySession(
        oldest,
        new Error("Code session was evicted to make room for a new session.")
      );
    }
    const initialCwd = await this.resolveCwd(cwd, this.workspaceRoot);
    const child = spawnWorker(runtime, this.workspaceRoot);
    const session: CodeSession = {
      id: `code_${randomUUID()}`,
      runtime,
      child,
      cwd: initialCwd,
      lastUsedAt: Date.now(),
      stdoutBuffer: "",
      workerStderr: "",
      pending: null,
      queue: Promise.resolve(),
      activeOperations: 0,
      closed: false,
    };
    this.sessions.set(session.id, session);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => this.onStdout(session, chunk));
    child.stderr.on("data", (chunk: string) => {
      session.workerStderr += chunk;
    });
    child.on("error", (error) => this.destroySession(session, error));
    child.on("close", (exitCode) => {
      if (!session.closed) {
        const detail = session.workerStderr.trim();
        this.destroySession(
          session,
          new Error(
            `Code session exited unexpectedly with code ${exitCode ?? "unknown"}${detail ? `: ${detail}` : "."}`
          )
        );
      }
    });
    return session;
  }

  private getSession(id: string, runtime: ExecCodeRuntime): CodeSession {
    const session = this.sessions.get(id);
    if (!session || session.closed) {
      throw new Error(
        `Code session not found or expired: ${id}. Pass session_id null to create a new session.`
      );
    }
    if (session.runtime !== runtime) {
      throw new Error(
        `Code session ${id} uses runtime "${session.runtime}", not "${runtime}".`
      );
    }
    return session;
  }

  private sendRequest(
    session: CodeSession,
    code: string,
    cwd: string,
    timeoutMs: number
  ): Promise<WorkerResponse> {
    if (session.closed || this.sessions.get(session.id) !== session) {
      return Promise.reject(
        new Error(`Code session is no longer available: ${session.id}.`)
      );
    }
    const requestId = randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const error = new Error(
          `Code execution timed out after ${timeoutMs}ms; session ${session.id} was destroyed.`
        );
        this.destroySession(session, error);
      }, timeoutMs);
      session.pending = { requestId, resolve, reject, timer };
      session.child.stdin.write(
        `${JSON.stringify({ request_id: requestId, code, cwd })}\n`,
        (error) => {
          if (error) this.destroySession(session, error);
        }
      );
    });
  }

  private onStdout(session: CodeSession, chunk: string): void {
    session.stdoutBuffer += chunk;
    while (true) {
      const newline = session.stdoutBuffer.indexOf("\n");
      if (newline < 0) return;
      const line = session.stdoutBuffer.slice(0, newline);
      session.stdoutBuffer = session.stdoutBuffer.slice(newline + 1);
      if (!line) continue;
      let response: WorkerResponse;
      try {
        response = JSON.parse(line) as WorkerResponse;
      } catch (error) {
        this.destroySession(
          session,
          new Error("Code session returned an invalid response.", { cause: error })
        );
        return;
      }
      const pending = session.pending;
      if (
        typeof response.request_id !== "string" ||
        pending?.requestId !== response.request_id
      ) {
        this.destroySession(
          session,
          new Error("Code session returned an unexpected response.")
        );
        return;
      }
      clearTimeout(pending.timer);
      session.pending = null;
      pending.resolve(response);
    }
  }

  private async resolveCwd(
    requestedCwd: string | undefined,
    fallback: string
  ): Promise<string> {
    const resolved = requestedCwd
      ? path.isAbsolute(requestedCwd)
        ? path.resolve(requestedCwd)
        : path.resolve(this.workspaceRoot, requestedCwd)
      : fallback;
    let metadata;
    try {
      metadata = await stat(resolved);
    } catch (error) {
      throw new Error(`cwd does not exist: ${resolved}`, { cause: error });
    }
    if (!metadata.isDirectory()) {
      throw new Error(`cwd is not a directory: ${resolved}`);
    }
    return resolved;
  }

  private pruneIdleSessions(): void {
    const cutoff = Date.now() - SESSION_IDLE_TTL_MS;
    for (const session of this.sessions.values()) {
      if (
        session.lastUsedAt < cutoff &&
        session.activeOperations === 0
      ) {
        this.destroySession(
          session,
          new Error(`Code session expired after 30 minutes: ${session.id}.`)
        );
      }
    }
  }

  private destroySession(session: CodeSession, error: Error): void {
    if (session.closed) return;
    session.closed = true;
    this.sessions.delete(session.id);
    if (session.pending) {
      clearTimeout(session.pending.timer);
      session.pending.reject(error);
      session.pending = null;
    }
    session.child.kill("SIGKILL");
  }
}

export function createExecCodeBuiltInTools(
  sessions: ExecCodeSessionManager
): ToolEntry[] {
  return [
    {
      tool: execCodeTool,
      async execute(args: Record<string, unknown>) {
        if (typeof args.description !== "string") {
          throw new Error("description must be a string.");
        }
        if (args.runtime !== "python" && args.runtime !== "bun") {
          throw new Error('runtime must be either "python" or "bun".');
        }
        if (typeof args.code !== "string") {
          throw new Error("code must be a string.");
        }
        if (args.session_id !== null && typeof args.session_id !== "string") {
          throw new Error("session_id must be a string or null.");
        }
        if (args.cwd !== undefined && typeof args.cwd !== "string") {
          throw new Error("cwd must be a string when provided.");
        }
        if (
          args.timeout_ms !== undefined &&
          (typeof args.timeout_ms !== "number" ||
            !Number.isFinite(args.timeout_ms))
        ) {
          throw new Error("timeout_ms must be a number when provided.");
        }
        return sessions.execute({
          runtime: args.runtime,
          code: args.code,
          sessionId: args.session_id,
          cwd: args.cwd,
          timeoutMs: args.timeout_ms,
        });
      },
    },
  ];
}

function validateExecutionInput(
  runtime: ExecCodeRuntime,
  code: string,
  timeoutMs: number
): void {
  if (runtime !== "python" && runtime !== "bun") {
    throw new Error('runtime must be either "python" or "bun".');
  }
  if (typeof code !== "string" || !code.trim()) {
    throw new Error("code must be a non-empty string.");
  }
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error("timeout_ms must be a positive number.");
  }
}

function spawnWorker(
  runtime: ExecCodeRuntime,
  workspaceRoot: string
): ChildProcessWithoutNullStreams {
  return runtime === "python"
    ? spawn("python3", ["-u", "-c", PYTHON_WORKER_SOURCE], {
        cwd: workspaceRoot,
        stdio: ["pipe", "pipe", "pipe"],
      })
    : spawn(process.execPath, ["-e", BUN_WORKER_SOURCE], {
        cwd: workspaceRoot,
        stdio: ["pipe", "pipe", "pipe"],
      });
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

const PYTHON_WORKER_SOURCE = String.raw`
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
`;

const BUN_WORKER_SOURCE = String.raw`
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
`;
