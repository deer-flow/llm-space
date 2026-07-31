import type { Thread } from "@llm-space/core";
import type { RuntimeClient } from "@llm-space/runtime/runtime";

import { ServerError, toServerError } from "./errors";
import type { RuntimeRpcRequest, RuntimeRpcResponse } from "./rpc-contract";

export async function handleRuntimeRpc(
  runtime: RuntimeClient,
  input: unknown
): Promise<RuntimeRpcResponse> {
  const request = _parseRpcRequest(input);
  try {
    const result = await _dispatch(runtime, request);
    return { id: request.id, ok: true, result };
  } catch (error) {
    const serverError = toServerError(error);
    return {
      id: request.id,
      ok: false,
      error: {
        code: serverError.code,
        message: serverError.message,
        ...(serverError.detail === undefined
          ? {}
          : { detail: serverError.detail }),
      },
    };
  }
}

function _parseRpcRequest(input: unknown): RuntimeRpcRequest {
  if (!input || typeof input !== "object") {
    throw new ServerError("invalid_request", "RPC request must be an object.");
  }
  const candidate = input as Partial<RuntimeRpcRequest>;
  if (typeof candidate.id !== "string" || candidate.id.length === 0) {
    throw new ServerError("invalid_request", "RPC request id is required.");
  }
  if (typeof candidate.method !== "string" || candidate.method.length === 0) {
    throw new ServerError("invalid_request", "RPC request method is required.");
  }
  return candidate as RuntimeRpcRequest;
}

async function _dispatch(
  runtime: RuntimeClient,
  request: RuntimeRpcRequest
): Promise<unknown> {
  const params = (request.params ?? {}) as Record<string, unknown>;
  switch (request.method) {
    case "runtime.info":
      return runtime.info();
    case "fs.ls":
      return runtime.fsLs(_stringParam(params, "path"));
    case "fs.mkdir":
      await runtime.fsMkdir(_stringParam(params, "path"));
      return null;
    case "fs.cp":
      await runtime.fsCp(
        _stringParam(params, "src"),
        _stringParam(params, "dest")
      );
      return null;
    case "fs.mv":
      await runtime.fsMv(
        _stringParam(params, "src"),
        _stringParam(params, "dest")
      );
      return null;
    case "fs.rm":
      await runtime.fsRm(_stringParam(params, "path"));
      return null;
    case "fs.read":
      return runtime.fsRead(_stringParam(params, "path"));
    case "fs.write":
      await runtime.fsWrite(_stringParam(params, "path"), _threadParam(params));
      return null;
    case "fs.realpath":
      return { path: await runtime.fsRealpath(_stringParam(params, "path")) };
    case "models.available":
      return runtime.availableModels();
    case "models.removeProvider":
      return runtime.removeProvider(_stringParam(params, "providerId"));
    case "models.builtinProviders":
      return runtime.builtinProviders();
    case "models.addProvider":
      return runtime.addProvider(_stringParam(params, "providerId"));
    case "models.addCustomProvider":
      return runtime.addCustomProvider(
        params as Parameters<RuntimeClient["addCustomProvider"]>[0]
      );
    case "models.updateProvider":
      return runtime.updateProvider(
        params as Parameters<RuntimeClient["updateProvider"]>[0]
      );
    case "models.setModelEnabled":
      return runtime.setModelEnabled(
        params as Parameters<RuntimeClient["setModelEnabled"]>[0]
      );
    case "models.setAllModelsEnabled":
      return runtime.setAllModelsEnabled(
        params as Parameters<RuntimeClient["setAllModelsEnabled"]>[0]
      );
    case "models.getDefault":
      return runtime.getDefaultModel();
    case "models.resolveGeneratorEnv":
      return runtime.resolveGeneratorEnv({
        providerId: _stringParam(params, "providerId"),
        envNames: _stringArrayParam(params, "envNames"),
      });
    case "models.setDefault":
      return runtime.setDefaultModel(
        (params as { model?: unknown }).model as Parameters<
          RuntimeClient["setDefaultModel"]
        >[0]
      );
    case "models.testConnection":
      await runtime.testModelConnection(
        params as Parameters<RuntimeClient["testModelConnection"]>[0]
      );
      return null;
    case "models.removeCustomModel":
      return runtime.removeCustomModel(
        params as Parameters<RuntimeClient["removeCustomModel"]>[0]
      );
    case "models.upsertCustomModel":
      return runtime.upsertCustomModel(
        params as Parameters<RuntimeClient["upsertCustomModel"]>[0]
      );
    case "mcp.listServers":
      return runtime.mcpListServers();
    case "mcp.addServer":
      return runtime.mcpAddServer(
        (params as { server: unknown }).server as Parameters<
          RuntimeClient["mcpAddServer"]
        >[0]
      );
    case "mcp.updateServer":
      return runtime.mcpUpdateServer(
        _stringParam(params, "serverId"),
        (params as { server: unknown }).server as Parameters<
          RuntimeClient["mcpUpdateServer"]
        >[1]
      );
    case "mcp.removeServer":
      return runtime.mcpRemoveServer(_stringParam(params, "serverId"));
    case "mcp.disconnectServer":
      return runtime.mcpDisconnectServer(_stringParam(params, "serverId"));
    case "mcp.listTools":
      return runtime.mcpListTools(_stringParam(params, "serverId"));
    case "mcp.callTool":
      return runtime.mcpCallTool({
        serverId: _stringParam(params, "serverId"),
        toolName: _stringParam(params, "toolName"),
        arguments: _recordParam(params, "arguments"),
      });
    case "builtinTools.list":
      return runtime.builtInListTools();
    case "builtinTools.call":
      return runtime.builtInCallTool({
        name: _stringParam(params, "name"),
        arguments: _recordParam(params, "arguments"),
        config: _optionalRecordParam(params, "config"),
      });
    case "search.get":
      return runtime.getSearchSettings();
    case "search.set":
      return runtime.setSearchSettings(
        (params as { settings: unknown }).settings as Parameters<
          RuntimeClient["setSearchSettings"]
        >[0]
      );
    case "network.get":
      return runtime.getNetworkSettings();
    case "network.set":
      return runtime.setNetworkSettings(
        (params as { settings: unknown }).settings as Parameters<
          RuntimeClient["setNetworkSettings"]
        >[0]
      );
    case "network.detectSystemProxy":
      return runtime.detectSystemProxy();
    case "skills.getSettings":
      return runtime.skillsGetSettings();
    case "skills.addPath":
      return runtime.skillsAddPath(_stringParam(params, "path"));
    case "skills.removePath":
      return runtime.skillsRemovePath(_stringParam(params, "path"));
    case "skills.setSkillHidden":
      return runtime.skillsSetSkillHidden(
        params as Parameters<RuntimeClient["skillsSetSkillHidden"]>[0]
      );
    case "skills.setAllSkillsHidden":
      return runtime.skillsSetAllSkillsHidden(
        params as Parameters<RuntimeClient["skillsSetAllSkillsHidden"]>[0]
      );
    case "skills.listSkills":
      return runtime.skillsListSkills(_stringParam(params, "path"));
    case "skills.readSkill":
      return runtime.skillsReadSkill(_stringParam(params, "path"));
    case "trace.listProjects":
      return runtime.traceListProjects();
    case "trace.createProject":
      return runtime.traceCreateProject(_stringParam(params, "name"));
    case "trace.createConnectedProject":
      return runtime.traceCreateConnectedProject(
        params as unknown as Parameters<
          RuntimeClient["traceCreateConnectedProject"]
        >[0]
      );
    case "trace.listTraces":
      return runtime.traceListTraces(_stringParam(params, "projectId"));
    case "trace.importLangfuseJson":
      return runtime.traceImportLangfuseJson(
        _stringParam(params, "projectId"),
        (
          params as unknown as {
            files: Parameters<RuntimeClient["traceImportLangfuseJson"]>[1];
          }
        ).files
      );
    case "trace.searchLangfuseTraces":
      return runtime.traceSearchLangfuseTraces(
        params as Parameters<RuntimeClient["traceSearchLangfuseTraces"]>[0]
      );
    case "trace.syncLangfuseTraces":
      return runtime.traceSyncLangfuseTraces(
        params as Parameters<RuntimeClient["traceSyncLangfuseTraces"]>[0]
      );
    case "trace.readTrace":
      return runtime.traceReadTrace(
        _stringParam(params, "projectId"),
        _stringParam(params, "traceKey")
      );
    case "trace.readOrCreateWorkbench":
      return runtime.traceReadOrCreateWorkbench(
        _stringParam(params, "projectId"),
        _stringParam(params, "traceKey")
      );
    case "trace.updateTraceTitle":
      return runtime.traceUpdateTraceTitle(
        _stringParam(params, "projectId"),
        _stringParam(params, "traceKey"),
        _stringParam(params, "title")
      );
    case "trace.writeWorkbench":
      await runtime.traceWriteWorkbench(
        _stringParam(params, "projectId"),
        _stringParam(params, "traceKey"),
        _threadParam(params)
      );
      return null;
    default:
      throw new ServerError(
        "method_not_found",
        `Runtime RPC method not found: ${String(request.method)}`,
        404
      );
  }
}

function _stringParam(params: Record<string, unknown>, name: string): string {
  const value = params[name];
  if (typeof value !== "string") {
    throw new ServerError(
      "invalid_params",
      `RPC param "${name}" must be a string.`
    );
  }
  return value;
}

function _stringArrayParam(
  params: Record<string, unknown>,
  name: string
): string[] {
  const value = params[name];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new ServerError(
      "invalid_params",
      `RPC param "${name}" must be a string array.`
    );
  }
  return value.filter((item): item is string => typeof item === "string");
}

function _threadParam(params: Record<string, unknown>): Thread {
  const value = params.thread;
  if (!value || typeof value !== "object") {
    throw new ServerError(
      "invalid_params",
      'RPC param "thread" must be an object.'
    );
  }
  return value;
}

function _recordParam(
  params: Record<string, unknown>,
  name: string
): Record<string, unknown> {
  const value = params[name];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ServerError(
      "invalid_params",
      `RPC param "${name}" must be an object.`
    );
  }
  return value as Record<string, unknown>;
}

/** Read an optional object parameter without accepting arrays or primitives. */
function _optionalRecordParam(
  params: Record<string, unknown>,
  name: string
): Record<string, unknown> | undefined {
  return params[name] === undefined ? undefined : _recordParam(params, name);
}
