import { describe, expect, test } from "bun:test";

import type { SshRemoteRuntimeConfig } from "./ssh-bootstrap-config";
import { parseSshHostKeyOutput } from "./ssh-host-key";

const CONFIG: Pick<SshRemoteRuntimeConfig, "host" | "port" | "user"> = {
  host: "203.0.113.10",
  user: "giangenchao",
};

const PUBLIC_KEY = "QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVo=";

describe("parseSshHostKeyOutput", () => {
  test("parses changed host key failures before authentication noise", () => {
    const result = parseSshHostKeyOutput(
      `debug1: Server host key: ecdsa-sha2-nistp256 SHA256:EcVgML2rZVGE6sCyfx0z7xBmJulP5tzpgy8aFTNSUEI
@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@
@    WARNING: REMOTE HOST IDENTIFICATION HAS CHANGED!     @
@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@
The fingerprint for the ECDSA key sent by the remote host is
SHA256:EcVgML2rZVGE6sCyfx0z7xBmJulP5tzpgy8aFTNSUEI.
Add correct host key in /Users/bytedance/.ssh/known_hosts to get rid of this message.
Offending ECDSA key in /Users/bytedance/.ssh/known_hosts:6
Password authentication is disabled to avoid man-in-the-middle attacks.
giangenchao@203.0.113.10: Permission denied (gssapi-with-mic,password).`,
      CONFIG
    );

    expect(result).toMatchObject({
      kind: "changed",
      knownHostsFile: "/Users/bytedance/.ssh/known_hosts",
      knownHostsLine: 6,
      keyType: "ecdsa-sha2-nistp256",
      fingerprint: "SHA256:EcVgML2rZVGE6sCyfx0z7xBmJulP5tzpgy8aFTNSUEI",
    });
  });

  test("parses first-time host key prompts with public key lines", () => {
    const result = parseSshHostKeyOutput(
      `The authenticity of host 'devbox (203.0.113.10)' can't be established.
ED25519 key fingerprint is SHA256:FcVgML2rZVGE6sCyfx0z7xBmJulP5tzpgy8aFTNSUEI.
Are you sure you want to continue connecting (yes/no/[fingerprint])?
devbox ssh-ed25519 ${PUBLIC_KEY}`,
      { host: "devbox", user: undefined, port: 2222 }
    );

    expect(result).toMatchObject({
      kind: "first-time",
      keyType: "ssh-ed25519",
      fingerprint: "SHA256:FcVgML2rZVGE6sCyfx0z7xBmJulP5tzpgy8aFTNSUEI",
      publicKeyLine: `[devbox]:2222 ssh-ed25519 ${PUBLIC_KEY}`,
    });
  });

  test("returns null for authentication-only failures", () => {
    expect(
      parseSshHostKeyOutput(
        "user@host: Permission denied (publickey,password).",
        CONFIG
      )
    ).toBeNull();
  });
});
