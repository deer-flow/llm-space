import os from "node:os";

import { assertAuthorized } from "./auth";
import { errorResponse, jsonResponse, readJson } from "./json";
import { handleRuntimeRpc } from "./rpc";
import { PROTOCOL_VERSION, type ServerHealthResponse } from "./rpc-contract";
import type { ServerRuntimeContext } from "./runtime-factory";
import { createStreamResponse } from "./stream";

export interface StartHttpServerOptions {
  host: string;
  port: number;
  token: string;
  runtime: ServerRuntimeContext;
  version: string;
  onShutdown?: () => void;
}

export function startHttpServer(
  options: StartHttpServerOptions
): Bun.Server<unknown> {
  const server = Bun.serve({
    hostname: options.host,
    port: options.port,
    fetch: createHttpFetchHandler(options),
  });
  return server;
}

export function createHttpFetchHandler(options: StartHttpServerOptions) {
  return async function fetchHandler(request: Request): Promise<Response> {
    try {
      assertAuthorized(request, options.token);
      const url = new URL(request.url);
      if (request.method === "GET" && url.pathname === "/health") {
        return jsonResponse(_health(options));
      }
      if (request.method === "POST" && url.pathname === "/shutdown") {
        setTimeout(() => options.onShutdown?.(), 0);
        return jsonResponse({ ok: true });
      }
      if (request.method === "POST" && url.pathname === "/rpc") {
        return jsonResponse(
          await handleRuntimeRpc(options.runtime.runtime, await readJson(request))
        );
      }
      if (request.method === "POST" && url.pathname === "/stream") {
        return createStreamResponse(
          options.runtime.runtime,
          await readJson(request)
        );
      }
      return jsonResponse(
        {
          ok: false,
          error: {
            code: "not_found",
            message: `Endpoint not found: ${request.method} ${url.pathname}`,
          },
        },
        { status: 404 }
      );
    } catch (error) {
      return errorResponse(error);
    }
  };
}

function _health(options: StartHttpServerOptions): ServerHealthResponse {
  return {
    ok: true,
    version: options.version,
    protocolVersion: PROTOCOL_VERSION,
    capabilities: options.runtime.runtime.info().capabilities,
    homePath: options.runtime.homePath,
    workspacePath: options.runtime.workspacePath,
    platform: {
      os: process.platform,
      arch: os.arch(),
    },
  };
}
