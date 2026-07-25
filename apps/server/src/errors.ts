export class ServerError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400,
    readonly detail?: unknown
  ) {
    super(message);
    this.name = "ServerError";
  }
}

export function errorBody(error: ServerError) {
  return {
    ok: false,
    error: {
      code: error.code,
      message: error.message,
      ...(error.detail === undefined ? {} : { detail: error.detail }),
    },
  };
}

export function toServerError(error: unknown): ServerError {
  if (error instanceof ServerError) {
    return error;
  }
  return new ServerError(
    "internal_error",
    error instanceof Error ? error.message : String(error),
    500
  );
}
