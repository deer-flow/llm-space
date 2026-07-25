import { describe, expect, test } from "bun:test";

import {
  buildInstallFromArchiveCommand,
  buildInstallCommand,
  installRemoteServerPackage,
} from "./remote-server-installer";
import { currentDesktopVersion } from "./server-package";
import type { SshRemoteRuntimeConfig } from "./ssh-bootstrap-config";

const CONFIG: SshRemoteRuntimeConfig = {
  id: "remote:test",
  name: "Remote",
  host: "host",
  extraArgs: [],
  remoteRepo: "/legacy repo",
  remoteInstallDir: "/opt/llm space/runtime",
  remoteHome: "/home/user/.llm-space-server",
  remoteServerPort: 39123,
  makeDefault: false,
};

describe("remote server installer", () => {
  test("skips download when matching manifest is already installed", async () => {
    const commands: string[] = [];
    const result = await installRemoteServerPackage(CONFIG, (_config, command) => {
      commands.push(command);
      if (command.includes("uname")) {
        return Promise.resolve({ stdout: "Linux\nx86_64\n", stderr: "" });
      }
      if (command.startsWith("cat ")) {
        return Promise.resolve({
          stdout: JSON.stringify({
            name: "llm-space-server",
            version: currentDesktopVersion(),
            protocolVersion: 1,
            os: "linux",
            arch: "x64",
            entrypoint: "bin/llm-space-server",
            createdAt: "2026-07-21T00:00:00.000Z",
          }),
          stderr: "",
        });
      }
      if (command.includes("ln -sfn")) {
        return Promise.resolve({ stdout: "", stderr: "" });
      }
      if (command.startsWith("test -x ")) {
        return Promise.resolve({ stdout: "", stderr: "" });
      }
      throw new Error(`unexpected command: ${command}`);
    });

    expect(result.entrypoint).toBe(
      `/opt/llm space/runtime/versions/${currentDesktopVersion()}/bin/llm-space-server`
    );
    expect(commands.some((command) => command.includes("curl -fL"))).toBe(false);
  });

  test("repairs matching manifests with a missing entrypoint", async () => {
    const commands: string[] = [];
    let manifestInstalled = false;
    await installRemoteServerPackage(CONFIG, (_config, command) => {
      commands.push(command);
      if (command.includes("uname")) {
        return Promise.resolve({ stdout: "Linux\nx86_64\n", stderr: "" });
      }
      if (command.startsWith("cat ")) {
        return Promise.resolve({
          stdout: JSON.stringify({
            name: "llm-space-server",
            version: currentDesktopVersion(),
            protocolVersion: 1,
            os: "linux",
            arch: "x64",
            entrypoint: "bin/llm-space-server",
            createdAt: "2026-07-21T00:00:00.000Z",
          }),
          stderr: "",
        });
      }
      if (command.startsWith("test -x ")) {
        if (!manifestInstalled) {
          return Promise.reject(new Error("missing entrypoint"));
        }
        return Promise.resolve({ stdout: "", stderr: "" });
      }
      if (command.includes("curl -fL")) {
        manifestInstalled = true;
        return Promise.resolve({ stdout: "", stderr: "" });
      }
      if (command.includes("ln -sfn")) {
        return Promise.resolve({ stdout: "", stderr: "" });
      }
      throw new Error(`unexpected command: ${command}`);
    });

    expect(commands.some((command) => command.includes("curl -fL"))).toBe(true);
  });

  test("builds safely quoted install command", () => {
    const command = buildInstallCommand({
      installDir: "/opt/llm space/it's",
      version: "4.2.0",
      assetName: "llm-space-server-4.2.0-linux-x64.tar.gz",
      assetUrl: "https://example.test/a'b.tar.gz",
      packageDir: "/opt/llm space/it's/versions/4.2.0",
    });
    expect(command).toContain("/opt/llm space/it'\\''s");
    expect(command).toContain("https://example.test/a'\\''b.tar.gz");
    expect(command).toContain("--connect-timeout 15 --max-time 240");
    expect(command).toContain("--timeout=30 --tries=3");
    expect(command).toContain('ARCHIVE_TMP="$ARCHIVE.tmp-$$"');
    expect(command).toContain('sha256sum "$ARCHIVE_TMP"');
    expect(command).toContain('mv "$ARCHIVE_TMP" "$ARCHIVE"');
    expect(command).not.toContain("/home/user/.llm-space-server");
  });


  test("expands tilde install directories on the remote shell", async () => {
    const tildeConfig = {
      ...CONFIG,
      remoteInstallDir: "~/.llm-space/remote-runtime",
    };
    const commands: string[] = [];

    await installRemoteServerPackage(tildeConfig, (_config, command) => {
      commands.push(command);
      if (command.includes("uname")) {
        return Promise.resolve({ stdout: "Linux\nx86_64\n", stderr: "" });
      }
      if (command.startsWith("cat ")) {
        expect(command).toContain('cat "$HOME"/');
        expect(command).not.toContain("cat '~/.llm-space");
        if (commands.filter((item) => item.startsWith("cat ")).length === 1) {
          return Promise.reject(new Error("missing manifest"));
        }
        return Promise.resolve({
          stdout: JSON.stringify({
            name: "llm-space-server",
            version: currentDesktopVersion(),
            protocolVersion: 1,
            os: "linux",
            arch: "x64",
            entrypoint: "bin/llm-space-server",
            createdAt: "2026-07-21T00:00:00.000Z",
          }),
          stderr: "",
        });
      }
      if (command.includes("curl -fL")) {
        expect(command).toContain('INSTALL_DIR="$HOME"/');
        expect(command).not.toContain("INSTALL_DIR='~/.llm-space/remote-runtime'");
        return Promise.resolve({ stdout: "", stderr: "" });
      }
      if (command.startsWith("test -x ")) {
        expect(command).toContain('test -x "$HOME"/');
        expect(command).not.toContain("test -x '~/.llm-space");
        return Promise.resolve({ stdout: "", stderr: "" });
      }
      if (command.includes("ln -sfn")) {
        expect(command).toContain('"$HOME"/');
        return Promise.resolve({ stdout: "", stderr: "" });
      }
      throw new Error(`unexpected command: ${command}`);
    });

    expect(commands.some((command) => command.includes('INSTALL_DIR="$HOME"/'))).toBe(
      true
    );
  });

  test("builds install-from-archive command without network access", () => {
    const command = buildInstallFromArchiveCommand({
      installDir: "/opt/llm space/it's",
      version: "4.2.0",
      assetName: "llm-space-server-4.2.0-linux-x64.tar.gz",
      packageDir: "/opt/llm space/it's/versions/4.2.0",
    });

    expect(command).toContain("test -f \"$ARCHIVE\"");
    expect(command).toContain("tar -xzf \"$ARCHIVE\"");
    expect(command).toContain(
      "test -x \"$TMP_PACKAGE/bin/llm-space-server\""
    );
    expect(command).toContain(
      'if [ -e "$PACKAGE_DIR" ]; then mv "$PACKAGE_DIR" "$OLD_PACKAGE"; fi'
    );
    expect(command).not.toContain("rm -rf '/opt/llm space/it'\\''s/versions/4.2.0'");
    expect(command).not.toContain("curl");
    expect(command).not.toContain("wget");
    expect(command).not.toContain("ASSET_URL");
  });

  test("describes package download timeouts with remote network probe", async () => {
    const promise = installRemoteServerPackage(CONFIG, (_config, command, timeoutMs) => {
      if (command.includes("uname")) {
        return Promise.resolve({ stdout: "Linux\nx86_64\n", stderr: "" });
      }
      if (command.startsWith("cat ")) {
        return Promise.reject(new Error("missing manifest"));
      }
      if (command.includes("curl -fL")) {
        expect(timeoutMs).toBe(300_000);
        return Promise.reject(
          new Error("Remote command timed out after 300000ms.")
        );
      }
      throw new Error(`unexpected command: ${command}`);
    });

    try {
      await promise;
      throw new Error("install should fail");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toMatch(
        /Remote runtime package download timed out after 300000ms\. Package URL: https:\/\/github\.com\/deer-flow\/llm-space\/releases\/download\//
      );
      expect((error as Error).message).toMatch(
        /Remote runtime package download timed out after 300000ms\..*Check remote network access with: ssh host/s
      );
    }
  });

  test("uses a shorter remote download timeout when upload fallback is available", async () => {
    const promise = installRemoteServerPackage(
      CONFIG,
      (_config, command, timeoutMs) => {
        if (command.includes("uname")) {
          return Promise.resolve({ stdout: "Linux\nx86_64\n", stderr: "" });
        }
        if (command.startsWith("cat ")) {
          return Promise.reject(new Error("missing manifest"));
        }
        if (command.includes("curl -fL")) {
          expect(command).toContain("--connect-timeout 15 --max-time 120");
          expect(timeoutMs).toBe(120_000);
          return Promise.reject(
            new Error("Remote command timed out after 120000ms.")
          );
        }
        throw new Error(`unexpected command: ${command}`);
      },
      {
        packageUploader: {
          upload: () => Promise.reject(new Error("upload denied")),
        },
      }
    );

    try {
      await promise;
      throw new Error("install should fail");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toMatch(
        /Remote runtime package download timed out after 120000ms\. Package URL: https:\/\/github\.com\/deer-flow\/llm-space\/releases\/download\//
      );
    }
  });

  test("puts package URL before verbose remote command output", async () => {
    const promise = installRemoteServerPackage(CONFIG, (_config, command) => {
      if (command.includes("uname")) {
        return Promise.resolve({ stdout: "Linux\naarch64\n", stderr: "" });
      }
      if (command.startsWith("cat ")) {
        return Promise.reject(new Error("missing manifest"));
      }
      if (command.includes("curl -fL")) {
        return Promise.reject(
          new Error("Remote command failed with exit code 28: % Total noisy curl progress")
        );
      }
      throw new Error(`unexpected command: ${command}`);
    });

    try {
      await promise;
      throw new Error("install should fail");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      const message = (error as Error).message;
      const urlIndex = message.indexOf("Package URL:");
      const outputIndex = message.indexOf("Remote command failed with exit code 28");
      expect(urlIndex).toBeGreaterThanOrEqual(0);
      expect(outputIndex).toBeGreaterThan(urlIndex);
      expect(message).toContain(
        `llm-space-server-${currentDesktopVersion()}-linux-arm64.tar.gz`
      );
    }
  });

  test("falls back to local package upload when remote download fails", async () => {
    const commands: string[] = [];
    const timeouts: number[] = [];
    const uploads: string[] = [];
    let manifestInstalled = false;
    const result = await installRemoteServerPackage(
      CONFIG,
      (_config, command, timeoutMs) => {
        commands.push(command);
        if (command.includes("uname")) {
          return Promise.resolve({ stdout: "Linux\nx86_64\n", stderr: "" });
        }
        if (command.startsWith("cat ")) {
          if (!manifestInstalled) {
            return Promise.reject(new Error("missing manifest"));
          }
          return Promise.resolve({
            stdout: JSON.stringify({
              name: "llm-space-server",
              version: currentDesktopVersion(),
              protocolVersion: 1,
              os: "linux",
              arch: "x64",
              entrypoint: "bin/llm-space-server",
              createdAt: "2026-07-21T00:00:00.000Z",
            }),
            stderr: "",
          });
        }
        if (command.includes("curl -fL")) {
          timeouts.push(timeoutMs ?? 0);
          return Promise.reject(
            new Error("Remote command failed with exit code 28: curl timeout")
          );
        }
        if (command.includes("test -f \"$ARCHIVE\"")) {
          timeouts.push(timeoutMs ?? 0);
          manifestInstalled = true;
          return Promise.resolve({ stdout: "", stderr: "" });
        }
        if (command.startsWith("test -x ")) {
          return Promise.resolve({ stdout: "", stderr: "" });
        }
        if (command.includes("ln -sfn")) {
          return Promise.resolve({ stdout: "", stderr: "" });
        }
        throw new Error(`unexpected command: ${command}`);
      },
      {
        packageUploader: {
          upload: (input) => {
            uploads.push(input.remoteArchivePath);
            return Promise.resolve();
          },
        },
      }
    );

    expect(result.entrypoint).toBe(
      `/opt/llm space/runtime/versions/${currentDesktopVersion()}/bin/llm-space-server`
    );
    expect(uploads).toEqual([
      `/opt/llm space/runtime/downloads/llm-space-server-${currentDesktopVersion()}-linux-x64.tar.gz`,
    ]);
    expect(timeouts).toEqual([120_000, 300_000]);
    expect(commands.some((command) => command.includes("curl -fL"))).toBe(true);
    expect(
      commands.some(
        (command) =>
          command.includes("test -f \"$ARCHIVE\"") && !command.includes("curl -fL")
      )
    ).toBe(true);
  });

  test("reports both remote download and local fallback failures", async () => {
    const promise = installRemoteServerPackage(
      CONFIG,
      (_config, command) => {
        if (command.includes("uname")) {
          return Promise.resolve({ stdout: "Linux\nx86_64\n", stderr: "" });
        }
        if (command.startsWith("cat ")) {
          return Promise.reject(new Error("missing manifest"));
        }
        if (command.includes("curl -fL")) {
          return Promise.reject(
            new Error("Remote command failed with exit code 28: curl timeout")
          );
        }
        throw new Error(`unexpected command: ${command}`);
      },
      {
        packageUploader: {
          upload: () => Promise.reject(new Error("upload denied")),
        },
      }
    );

    try {
      await promise;
      throw new Error("install should fail");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      const message = (error as Error).message;
      expect(message).toContain("Remote download failed");
      expect(message).toContain("Local package upload failure");
      expect(message).toContain("upload denied");
    }
  });
});
