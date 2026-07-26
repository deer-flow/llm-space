import { describe, expect, test } from "bun:test";

import desktopPackageJson from "../../desktop/package.json";

import { bunCompileTarget, serverPackageVersion } from "./pack-server";

describe("server package compile target", () => {
  test("maps linux package targets to Bun compile targets", () => {
    expect(bunCompileTarget({ os: "linux", arch: "x64" })).toBe(
      "bun-linux-x64"
    );
    expect(bunCompileTarget({ os: "linux", arch: "arm64" })).toBe(
      "bun-linux-arm64"
    );
  });

  test("rejects unsupported targets defensively", () => {
    expect(() =>
      bunCompileTarget({ os: "linux", arch: "riscv64" as "x64" })
    ).toThrow("Unsupported Bun compile target: linux-riscv64");
  });

  test("uses the desktop app version for server artifacts", () => {
    expect(serverPackageVersion()).toBe(desktopPackageJson.version);
  });
});
