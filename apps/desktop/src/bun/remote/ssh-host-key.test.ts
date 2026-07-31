import { describe, expect, test } from "bun:test";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import type { RemoteHostKeyTrustRequest } from "../../shared/remote-servers";

import type { SshRemoteRuntimeConfig } from "./ssh-bootstrap-config";
import { OpenSshHostKeyService, parseSshHostKeyOutput } from "./ssh-host-key";

const CONFIG: Pick<SshRemoteRuntimeConfig, "host" | "port" | "user"> = {
  host: "203.0.113.10",
  user: "giangenchao",
};

const PUBLIC_KEY = "QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVo=";
// Disposable public host-key fixtures generated specifically for this test.
const APPROVED_PUBLIC_KEY =
  "AAAAC3NzaC1lZDI1NTE5AAAAIMWClLm642k5fDUelNUlE3uW88/ogeoX5EIKILobXc7A";
const APPROVED_FINGERPRINT =
  "SHA256:lGTUsW7JPjScNpoleUyyUfsRVyPN3zum2sOh8kX3D0Q";
const UNAPPROVED_PUBLIC_KEY =
  "AAAAC3NzaC1lZDI1NTE5AAAAIFN2zaqYUz8BS9QSM92UvdjzwXiOBwZokPiIeS+PDRkk";
const UNAPPROVED_FINGERPRINT =
  "SHA256:d1n12MYv9HCctUnqJO5LKg3j9ZDaJTQU9U2Mbt1v2Zs";
const PREVIOUS_PUBLIC_KEY =
  "AAAAC3NzaC1lZDI1NTE5AAAAIEGnEOIsKFobwDnd4yyLXW+lZ9N7P7HM4JyG72pImjxo";
const HOST_ALIAS = "stable-host-alias";
const CUSTOM_PORT = 2222;

const SSH_CONFIG: SshRemoteRuntimeConfig = {
  id: "remote:ssh-host-key-test",
  name: "SSH host key test",
  host: "devbox",
  user: "developer",
  port: CUSTOM_PORT,
  extraArgs: [],
  remoteRepo: "",
  remoteInstallDir: "~/.llm-space/remote-runtime",
  remoteHome: "~/.llm-space-server",
  remoteServerPort: 39123,
  makeDefault: false,
};

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

describe("OpenSshHostKeyService", () => {
  for (const kind of ["first-time", "changed"] as const) {
    test(`rejects a ${kind} host when the trust-time key differs from the approved key`, async () => {
      await _withFakeOpenSsh(
        kind,
        async ({ home, knownHostsFile, service }) => {
          const request = await _checkForTrust(service);

          expect(request).toMatchObject({
            kind,
            resolvedHost: "203.0.113.10",
            port: CUSTOM_PORT,
            fingerprint: APPROVED_FINGERPRINT,
            publicKeyLine: `${HOST_ALIAS} ssh-ed25519 ${APPROVED_PUBLIC_KEY}`,
          });

          process.env.SSH_HOST_KEY_TEST_PHASE = "trust";
          process.env.SSH_HOST_KEY_TEST_PRESENTED_PUBLIC_KEY =
            UNAPPROVED_PUBLIC_KEY;
          process.env.SSH_HOST_KEY_TEST_PRESENTED_FINGERPRINT =
            UNAPPROVED_FINGERPRINT;

          expect(service.trust(SSH_CONFIG, request)).rejects.toThrow(
            "REMOTE HOST IDENTIFICATION HAS CHANGED"
          );

          const knownHosts = existsSync(knownHostsFile)
            ? readFileSync(knownHostsFile, "utf8")
            : "";
          expect(knownHosts).not.toContain(UNAPPROVED_PUBLIC_KEY);
          if (kind === "changed") {
            expect(knownHosts).toContain(PREVIOUS_PUBLIC_KEY);
          }
          expect(
            readdirSync(home).filter((name) =>
              name.startsWith("known_hosts.llm-space-backup-")
            )
          ).toEqual([]);
        }
      );
    });
  }

  test("rejects a public key that does not match the approved fingerprint", async () => {
    await _withFakeOpenSsh("first-time", async ({ service }) => {
      const request = await _checkForTrust(service);
      request.publicKeyLine = `${HOST_ALIAS} ssh-ed25519 ${UNAPPROVED_PUBLIC_KEY}`;
      process.env.SSH_HOST_KEY_TEST_PHASE = "trust";

      expect(service.trust(SSH_CONFIG, request)).rejects.toThrow(
        "does not match the approved fingerprint"
      );
    });
  });

  test("does not treat upstream authentication failure as destination key verification", async () => {
    await _withFakeOpenSsh(
      "first-time",
      async ({ knownHostsFile, service }) => {
        const request = await _checkForTrust(service);
        process.env.SSH_HOST_KEY_TEST_PHASE = "trust";
        process.env.SSH_HOST_KEY_TEST_UPSTREAM_AUTH_FAILURE = "1";

        expect(service.trust(SSH_CONFIG, request)).rejects.toThrow(
          "jump@proxy: Permission denied"
        );
        expect(existsSync(knownHostsFile)).toBe(false);
      }
    );
  });

  test("preserves authentication-failure behavior after verbose diagnostics", async () => {
    await _withFakeOpenSsh(
      "first-time",
      async ({ knownHostsFile, service }) => {
        const request = await _checkForTrust(service);
        process.env.SSH_HOST_KEY_TEST_PHASE = "trust";
        process.env.SSH_HOST_KEY_TEST_PRESENTED_PUBLIC_KEY =
          APPROVED_PUBLIC_KEY;
        process.env.SSH_HOST_KEY_TEST_PRESENTED_FINGERPRINT =
          APPROVED_FINGERPRINT;
        process.env.SSH_HOST_KEY_TEST_LONG_AUTH_OUTPUT = "1";

        await service.trust(SSH_CONFIG, request);

        expect(readFileSync(knownHostsFile, "utf8")).toBe(
          `${request.publicKeyLine}\n`
        );
      }
    );
  });

  for (const kind of ["first-time", "changed"] as const) {
    test(`persists the approved ${kind} key after strict verification`, async () => {
      await _withFakeOpenSsh(
        kind,
        async ({ home, knownHostsFile, service }) => {
          const request = await _checkForTrust(service);
          process.env.SSH_HOST_KEY_TEST_PHASE = "trust";
          process.env.SSH_HOST_KEY_TEST_PRESENTED_PUBLIC_KEY =
            APPROVED_PUBLIC_KEY;
          process.env.SSH_HOST_KEY_TEST_PRESENTED_FINGERPRINT =
            APPROVED_FINGERPRINT;

          await service.trust(SSH_CONFIG, request);

          expect(readFileSync(knownHostsFile, "utf8")).toBe(
            `${request.publicKeyLine}\n`
          );
          const backups = readdirSync(home).filter((name) =>
            name.startsWith("known_hosts.llm-space-backup-")
          );
          expect(backups).toHaveLength(kind === "changed" ? 1 : 0);
          if (kind === "changed") {
            expect(readFileSync(path.join(home, backups[0]), "utf8")).toBe(
              `${HOST_ALIAS} ssh-ed25519 ${PREVIOUS_PUBLIC_KEY}\n`
            );
          }
        }
      );
    });
  }

  test("preserves host-key diagnostics written after the child exits", async () => {
    await _withFakeOpenSsh("first-time", async ({ service }) => {
      const request = await _checkForTrust(service);
      process.env.SSH_HOST_KEY_TEST_PHASE = "trust";
      process.env.SSH_HOST_KEY_TEST_PRESENTED_PUBLIC_KEY =
        UNAPPROVED_PUBLIC_KEY;
      process.env.SSH_HOST_KEY_TEST_PRESENTED_FINGERPRINT =
        UNAPPROVED_FINGERPRINT;
      process.env.SSH_HOST_KEY_TEST_DELAYED_OUTPUT = "1";

      expect(service.trust(SSH_CONFIG, request)).rejects.toThrow(
        "REMOTE HOST IDENTIFICATION HAS CHANGED"
      );
    });
  });
});

async function _checkForTrust(
  service: OpenSshHostKeyService
): Promise<RemoteHostKeyTrustRequest> {
  const result = await service.check(SSH_CONFIG);
  if (result.status !== "first-time" && result.status !== "changed") {
    throw new Error(`Expected a host-key trust request, got ${result.status}.`);
  }
  return result.request;
}

async function _withFakeOpenSsh(
  kind: "first-time" | "changed",
  run: (fixture: {
    home: string;
    knownHostsFile: string;
    service: OpenSshHostKeyService;
  }) => Promise<void>
): Promise<void> {
  const home = mkdtempSync(path.join(tmpdir(), "llm-space-ssh-host-key-test-"));
  const knownHostsFile = path.join(home, "known_hosts");
  const binDir = path.join(home, "bin");
  const previousPath = process.env.PATH;
  const previousEnv = {
    phase: process.env.SSH_HOST_KEY_TEST_PHASE,
    kind: process.env.SSH_HOST_KEY_TEST_KIND,
    knownHostsFile: process.env.SSH_HOST_KEY_TEST_KNOWN_HOSTS_FILE,
    approvedFingerprint: process.env.SSH_HOST_KEY_TEST_APPROVED_FINGERPRINT,
    scanKeyLine: process.env.SSH_HOST_KEY_TEST_SCAN_KEY_LINE,
    presentedPublicKey: process.env.SSH_HOST_KEY_TEST_PRESENTED_PUBLIC_KEY,
    presentedFingerprint:
      process.env.SSH_HOST_KEY_TEST_PRESENTED_FINGERPRINT,
    upstreamAuthFailure:
      process.env.SSH_HOST_KEY_TEST_UPSTREAM_AUTH_FAILURE,
    longAuthOutput: process.env.SSH_HOST_KEY_TEST_LONG_AUTH_OUTPUT,
    delayedOutput: process.env.SSH_HOST_KEY_TEST_DELAYED_OUTPUT,
  };

  try {
    mkdirSync(binDir);
    _writeExecutable(path.join(binDir, "ssh"), FAKE_SSH);
    _writeExecutable(path.join(binDir, "ssh-keyscan"), FAKE_SSH_KEYSCAN);
    _writeExecutable(path.join(binDir, "ssh-keygen"), FAKE_SSH_KEYGEN);
    if (kind === "changed") {
      writeFileSync(
        knownHostsFile,
        `${HOST_ALIAS} ssh-ed25519 ${PREVIOUS_PUBLIC_KEY}\n`,
        "utf8"
      );
    }

    process.env.PATH = `${binDir}:${previousPath ?? ""}`;
    process.env.SSH_HOST_KEY_TEST_PHASE = "check";
    process.env.SSH_HOST_KEY_TEST_KIND = kind;
    process.env.SSH_HOST_KEY_TEST_KNOWN_HOSTS_FILE = knownHostsFile;
    process.env.SSH_HOST_KEY_TEST_APPROVED_FINGERPRINT = APPROVED_FINGERPRINT;
    process.env.SSH_HOST_KEY_TEST_SCAN_KEY_LINE = `[203.0.113.10]:${CUSTOM_PORT} ssh-ed25519 ${APPROVED_PUBLIC_KEY}`;
    delete process.env.SSH_HOST_KEY_TEST_PRESENTED_PUBLIC_KEY;
    delete process.env.SSH_HOST_KEY_TEST_PRESENTED_FINGERPRINT;
    delete process.env.SSH_HOST_KEY_TEST_UPSTREAM_AUTH_FAILURE;
    delete process.env.SSH_HOST_KEY_TEST_LONG_AUTH_OUTPUT;
    delete process.env.SSH_HOST_KEY_TEST_DELAYED_OUTPUT;

    await run({
      home,
      knownHostsFile,
      service: new OpenSshHostKeyService(),
    });
  } finally {
    process.env.PATH = previousPath;
    _restoreEnv("SSH_HOST_KEY_TEST_PHASE", previousEnv.phase);
    _restoreEnv("SSH_HOST_KEY_TEST_KIND", previousEnv.kind);
    _restoreEnv(
      "SSH_HOST_KEY_TEST_KNOWN_HOSTS_FILE",
      previousEnv.knownHostsFile
    );
    _restoreEnv(
      "SSH_HOST_KEY_TEST_APPROVED_FINGERPRINT",
      previousEnv.approvedFingerprint
    );
    _restoreEnv("SSH_HOST_KEY_TEST_SCAN_KEY_LINE", previousEnv.scanKeyLine);
    _restoreEnv(
      "SSH_HOST_KEY_TEST_PRESENTED_PUBLIC_KEY",
      previousEnv.presentedPublicKey
    );
    _restoreEnv(
      "SSH_HOST_KEY_TEST_PRESENTED_FINGERPRINT",
      previousEnv.presentedFingerprint
    );
    _restoreEnv(
      "SSH_HOST_KEY_TEST_UPSTREAM_AUTH_FAILURE",
      previousEnv.upstreamAuthFailure
    );
    _restoreEnv(
      "SSH_HOST_KEY_TEST_LONG_AUTH_OUTPUT",
      previousEnv.longAuthOutput
    );
    _restoreEnv(
      "SSH_HOST_KEY_TEST_DELAYED_OUTPUT",
      previousEnv.delayedOutput
    );
    rmSync(home, { recursive: true, force: true });
  }
}

function _writeExecutable(filePath: string, contents: string): void {
  writeFileSync(filePath, contents, "utf8");
  chmodSync(filePath, 0o700);
}

function _restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

const FAKE_SSH = `#!/bin/sh
mode=connect
strict=
user_known_hosts=
while [ "$#" -gt 0 ]; do
  case "$1" in
    -G)
      mode=config
      shift
      ;;
    -o)
      case "$2" in
        StrictHostKeyChecking=*) strict="\${2#*=}" ;;
        UserKnownHostsFile=*) user_known_hosts="\${2#*=}" ;;
      esac
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done

if [ "$mode" = config ]; then
  printf 'hostname 203.0.113.10\n'
  printf 'port ${CUSTOM_PORT}\n'
  printf 'user developer\n'
  printf 'hostkeyalias ${HOST_ALIAS}\n'
  printf 'userknownhostsfile %s\n' "$SSH_HOST_KEY_TEST_KNOWN_HOSTS_FILE"
  exit 0
fi

if [ "$SSH_HOST_KEY_TEST_PHASE" = check ]; then
  if [ "$SSH_HOST_KEY_TEST_KIND" = changed ]; then
    printf 'debug1: Server host key: ssh-ed25519 %s\n' "$SSH_HOST_KEY_TEST_APPROVED_FINGERPRINT" >&2
    printf '@ WARNING: REMOTE HOST IDENTIFICATION HAS CHANGED! @\n' >&2
    printf 'Add correct host key in %s to get rid of this message.\n' "$SSH_HOST_KEY_TEST_KNOWN_HOSTS_FILE" >&2
    printf 'Offending ED25519 key in %s:1\n' "$SSH_HOST_KEY_TEST_KNOWN_HOSTS_FILE" >&2
  else
    printf "The authenticity of host 'devbox' can't be established.\n" >&2
    printf 'Host key verification failed.\n' >&2
  fi
  exit 255
fi

if [ "$strict" = yes ]; then
  if [ "$SSH_HOST_KEY_TEST_UPSTREAM_AUTH_FAILURE" = 1 ]; then
    printf 'jump@proxy: Permission denied (publickey).\n' >&2
  elif [ -n "$user_known_hosts" ] && grep -F -x "${HOST_ALIAS} ssh-ed25519 $SSH_HOST_KEY_TEST_PRESENTED_PUBLIC_KEY" "$user_known_hosts" >/dev/null 2>&1; then
    printf 'debug1: Server host key: ssh-ed25519 %s\n' "$SSH_HOST_KEY_TEST_PRESENTED_FINGERPRINT" >&2
    printf "debug1: Host '${HOST_ALIAS}' is known and matches the ED25519 host key.\n" >&2
    if [ "$SSH_HOST_KEY_TEST_LONG_AUTH_OUTPUT" = 1 ]; then
      line=0
      while [ "$line" -lt 700 ]; do
        printf 'debug1: verbose authentication diagnostic line %04d\n' "$line" >&2
        line=$((line + 1))
      done
    fi
    printf 'developer@devbox: Permission denied (publickey).\n' >&2
  else
    if [ "$SSH_HOST_KEY_TEST_DELAYED_OUTPUT" = 1 ]; then
      (
        sleep 0.05
        printf 'debug1: Server host key: ssh-ed25519 %s\n' "$SSH_HOST_KEY_TEST_PRESENTED_FINGERPRINT" >&2
        printf '@ WARNING: REMOTE HOST IDENTIFICATION HAS CHANGED! @\n' >&2
        printf 'developer@devbox: Permission denied (publickey).\n' >&2
      ) &
    else
      printf 'debug1: Server host key: ssh-ed25519 %s\n' "$SSH_HOST_KEY_TEST_PRESENTED_FINGERPRINT" >&2
      printf '@ WARNING: REMOTE HOST IDENTIFICATION HAS CHANGED! @\n' >&2
      printf 'developer@devbox: Permission denied (publickey).\n' >&2
    fi
  fi
  exit 255
fi

if [ "$strict" = accept-new ]; then
  printf '${HOST_ALIAS} ssh-ed25519 %s\n' "$SSH_HOST_KEY_TEST_PRESENTED_PUBLIC_KEY" >> "$SSH_HOST_KEY_TEST_KNOWN_HOSTS_FILE"
  printf 'developer@devbox: Permission denied (publickey).\n' >&2
  exit 255
fi

printf 'unexpected ssh invocation\n' >&2
exit 2
`;

const FAKE_SSH_KEYSCAN = `#!/bin/sh
printf '%s\n' "$SSH_HOST_KEY_TEST_SCAN_KEY_LINE"
`;

const FAKE_SSH_KEYGEN = `#!/bin/sh
printf 'Host not found in known_hosts\n'
`;
