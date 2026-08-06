#!/usr/bin/env bun
/* eslint-disable no-console, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
import { pathToFileURL } from "node:url";

interface Request {
  type: "request";
  id: string;
  method: string;
  params?: any;
}
interface Response {
  type: "response";
  id: string;
  result?: any;
  error?: string;
}

const MAX_MESSAGE_BYTES = 1024 * 1024;
const DEEP_LINK_ID_PATTERN = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/;
const writeProtocol = process.stdout.write.bind(process.stdout);
const writePluginOutput = (...values: unknown[]) => {
  process.stderr.write(
    `${values
      .map((value) => (typeof value === "string" ? value : Bun.inspect(value)))
      .join(" ")}\n`
  );
};
console.log = writePluginOutput;
console.info = writePluginOutput;
console.debug = writePluginOutput;
console.warn = writePluginOutput;
console.error = writePluginOutput;
process.stdout.write = (chunk: unknown) => {
  process.stderr.write(
    typeof chunk === "string" || chunk instanceof Uint8Array
      ? chunk
      : Bun.inspect(chunk)
  );
  return true;
};

const commands = new Map<string, any>();
const tools = new Map<string, any>();
const storages = new Map<string, any>();
const STRUCTURED_COMMAND_RESULT = Symbol("structuredCommandResult");
const STRUCTURED_TOOL_RESULT = Symbol("structuredToolResult");
const pendingHost = new Map<
  string,
  { resolve(value: any): void; reject(error: Error): void }
>();
let settings: Record<string, unknown> = {};
let nextHostRequest = 0;

function send(message: Request | Response): void {
  const line = JSON.stringify(message);
  if (Buffer.byteLength(line) > MAX_MESSAGE_BYTES)
    throw new Error("Runner message exceeds size limit.");
  writeProtocol(`${line}\n`);
}

function hostCall(method: string, params?: unknown): Promise<any> {
  const id = `host-${++nextHostRequest}`;
  send({ type: "request", id, method: `host.${method}`, params });
  return new Promise((resolve, reject) =>
    pendingHost.set(id, { resolve, reject })
  );
}

function context(signal?: AbortSignal) {
  return Object.freeze({
    settings: Object.freeze(structuredClone(settings)),
    signal,
    notify: (message: string) => hostCall("notify", { message }),
    openLink: (url: string) => hostCall("openLink", { url }),
    pickFile: (options?: unknown) => hostCall("pickFile", { options }),
    readWorkspaceFile: (path: string) =>
      hostCall("readWorkspaceFile", { path }),
    writeWorkspaceFile: (path: string, content: string) =>
      hostCall("writeWorkspaceFile", { path, content }),
    executeHostCommand: (type: string, args?: unknown) =>
      hostCall("executeHostCommand", { type, args }),
  });
}

function commandContext(
  executionId: unknown,
  commandId: unknown,
  initialActiveTab: any,
  initialArguments: unknown
) {
  let activeTabThread: unknown =
    initialActiveTab == null ? null : structuredClone(initialActiveTab.thread);
  let activeTabThreadUpdated = false;
  const activeTab =
    initialActiveTab == null
      ? null
      : Object.freeze({
          filename: String(initialActiveTab.filename),
          thread: structuredClone(initialActiveTab.thread),
          writeThread: (thread: unknown) => {
            activeTabThread = structuredClone(thread);
            activeTabThreadUpdated = true;
            return Promise.resolve();
          },
        });
  const value = Object.freeze({
    ...context(),
    arguments: Object.freeze(
      Array.isArray(initialArguments) ? [...initialArguments] : []
    ),
    activeTab,
    report: (report: unknown) => {
      if (!isCommandReport(report)) {
        throw new Error("Plugin Command report is invalid.");
      }
      return hostCall("report", {
        executionId: _string(executionId),
        commandId: _string(commandId),
        report,
      });
    },
    createResult: (message: unknown) => {
      if (!isCommandUserMessage(message)) {
        throw new Error("Plugin Command user message is invalid.");
      }
      return { [STRUCTURED_COMMAND_RESULT]: true, message };
    },
  });
  return {
    value,
    result(result: any) {
      const structured =
        result &&
        typeof result === "object" &&
        result[STRUCTURED_COMMAND_RESULT] === true;
      const userMessage = structured ? result.message : undefined;
      return {
        result: structured ? null : (result ?? null),
        ...(userMessage ? { userMessage } : {}),
        ...(activeTabThreadUpdated && userMessage?.level !== "error"
          ? { activeTabThreadUpdate: activeTabThread }
          : {}),
      };
    },
  };
}

function _string(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function isCommandReport(
  value: unknown
): value is { phase: string; message?: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const report = value as Record<string, unknown>;
  return (
    typeof report.phase === "string" &&
    report.phase.trim().length > 0 &&
    (report.message === undefined || typeof report.message === "string")
  );
}

function isCommandUserMessage(
  value: unknown
): value is { level: "success" | "warning" | "error"; message: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const message = value as Record<string, unknown>;
  return (
    (message.level === "success" ||
      message.level === "warning" ||
      message.level === "error") &&
    typeof message.message === "string" &&
    message.message.trim().length > 0
  );
}

function toolContext(initialThread: unknown, initialVariables: unknown) {
  const thread = deepFreeze(structuredClone(initialThread));
  const variables = deepFreeze(
    structuredClone(initialVariables ?? {}) as Record<string, unknown>
  );
  return Object.freeze({
    ...context(),
    thread,
    variables,
    createResult: (content: unknown) => {
      if (!isToolContent(content)) {
        throw new Error("Plugin Tool structured content is invalid.");
      }
      return { [STRUCTURED_TOOL_RESULT]: true, content };
    },
  });
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function isToolContent(value: unknown): value is unknown[] {
  return (
    Array.isArray(value) &&
    value.every((item) => {
      if (!item || typeof item !== "object") return false;
      const content = item as Record<string, unknown>;
      if (content.type === "text") return typeof content.text === "string";
      return (
        content.type === "image" &&
        typeof content.data === "string" &&
        typeof content.mimeType === "string"
      );
    })
  );
}

function toolResult(result: any) {
  if (
    result &&
    typeof result === "object" &&
    result[STRUCTURED_TOOL_RESULT] === true
  ) {
    return { kind: "content", content: result.content };
  }
  return { kind: "value", value: result ?? null };
}

async function loadClass(filePath: string): Promise<any> {
  const module = await import(
    `${pathToFileURL(filePath).href}?runner=${Date.now()}`
  );
  if (typeof module.default !== "function")
    throw new Error("Extension must default export a class.");
  return new module.default();
}

async function handle(method: string, params: any): Promise<any> {
  if (method === "initialize") {
    settings = params.settings ?? {};
    commands.clear();
    tools.clear();
    storages.clear();
    const commandViews = [];
    const toolViews = [];
    const storageViews = [];
    const errors = [];
    for (const item of params.commands ?? []) {
      try {
        const instance = await loadClass(item.path);
        if (
          typeof instance.displayName !== "string" ||
          typeof instance.execute !== "function"
        ) {
          throw new Error("Command requires displayName and execute(context).");
        }
        commands.set(item.id, instance);
        commandViews.push({
          id: item.id,
          displayName: instance.displayName,
          description: instance.description,
        });
      } catch (error) {
        errors.push({
          id: item.id,
          kind: "command",
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
      }
    }
    for (const item of params.tools ?? []) {
      try {
        const instance = await loadClass(item.path);
        if (
          typeof instance.name !== "string" ||
          instance.name.trim().length === 0 ||
          typeof instance.description !== "string" ||
          !instance.parameters ||
          typeof instance.parameters !== "object" ||
          Array.isArray(instance.parameters) ||
          typeof instance.execute !== "function" ||
          (instance.strict !== undefined &&
            typeof instance.strict !== "boolean")
        ) {
          throw new Error(
            "Plugin Tool requires name, description, parameters, and execute(context, args)."
          );
        }
        tools.set(item.id, instance);
        toolViews.push({
          id: item.id,
          name: instance.name,
          description: instance.description,
          parameters: structuredClone(instance.parameters),
          ...(instance.strict === undefined ? {} : { strict: instance.strict }),
        });
      } catch (error) {
        errors.push({
          id: item.id,
          kind: "tool",
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
      }
    }
    for (const item of params.storages ?? []) {
      try {
        const instance = await loadClass(item.path);
        const caps = instance.capabilities;
        if (
          typeof instance.displayName !== "string" ||
          !caps ||
          typeof caps.read !== "boolean" ||
          typeof caps.write !== "boolean"
        ) {
          throw new Error(
            "Thread Storage requires displayName and read/write capabilities."
          );
        }
        if (
          caps.read &&
          (typeof instance.resolveLatest !== "function" ||
            typeof instance.read !== "function")
        ) {
          throw new Error(
            "Readable Thread Storage requires resolveLatest() and read()."
          );
        }
        if (caps.write && typeof instance.write !== "function")
          throw new Error("Writable Thread Storage requires write().");
        if (
          instance.deepLinkId !== undefined &&
          (typeof instance.deepLinkId !== "string" ||
            !DEEP_LINK_ID_PATTERN.test(instance.deepLinkId))
        ) {
          throw new Error(
            "Thread Storage deepLinkId must contain lowercase letters, numbers, dots, underscores, or hyphens."
          );
        }
        storages.set(item.id, instance);
        storageViews.push({
          id: item.id,
          deepLinkId: instance.deepLinkId,
          displayName: instance.displayName,
          description: instance.description,
          capabilities: caps,
        });
      } catch (error) {
        errors.push({
          id: item.id,
          kind: "threadStorage",
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
      }
    }
    return {
      commands: commandViews,
      tools: toolViews,
      storages: storageViews,
      errors,
    };
  }
  if (method === "settings.update") {
    settings = params.settings ?? {};
    return null;
  }
  if (method === "command.execute") {
    const command = commands.get(params.id);
    if (!command) throw new Error(`Unknown plugin command: ${params.id}`);
    const invocation = commandContext(
      params.executionId,
      params.id,
      params.activeTab,
      params.arguments
    );
    const result = await command.execute(
      invocation.value,
      invocation.value.arguments
    );
    return invocation.result(result);
  }
  if (method === "tool.execute") {
    const tool = tools.get(params.id);
    if (!tool) throw new Error(`Unknown Plugin Tool: ${params.id}`);
    const result = await tool.execute(
      toolContext(params.thread, params.variables),
      params.arguments ?? {}
    );
    return toolResult(result);
  }
  if (method.startsWith("storage.")) {
    const storage = storages.get(params.id);
    if (!storage) throw new Error(`Unknown Thread Storage: ${params.id}`);
    if (method === "storage.resolveLatest")
      return await storage.resolveLatest(params.resourceId, context());
    if (method === "storage.read")
      return await storage.read(params.locator, context());
    if (method === "storage.write")
      return await storage.write(params.thread, params.resourceId, context());
  }
  if (method === "shutdown") {
    for (const instance of [
      ...commands.values(),
      ...tools.values(),
      ...storages.values(),
    ]) {
      if (typeof instance.dispose === "function") await instance.dispose();
    }
    setTimeout(() => process.exit(0), 0);
    return null;
  }
  throw new Error(`Unknown runner method: ${method}`);
}

let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", async (chunk: string) => {
  buffer += chunk;
  while (true) {
    const newline = buffer.indexOf("\n");
    if (newline < 0) break;
    const line = buffer.slice(0, newline);
    buffer = buffer.slice(newline + 1);
    if (Buffer.byteLength(line) > MAX_MESSAGE_BYTES) process.exit(70);
    let message: Request | Response;
    try {
      message = JSON.parse(line);
    } catch {
      process.exit(70);
      return;
    }
    if (message.type === "response") {
      const pending = pendingHost.get(message.id);
      if (!pending) continue;
      pendingHost.delete(message.id);
      if (message.error) pending.reject(new Error(message.error));
      else pending.resolve(message.result);
      continue;
    }
    try {
      send({
        type: "response",
        id: message.id,
        result: await handle(message.method, message.params),
      });
    } catch (error) {
      send({
        type: "response",
        id: message.id,
        error:
          error instanceof Error
            ? `${error.message}\n${error.stack ?? ""}`
            : String(error),
      });
    }
  }
});

process.on("uncaughtException", (error) => {
  process.stderr.write(`${error.stack ?? error.message}\n`);
  process.exit(70);
});
