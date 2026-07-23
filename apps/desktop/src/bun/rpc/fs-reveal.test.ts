import { afterEach, describe, expect, mock, test } from "bun:test";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { SkillContent } from "@llm-space/core";

import { fsReveal } from "./fs-reveal";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { force: true, recursive: true })
    )
  );
});

async function _temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "llm-space-reveal-"));
  temporaryDirectories.push(directory);
  return directory;
}

function _skillsManager(skill: SkillContent | null = null) {
  return {
    findSkill: mock(() => skill),
  };
}

describe("fsReveal", () => {
  test("opens a directory itself", async () => {
    const directory = await _temporaryDirectory();
    const openPath = mock(() => undefined);
    const revealInFileManager = mock(() => Promise.resolve());

    await fsReveal(directory, {
      skillsManager: _skillsManager(),
      openPath,
      revealInFileManager,
    });

    expect(openPath).toHaveBeenCalledWith(directory);
    expect(revealInFileManager).not.toHaveBeenCalled();
  });

  test("reveals a file in its parent directory", async () => {
    const directory = await _temporaryDirectory();
    const file = path.join(directory, "thread.json");
    await writeFile(file, "{}");
    const openPath = mock(() => undefined);
    const revealInFileManager = mock(() => Promise.resolve());

    await fsReveal(file, {
      skillsManager: _skillsManager(),
      openPath,
      revealInFileManager,
    });

    expect(revealInFileManager).toHaveBeenCalledWith(file);
    expect(openPath).not.toHaveBeenCalled();
  });

  test("resolves an internal skill locator to the skill directory", async () => {
    const directory = await _temporaryDirectory();
    const skillDirectory = path.join(directory, "known-skill");
    await mkdir(skillDirectory);
    const skill: SkillContent = {
      content: "",
      frontmatters: { name: "known-skill" },
      path: skillDirectory,
    };
    const skillsManager = _skillsManager(skill);
    const openPath = mock(() => undefined);

    await fsReveal("llm-space://internal/skills/known-skill", {
      skillsManager,
      openPath,
    });

    expect(skillsManager.findSkill).toHaveBeenCalledWith("known-skill", {
      enabledOnly: false,
    });
    expect(openPath).toHaveBeenCalledWith(skillDirectory);
  });

  test("expands a home path before validating it", async () => {
    const openPath = mock(() => undefined);

    await fsReveal("~", {
      skillsManager: _skillsManager(),
      openPath,
    });

    expect(openPath).toHaveBeenCalledWith(os.homedir());
  });

  test("rejects relative and missing paths", async () => {
    expect(
      fsReveal("relative/path", { skillsManager: _skillsManager() })
    ).rejects.toThrow("Path must be absolute");

    const directory = await _temporaryDirectory();
    expect(
      fsReveal(path.join(directory, "missing"), {
        skillsManager: _skillsManager(),
      })
    ).rejects.toThrow("Cannot access path");
  });

  test("follows a symbolic link when choosing the action", async () => {
    const directory = await _temporaryDirectory();
    const target = path.join(directory, "target");
    const link = path.join(directory, "link");
    await mkdir(target);
    await symlink(target, link);
    const openPath = mock(() => undefined);

    await fsReveal(link, {
      skillsManager: _skillsManager(),
      openPath,
    });

    expect(openPath).toHaveBeenCalledWith(link);
  });

  test("rejects invalid internal locators and unknown skills", () => {
    expect(
      fsReveal("llm-space://shared/gist/threads/123", {
        skillsManager: _skillsManager(),
      })
    ).rejects.toThrow("Invalid internal resource locator");

    expect(
      fsReveal("llm-space://internal/skills/unknown-skill", {
        skillsManager: _skillsManager(),
      })
    ).rejects.toThrow("Skill not found");
  });
});
