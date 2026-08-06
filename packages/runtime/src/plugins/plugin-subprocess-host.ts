/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import type { Subprocess } from "bun";

const MAX_MESSAGE_BYTES = 1024 * 1024;
const MAX_OUTPUT_BYTES = 5 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 60_000;

interface PendingCall {
  resolve(value: unknown): void;
  reject(error: Error): void;
  timer: ReturnType<typeof setTimeout>;
}

export type PluginHostRequestHandler = (
  method: string,
  params: unknown
) => Promise<unknown>;

export class PluginSubprocessHost {
  private _process: Subprocess<"pipe", "pipe", "pipe"> | null = null;
  private readonly _pending = new Map<string, PendingCall>();
  private _nextId = 0;
  private _stderr = "";
  private _stderrBytes = 0;
  private _closed = false;
  private _initialization: unknown;

  constructor(
    private readonly _runnerPath: string,
    private readonly _pluginId: string,
    private readonly _handleHostRequest: PluginHostRequestHandler
  ) {}

  get output(): string {
    return this._stderr;
  }

  async call<T>(
    method: string,
    params?: unknown,
    timeoutMs = DEFAULT_TIMEOUT_MS
  ): Promise<T> {
    if (this._closed) throw new Error("Plugin runner is closed.");
    const started = this._ensureProcess();
    if (method === "initialize") this._initialization = params;
    if (started && method !== "initialize" && this._initialization) {
      await this._callRaw("initialize", this._initialization, timeoutMs);
    }
    return this._callRaw(method, params, timeoutMs);
  }

  private _callRaw<T>(
    method: string,
    params: unknown,
    timeoutMs: number
  ): Promise<T> {
    const id = `${this._pluginId}:${++this._nextId}`;
    const line = JSON.stringify({ type: "request", id, method, params });
    if (Buffer.byteLength(line) > MAX_MESSAGE_BYTES)
      throw new Error("Plugin request exceeds size limit.");
    const promise = new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this._crash(new Error(`Plugin request timed out: ${method}`));
      }, timeoutMs);
      this._pending.set(id, { resolve: resolve, reject, timer });
    });
    void this._process?.stdin.write(`${line}\n`);
    return promise;
  }

  async shutdown(): Promise<void> {
    if (!this._process) {
      this._closed = true;
      return;
    }
    await this.call("shutdown").catch(() => undefined);
    this._closed = true;
    this._process.kill();
    this._process = null;
  }

  private _ensureProcess(): boolean {
    if (this._process) return false;
    this._process = Bun.spawn([process.execPath, this._runnerPath], {
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
      env: process.env,
    });
    void this._readStdout(this._process.stdout);
    void this._readStderr(this._process.stderr);
    void this._watchExit(this._process);
    return true;
  }

  private async _readStdout(stream: ReadableStream<Uint8Array>): Promise<void> {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      while (true) {
        const newline = buffer.indexOf("\n");
        if (newline < 0) break;
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        if (Buffer.byteLength(line) > MAX_MESSAGE_BYTES) {
          this._crash(new Error("Plugin response exceeds size limit."));
          return;
        }
        await this._receive(line);
      }
    }
  }

  private async _receive(line: string): Promise<void> {
    let message: any;
    try {
      message = JSON.parse(line);
    } catch {
      this._crash(new Error("Plugin runner emitted invalid protocol data."));
      return;
    }
    if (
      message.type === "request" &&
      String(message.method).startsWith("host.")
    ) {
      try {
        const result = await this._handleHostRequest(
          String(message.method).slice(5),
          message.params
        );
        this._sendResponse(message.id, result);
      } catch (error) {
        this._sendResponse(
          message.id,
          undefined,
          error instanceof Error ? error.message : String(error)
        );
      }
      return;
    }
    const pending = this._pending.get(message.id);
    if (!pending) return;
    clearTimeout(pending.timer);
    this._pending.delete(message.id);
    if (message.error) pending.reject(new Error(String(message.error)));
    else pending.resolve(message.result);
  }

  private _sendResponse(id: string, result?: unknown, error?: string): void {
    let line = JSON.stringify({ type: "response", id, result, error });
    if (Buffer.byteLength(line) > MAX_MESSAGE_BYTES) {
      line = JSON.stringify({
        type: "response",
        id,
        error: "Host response exceeds size limit.",
      });
    }
    void this._process?.stdin.write(`${line}\n`);
  }

  private async _readStderr(stream: ReadableStream<Uint8Array>): Promise<void> {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      this._stderrBytes += value.byteLength;
      if (this._stderrBytes > MAX_OUTPUT_BYTES) {
        this._crash(new Error("Plugin output exceeds size limit."));
        return;
      }
      this._stderr += decoder.decode(value);
    }
  }

  private async _watchExit(
    process: Subprocess<"pipe", "pipe", "pipe">
  ): Promise<void> {
    const code = await process.exited;
    if (this._process !== process) return;
    this._process = null;
    if (!this._closed)
      this._crash(new Error(`Plugin runner exited with code ${code}.`));
  }

  private _crash(error: Error): void {
    this._process?.kill();
    this._process = null;
    for (const pending of this._pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this._pending.clear();
  }
}
