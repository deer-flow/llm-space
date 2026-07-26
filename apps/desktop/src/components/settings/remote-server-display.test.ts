import { describe, expect, test } from "bun:test";

import type {
  RemoteConnectionStage,
  RemoteServerView,
} from "@/shared/remote-servers";

import {
  remoteConnectionChecked,
  remoteConnectionDisabled,
  remoteConnectionFlow,
  remoteStageSummary,
} from "./remote-server-display";

const BASE_SERVER: RemoteServerView = {
  id: "server-1",
  kind: "ssh",
  name: "devbox",
  host: "devbox",
  remoteInstallDir: "~/.llm-space/remote-runtime",
  remoteHome: "~/.llm-space-server",
  remoteServerPort: 39123,
  createdAt: 1,
  updatedAt: 1,
  runtimeId: "remote:server-1",
  status: "connecting",
  defaultRuntime: false,
};

function server(input: Partial<RemoteServerView>): RemoteServerView {
  return { ...BASE_SERVER, ...input };
}

describe("remote server display helpers", () => {
  test("summarizes each progress stage in at most three words", () => {
    const stages: RemoteConnectionStage[] = [
      "idle",
      "ssh-check",
      "host-key-check",
      "platform-detect",
      "server-install",
      "server-start",
      "tunnel-start",
      "health-check",
      "connected",
      "error",
    ];

    for (const stage of stages) {
      const summary = remoteStageSummary(server({ stage }));
      expect(summary).toBeTruthy();
      expect(summary!.trim().split(/\s+/).length).toBeLessThanOrEqual(3);
    }
  });

  test("derives connected and disabled state from connection status", () => {
    expect(
      remoteConnectionChecked(server({ status: "connected" }))
    ).toBe(true);
    expect(
      remoteConnectionChecked(server({ status: "disconnected" }))
    ).toBe(false);

    expect(
      remoteConnectionDisabled(server({ status: "connecting" }), false)
    ).toBe(true);
    expect(
      remoteConnectionDisabled(server({ status: "trust-required" }), false)
    ).toBe(true);
    expect(
      remoteConnectionDisabled(server({ status: "disconnected" }), true)
    ).toBe(true);
    expect(
      remoteConnectionDisabled(server({ status: "connected" }), true)
    ).toBe(true);
    expect(
      remoteConnectionDisabled(server({ status: "disconnected" }), false)
    ).toBe(false);
    expect(remoteConnectionDisabled(server({ status: "error" }), false)).toBe(
      false
    );
  });

  test("exposes connection flow steps from the server view", () => {
    const steps = [
      { stage: "ssh-check" as const, label: "SSH", status: "success" as const },
      {
        stage: "server-install" as const,
        label: "Install runtime",
        status: "error" as const,
        message: "missing binary",
      },
    ];

    expect(remoteConnectionFlow(server({ steps }))).toEqual(steps);
    expect(remoteConnectionFlow(server({}))).toEqual([]);
  });

  test("hides connection flow after a server is connected", () => {
    expect(
      remoteConnectionFlow(
        server({
          status: "connected",
          steps: [
            {
              stage: "connected",
              label: "Connected",
              status: "success",
            },
          ],
        })
      )
    ).toEqual([]);
  });
});
