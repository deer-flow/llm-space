import { describe, expect, test } from "bun:test";

import { parseRemotePlatform } from "./remote-platform";


describe("parseRemotePlatform", () => {
  test("maps linux x64 aliases", () => {
    expect(parseRemotePlatform({ unameS: "Linux", unameM: "x86_64" })).toEqual({
      os: "linux",
      arch: "x64",
    });
    expect(parseRemotePlatform({ unameS: "linux", unameM: "amd64" })).toEqual({
      os: "linux",
      arch: "x64",
    });
  });

  test("maps linux arm64 aliases", () => {
    expect(parseRemotePlatform({ unameS: "Linux", unameM: "aarch64" })).toEqual({
      os: "linux",
      arch: "arm64",
    });
    expect(parseRemotePlatform({ unameS: "Linux", unameM: "arm64" })).toEqual({
      os: "linux",
      arch: "arm64",
    });
  });

  test("rejects unsupported platforms", () => {
    expect(() =>
      parseRemotePlatform({ unameS: "Darwin", unameM: "arm64" })
    ).toThrow("Unsupported remote server OS");
    expect(() =>
      parseRemotePlatform({ unameS: "Linux", unameM: "riscv64" })
    ).toThrow("Unsupported remote server architecture");
  });
});
