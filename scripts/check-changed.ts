import { existsSync } from "node:fs";
import path from "node:path";

import { ESLint } from "eslint";
import ts from "typescript";

const ROOT = process.cwd();
const MODE = Bun.argv[2] ?? "all";
const EXPLICIT_FILES = Bun.argv.slice(3);
const LINT_FILE_RE = /\.(?:[cm]?[jt]s|[jt]sx)$/;
const TYPECHECK_FILE_RE = /\.(?:[cm]?ts|tsx)$/;
const VALID_MODES = new Set(["all", "lint", "lint:fix", "typecheck"]);

function _runGit(args: string[]): string[] {
  const result = Bun.spawnSync({
    cmd: ["git", ...args, "-z"],
    cwd: ROOT,
    stdout: "pipe",
    stderr: "pipe",
  });
  if (result.exitCode !== 0) {
    throw new Error(new TextDecoder().decode(result.stderr).trim());
  }
  return new TextDecoder()
    .decode(result.stdout)
    .split("\0")
    .filter(Boolean);
}

function _collectFiles(): string[] {
  const files =
    EXPLICIT_FILES.length > 0
      ? EXPLICIT_FILES
      : [
          ..._runGit(["diff", "--name-only", "--diff-filter=ACMR", "HEAD"]),
          ..._runGit(["ls-files", "--others", "--exclude-standard"]),
        ];

  return [...new Set(files)]
    .map((file) => path.resolve(ROOT, file))
    .filter((file) => file.startsWith(`${ROOT}${path.sep}`) && existsSync(file));
}

function _findTsconfig(file: string): string | undefined {
  let directory = path.dirname(file);
  while (directory.startsWith(ROOT)) {
    const candidate = path.join(directory, "tsconfig.json");
    if (existsSync(candidate)) return candidate;
    if (directory === ROOT) break;
    directory = path.dirname(directory);
  }
  return undefined;
}

async function _lint(files: string[], fix: boolean): Promise<boolean> {
  const eslint = new ESLint({ fix });
  const candidates = files.filter((file) => LINT_FILE_RE.test(file));
  const ignored = await Promise.all(
    candidates.map((file) => eslint.isPathIgnored(file))
  );
  const lintFiles = candidates.filter((_file, index) => !ignored[index]);
  if (lintFiles.length === 0) {
    console.info("No changed files require linting.");
    return true;
  }

  const results = await eslint.lintFiles(lintFiles);
  if (fix) await ESLint.outputFixes(results);
  const formatter = await eslint.loadFormatter("stylish");
  const output = await formatter.format(results);
  if (output) console.info(output);

  const issueCount = results.reduce(
    (total, result) => total + result.errorCount + result.warningCount,
    0
  );
  console.info(`Linted ${lintFiles.length} changed files.`);
  return issueCount === 0;
}

function _typecheck(files: string[]): boolean {
  const typecheckFiles = files.filter((file) => TYPECHECK_FILE_RE.test(file));
  const projects = new Map<string, string[]>();

  for (const file of typecheckFiles) {
    const configPath = _findTsconfig(file);
    if (!configPath) {
      console.error(`No tsconfig.json includes ${path.relative(ROOT, file)}.`);
      return false;
    }
    const projectFiles = projects.get(configPath) ?? [];
    projectFiles.push(file);
    projects.set(configPath, projectFiles);
  }

  if (projects.size === 0) {
    console.info("No changed files require typechecking.");
    return true;
  }

  const diagnostics: ts.Diagnostic[] = [];
  for (const [configPath, projectFiles] of projects) {
    const config = ts.readConfigFile(configPath, (file) => ts.sys.readFile(file));
    if (config.error) {
      diagnostics.push(config.error);
      continue;
    }
    const parsed = ts.parseJsonConfigFileContent(
      config.config,
      ts.sys,
      path.dirname(configPath),
      undefined,
      configPath
    );
    diagnostics.push(...parsed.errors);
    const program = ts.createProgram(parsed.fileNames, parsed.options);

    for (const file of projectFiles) {
      const sourceFile = program.getSourceFile(file);
      if (!sourceFile) {
        diagnostics.push({
          category: ts.DiagnosticCategory.Error,
          code: 18003,
          file: undefined,
          length: undefined,
          start: undefined,
          messageText: `${path.relative(ROOT, file)} is not included by ${path.relative(ROOT, configPath)}.`,
        });
        continue;
      }
      diagnostics.push(...program.getSyntacticDiagnostics(sourceFile));
      diagnostics.push(...program.getSemanticDiagnostics(sourceFile));
    }
  }

  if (diagnostics.length > 0) {
    console.error(
      ts.formatDiagnosticsWithColorAndContext(diagnostics, {
        getCanonicalFileName: (fileName) => fileName,
        getCurrentDirectory: () => ROOT,
        getNewLine: () => "\n",
      })
    );
    return false;
  }

  console.info(`Typechecked ${typecheckFiles.length} changed files.`);
  return true;
}

if (!VALID_MODES.has(MODE)) {
  console.error(`Unknown mode: ${MODE}`);
  process.exitCode = 1;
} else {
  const files = _collectFiles();
  const lintPassed =
    MODE === "typecheck" ? true : await _lint(files, MODE === "lint:fix");
  const typecheckPassed =
    MODE === "lint" || MODE === "lint:fix" ? true : _typecheck(files);
  if (!lintPassed || !typecheckPassed) process.exitCode = 1;
}
