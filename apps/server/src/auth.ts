import { ServerError } from "./errors";

export function verifyBearerToken(request: Request, token: string): boolean {
  return request.headers.get("authorization") === `Bearer ${token}`;
}

export function assertAuthorized(request: Request, token: string): void {
  if (!verifyBearerToken(request, token)) {
    throw new ServerError(
      "unauthorized",
      "Missing or invalid bearer token.",
      401
    );
  }
}
