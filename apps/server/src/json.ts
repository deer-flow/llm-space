import { ServerError, errorBody, toServerError } from "./errors";

export function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  return new Response(`${JSON.stringify(body)}\n`, { ...init, headers });
}

export function errorResponse(error: unknown): Response {
  const serverError = toServerError(error);
  return jsonResponse(errorBody(serverError), { status: serverError.status });
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch (error) {
    throw new ServerError(
      "invalid_json",
      "Request body must be valid JSON.",
      400,
      {
        cause: error instanceof Error ? error.message : String(error),
      }
    );
  }
}
