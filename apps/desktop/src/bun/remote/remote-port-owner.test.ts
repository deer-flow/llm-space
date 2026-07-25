import { describe, expect, test } from "bun:test";

import {
  buildRemotePortOwnerProbeCommand,
  buildStopRemotePortOwnerCommand,
  parseRemotePortOwnerProbeOutput,
} from "./remote-port-owner";
import type { SshRemoteRuntimeConfig } from "./ssh-bootstrap-config";

const CONFIG: SshRemoteRuntimeConfig = {
  id: "remote:test",
  name: "test",
  host: "host",
  extraArgs: [],
  remoteRepo: "",
  remoteInstallDir: "~/.llm-space/remote-runtime",
  remoteHome: "~/.llm-space-server",
  remoteServerPort: 39123,
  makeDefault: false,
};

describe("remote port owner", () => {
  test("builds a best-effort probe with ps fallback", () => {
    const command = buildRemotePortOwnerProbeCommand(CONFIG);

    expect(command).toContain("lsof");
    expect(command).toContain("ss -ltnp");
    expect(command).toContain("fuser -n tcp");
    expect(command).toContain('ps -u "$(id -u)"');
    expect(command).not.toContain("kill ");
  });

  test("recognizes stale llm-space-server from port scan output", () => {
    const owner = parseRemotePortOwnerProbeOutput(
      "PID=2067161\nARGS=/home/user/.llm-space/remote-runtime/versions/4.4.4/bin/llm-space-server --host 127.0.0.1 --port 39123\n",
      CONFIG
    );

    expect(owner).toEqual({
      kind: "llm-space",
      pid: 2067161,
      source: "port-scan",
    });
  });

  test("recognizes stale llm-space-server from ps fallback output", () => {
    const owner = parseRemotePortOwnerProbeOutput(
      "PS=2067161 /home/user/.llm-space/remote-runtime/versions/4.4.4/bin/llm-space-server --host 127.0.0.1 --port 39123\n",
      CONFIG
    );

    expect(owner).toEqual({
      kind: "llm-space",
      pid: 2067161,
      source: "ps-scan",
    });
  });

  test("does not classify unrelated listeners as llm-space", () => {
    expect(
      parseRemotePortOwnerProbeOutput(
        "PID=123\nARGS=python -m http.server 39123\n",
        CONFIG
      )
    ).toEqual({
      kind: "other",
      detail: "pid 123: python -m http.server 39123",
    });
  });

  test("stop command targets only a verified pid", () => {
    const command = buildStopRemotePortOwnerCommand(2067161);

    expect(command).toContain("PID='2067161'");
    expect(command).toContain("kill -TERM $PID");
    expect(command).toContain("kill -KILL $PID");
    expect(command).not.toContain("pkill");
    expect(command).not.toContain("llm-space-server");
  });
});
