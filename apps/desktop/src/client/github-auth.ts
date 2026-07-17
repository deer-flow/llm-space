import { electrobun } from "@/lib/electrobun";
import type { GithubAuthState } from "@/shared/auth";

function _rpc() {
  if (!electrobun.rpc) {
    throw new Error("Electrobun RPC is not initialized");
  }
  return electrobun.rpc;
}

/** The current GitHub sign-in state, pulled once on mount. */
export async function getGithubAuthStatus(): Promise<GithubAuthState> {
  return _rpc().request.githubAuthStatus({});
}
