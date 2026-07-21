"use client";

import type {
  McpServerView,
  ModelConfig,
  ModelProviderGroup,
  SearchSettings,
  ThreadContext,
} from "@llm-space/core";
import {
  envFile,
  getGenerator,
  mcpEnvEntries,
  type GeneratorCapabilities,
  type GeneratorMcpServer,
  type GeneratorModelInfo,
  type GeneratorResult,
} from "@llm-space/core/generator";
import { renderThreadPromptVariables } from "@llm-space/core/thread";
import {
  createOneShotRunner,
  createWorkflowContext,
  type WorkflowEvent,
} from "@llm-space/core/workflow";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckIcon,
  CopyIcon,
  ExternalLinkIcon,
  FolderIcon,
  FolderOpenIcon,
  SparklesIcon,
  TerminalIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { useHostServices } from "@llm-space/ui/host";
import { Spinner } from "@llm-space/ui/ui/spinner";

import { cn } from "../../../lib/utils";
import { Button } from "../../../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../ui/dialog";
import { Input } from "../../../ui/input";
import { ConfirmDialog } from "../../confirm-dialog";
import { useFirstAvailableModel, useModels } from "../../model-provider";
import { Tooltip } from "../../tooltip";
import { useThreadStore } from "../stores/thread-store";
import { listEnabledPromptVariableSkills } from "../variable/prompt-variable-skills";

/** The generator to run. V1 ships only LangGraph. */
const GENERATOR_ID = "langgraph";

/** Default parent directory — the Desktop is the natural home for a new project. */
const DEFAULT_PARENT_DIR = "~/Desktop";

/** Astral's uv installation guide, opened from the "uv required" gate. */
const UV_INSTALL_URL = "https://docs.astral.sh/uv/getting-started/installation/";

/** Selectable target frameworks. Only LangGraph is available in V1. */
const FRAMEWORKS = [
  {
    id: "langgraph",
    name: "LangGraph",
    stack: "Python",
    description:
      "Scaffolds a uv-managed Python project with a runnable LangGraph agent — ships with a local web UI and step debugger (LangGraph Studio) out of the box.",
    available: true,
  },
] as const;

type WizardStep = "framework" | "target" | "run";

/**
 * Header action that exports the current thread as a runnable code project via
 * the pluggable `@llm-space/core/generator`. A step-by-step wizard walks the
 * user through: (1) picking a framework, (2) choosing a parent directory +
 * project name, then (3) watching generation progress. Deterministically
 * scaffolds the project + exports context, then makes one model call to write a
 * PLAN.md a coding agent can finish. Hidden on hosts without generator support
 * (web).
 */
export function GenerateProjectButton() {
  const {
    generator,
    transport,
    skills,
    files,
    builtinTools,
    mcp,
    actions,
    presentational,
  } = useHostServices();
  const context = useThreadStore((s) => s.thread.context);
  const savedModel = useThreadStore((s) => s.thread.model);
  const title = useThreadStore((s) => s.thread.title);
  const fallbackModel = useFirstAvailableModel();
  const providers = useModels();
  const model = savedModel ?? fallbackModel;

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<WizardStep>("framework");
  const [framework, setFramework] = useState<string>(GENERATOR_ID);

  // Directory step.
  const [parentDir, setParentDir] = useState(DEFAULT_PARENT_DIR);
  const [projectName, setProjectName] = useState("");
  const [preparing, setPreparing] = useState(false);
  const [targetError, setTargetError] = useState<string | null>(null);

  // Run step.
  const abortRef = useRef<AbortController | null>(null);
  const [uvMissing, setUvMissing] = useState(false);
  const [running, setRunning] = useState(false);
  const [events, setEvents] = useState<WorkflowEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GeneratorResult | null>(null);
  const [lastSearch, setLastSearch] = useState<SearchSettings | undefined>(
    undefined
  );
  // The thread's MCP servers, resolved from settings for the run — kept so the
  // opt-in `.env` can write their secrets alongside the model/search keys.
  const [lastMcpServers, setLastMcpServers] = useState<GeneratorMcpServer[]>(
    []
  );

  // Post-success: opt-in ".env with real keys" confirmation.
  const [envConfirmOpen, setEnvConfirmOpen] = useState(false);
  const [writingEnv, setWritingEnv] = useState(false);

  // Seed the wizard fresh each time it opens.
  useEffect(() => {
    if (!open) {
      return;
    }
    setStep("framework");
    setFramework(GENERATOR_ID);
    setParentDir(DEFAULT_PARENT_DIR);
    setProjectName(_defaultProjectName(title));
    setTargetError(null);
    setPreparing(false);
    setUvMissing(false);
    setRunning(false);
    setEvents([]);
    setError(null);
    setResult(null);
    setLastSearch(undefined);
    setLastMcpServers([]);
    setEnvConfirmOpen(false);
    setWritingEnv(false);
  }, [open, title]);

  const targetPreview = useMemo(
    () => _joinPreview(parentDir, projectName),
    [parentDir, projectName]
  );

  const runGeneration = useCallback(
    async (targetDir: string) => {
      if (!generator || !transport || !model) {
        return;
      }
      setRunning(true);
      setEvents([]);
      setError(null);
      setResult(null);

      const capabilities: GeneratorCapabilities = {
        checkUv: () => generator.checkUv(),
        runUv: async (rootDir, args) => {
          const res = await generator.runUv(rootDir, args);
          if (res.code !== 0) {
            throw new Error(
              `uv ${args.join(" ")} failed (exit ${res.code}):\n${
                res.stderr || res.stdout
              }`
            );
          }
          return res;
        },
        writeFile: (rootDir, relativePath, contents) =>
          generator.writeFile(rootDir, relativePath, contents),
        removeFile: (rootDir, relativePath) =>
          generator.removeFile(rootDir, relativePath),
      };

      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const skillList = await listEnabledPromptVariableSkills(skills);
        const rendered = await renderThreadPromptVariables({
          context: context ?? {},
          loadSkills: () => Promise.resolve(skillList),
          loadFile: (path) => files.readText(path),
        });
        // Ship the raw prompt (variables live at runtime), with `@include`
        // macros expanded now since the generated project renders with Jinja2.
        const systemPromptTemplate = await _expandIncludes(
          context?.systemPrompt ?? "",
          (path) => files.readText(path)
        );
        const renderedVariableValues: Record<string, string> =
          Object.fromEntries(rendered.variables.map((v) => [v.name, v.value]));
        const workflow = createWorkflowContext({
          runOneShot: createOneShotRunner({ transport }),
          defaultModel: model,
          signal: controller.signal,
          report: (event) => setEvents((prev) => [...prev, event]),
        });
        const definition = getGenerator(framework);
        if (!definition) {
          throw new Error(`Unknown generator: ${framework}`);
        }
        // Best-effort: the user's search settings seed the project's .env when
        // it ships web tools. A failure here shouldn't abort generation.
        const searchInfo = await generator
          .getSearchSettings()
          .catch(() => undefined);
        setLastSearch(searchInfo);
        // Resolve the thread's MCP tools to their server configs (transport,
        // command/URL) from settings so the generated project connects for real.
        // Best-effort — a failure here shouldn't abort generation.
        const mcpServers = await _resolveMcpServers(context, mcp);
        setLastMcpServers(mcpServers);
        const outcome = await definition.run(workflow, {
          targetDir,
          context: context ?? {},
          rendered: rendered.context,
          systemPromptTemplate,
          skills: skillList.map((s) => ({ name: s.name, path: s.path })),
          renderedVariableValues,
          model,
          modelInfo: _resolveModelInfo(providers, model),
          searchInfo,
          mcpServers,
          capabilities,
        });
        if (outcome) {
          setResult(outcome);
          // Open the finished project folder so the user lands right in it.
          void builtinTools.openAbsolutePath(outcome.dir);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setRunning(false);
      }
    },
    [
      generator,
      transport,
      model,
      context,
      skills,
      files,
      framework,
      providers,
      mcp,
      builtinTools,
    ]
  );

  // Directory step "Next": require uv, validate + create the target, then run.
  const prepareAndRun = useCallback(async () => {
    if (!generator) {
      return;
    }
    if (!model) {
      toast.error("No model available for code generation.");
      return;
    }
    setPreparing(true);
    setTargetError(null);
    try {
      // uv is required to scaffold the project — gate on it before creating
      // anything, and send the user to the install guide if it's missing.
      const uv = await generator.checkUv();
      if (!uv.installed) {
        setUvMissing(true);
        setStep("run");
        return;
      }
      const prepared = await generator.prepareDirectory(parentDir, projectName);
      if (!prepared.ok) {
        setTargetError(prepared.error);
        return;
      }
      setUvMissing(false);
      setStep("run");
      void runGeneration(prepared.dir);
    } catch (e) {
      setTargetError(e instanceof Error ? e.message : String(e));
    } finally {
      setPreparing(false);
    }
  }, [generator, model, parentDir, projectName, runGeneration]);

  // Abort an in-progress run and close the wizard.
  const cancelRun = useCallback(() => {
    abortRef.current?.abort();
    setOpen(false);
  }, []);

  const browseParent = useCallback(async () => {
    if (!generator) {
      return;
    }
    const picked = await generator.pickDirectory();
    if (picked.path) {
      setParentDir(picked.path);
      setTargetError(null);
    }
  }, [generator]);

  // Opt-in: write a real `.env` into the generated project, resolving the
  // model + search keys to their actual values (following `$ENV` references).
  const createEnvFile = useCallback(async () => {
    if (!generator || !model || !result) {
      return;
    }
    setWritingEnv(true);
    try {
      const modelInfo = _resolveModelInfo(providers, model);
      const usesWebTools = (context?.tools ?? []).some(
        (t) =>
          t.type === "builtin" &&
          (t.name === "web_search" || t.name === "web_fetch")
      );
      const search = usesWebTools ? lastSearch : undefined;

      // Ask the host for the model's resolved key + any `$ENV` search values.
      const envNames: string[] = [];
      if (search) {
        for (const raw of [
          search.firecrawlApiKey,
          search.tavilyApiKey,
          search.braveApiKey,
        ]) {
          if (raw?.startsWith("$")) {
            envNames.push(raw.slice(1));
          }
        }
      }
      const { modelApiKey, envValues } = await generator.resolveEnv(
        model.provider,
        envNames
      );
      const resolveKey = (raw: string | undefined) =>
        !raw ? "" : raw.startsWith("$") ? (envValues[raw.slice(1)] ?? "") : raw;
      const resolvedSearch: SearchSettings | undefined = search
        ? {
            provider: search.provider,
            firecrawlApiKey: resolveKey(search.firecrawlApiKey),
            tavilyApiKey: resolveKey(search.tavilyApiKey),
            braveApiKey: resolveKey(search.braveApiKey),
          }
        : undefined;

      const contents = envFile(
        model,
        { ...modelInfo, apiKey: modelApiKey },
        resolvedSearch,
        mcpEnvEntries(lastMcpServers)
      );
      await generator.writeFile(result.dir, ".env", contents);
      toast.success(".env created with your keys.");
    } catch (e) {
      toast.error("Couldn't create .env", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setWritingEnv(false);
      setEnvConfirmOpen(false);
      setOpen(false);
    }
  }, [generator, model, result, providers, context, lastSearch, lastMcpServers]);

  if (presentational || !generator || !transport) {
    return null;
  }

  const busy = running || preparing;

  return (
    <>
      <Tooltip
        content={
          <span className="flex items-center gap-1.5">
            Generate a runnable agent for this thread
            <BetaBadge />
          </span>
        }
      >
        <Button
          variant="ghost"
          size="icon-lg"
          aria-label="Generate a runnable agent (Beta)"
          disabled={running || !model}
          onClick={() => setOpen(true)}
        >
          <SparklesIcon className="size-4" />
        </Button>
      </Tooltip>

      <Dialog
        open={open}
        onOpenChange={busy ? undefined : setOpen}
      >
        <DialogContent className="flex h-[36rem] flex-col sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <SparklesIcon className="text-primary size-4" />
              Generate a runnable agent
              <BetaBadge />
            </DialogTitle>
            <DialogDescription>
              {step === "framework"
                ? "Turn this thread into a runnable code project — its prompt, tools, variables, and messages, plus a PLAN.md for a coding agent to finish."
                : step === "target"
                  ? "Choose where the project is created."
                  : uvMissing
                    ? "uv is needed to scaffold the project."
                    : result
                      ? "All set — a few steps to run your agent."
                      : "Scaffolding the project and writing its plan."}
            </DialogDescription>
          </DialogHeader>

          <StepIndicator step={step} />

          <div className="min-h-0 flex-1 overflow-y-auto">
            {step === "framework" ? (
              <FrameworkStep selected={framework} onSelect={setFramework} />
            ) : null}

            {step === "target" ? (
              <TargetStep
                parentDir={parentDir}
                projectName={projectName}
                targetPreview={targetPreview}
                error={targetError}
                disabled={preparing}
                onParentChange={(next) => {
                  setParentDir(next);
                  setTargetError(null);
                }}
                onNameChange={(next) => {
                  setProjectName(next);
                  setTargetError(null);
                }}
                onBrowse={browseParent}
              />
            ) : null}

            {step === "run" && uvMissing ? <UvMissingStep /> : null}

            {step === "run" && !uvMissing && result ? (
              <SuccessStep
                dir={result.dir}
                envWritten={result.files.includes(".env")}
                hasFunctionTools={(context?.tools ?? []).some(
                  (t) => t.type === "function"
                )}
              />
            ) : null}

            {step === "run" && !uvMissing && !result ? (
              <RunStep events={events} error={error} running={running} />
            ) : null}
          </div>

          <DialogFooter>
            {step === "framework" ? (
              <>
                <Button variant="ghost" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={() => setStep("target")}>
                  Next
                  <ArrowRightIcon className="size-4" />
                </Button>
              </>
            ) : null}

            {step === "target" ? (
              <>
                <Button
                  variant="ghost"
                  disabled={preparing}
                  onClick={() => setStep("framework")}
                >
                  <ArrowLeftIcon className="size-4" />
                  Back
                </Button>
                <Button
                  disabled={preparing || !projectName.trim()}
                  onClick={prepareAndRun}
                >
                  {preparing ? <Spinner className="size-3" /> : null}
                  {preparing ? "Checking…" : "Generate"}
                </Button>
              </>
            ) : null}

            {step === "run" && uvMissing ? (
              <>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setUvMissing(false);
                    setStep("target");
                  }}
                >
                  <ArrowLeftIcon className="size-4" />
                  Back
                </Button>
                <Button onClick={() => actions.openLink(UV_INSTALL_URL)}>
                  <ExternalLinkIcon className="size-4" />
                  Install uv
                </Button>
              </>
            ) : null}

            {step === "run" && !uvMissing ? (
              <>
                {result ? (
                  <Button
                    variant="ghost"
                    onClick={() => builtinTools.openAbsolutePath(result.dir)}
                  >
                    <FolderOpenIcon className="size-4" />
                    Open folder
                  </Button>
                ) : null}
                {running ? (
                  <Button variant="ghost" onClick={cancelRun}>
                    Cancel
                  </Button>
                ) : null}
                <Button
                  variant="default"
                  disabled={running}
                  onClick={() =>
                    result ? setEnvConfirmOpen(true) : setOpen(false)
                  }
                >
                  {running ? <Spinner className="size-3" /> : null}
                  {running ? "Generating…" : "Done"}
                </Button>
              </>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={envConfirmOpen}
        onOpenChange={(next) => {
          // Dismiss ("No" / escape / outside) finishes without writing .env.
          if (!next && !writingEnv) {
            setEnvConfirmOpen(false);
            setOpen(false);
          }
        }}
        title="Create a .env file for you?"
        description="Write your model and search-engine API keys — resolving values from your environment variables — into the project's .env so it's ready to run. You can also do this yourself later."
        cancelLabel="No thanks"
        confirmLabel="Yes, create .env"
        confirmVariant="default"
        dimBackground={false}
        onConfirm={createEnvFile}
      />
    </>
  );
}

/** A small "Beta" pill marking this as an experimental feature. */
function BetaBadge() {
  return (
    <span className="bg-primary/15 text-primary rounded px-1.5 py-0.5 text-[0.625rem] font-semibold uppercase tracking-wide">
      Beta
    </span>
  );
}

/** Ordered wizard steps with their stepper titles. */
const STEPS: { id: WizardStep; title: string }[] = [
  { id: "framework", title: "Framework" },
  { id: "target", title: "Directory" },
  { id: "run", title: "Generate" },
];

/**
 * Horizontal numbered stepper (reui-style): each step is an indicator circle +
 * title, joined by a connector line that fills as steps complete. Completed
 * steps show a checkmark, the active step is highlighted, pending steps muted.
 */
function StepIndicator({ step }: { step: WizardStep }) {
  const activeIndex = STEPS.findIndex((s) => s.id === step);
  return (
    <div className="flex items-center">
      {STEPS.map((s, index) => {
        const state =
          index < activeIndex
            ? "completed"
            : index === activeIndex
              ? "active"
              : "pending";
        return (
          <div
            key={s.id}
            className={cn("flex items-center", index === 0 ? "" : "flex-1")}
          >
            {index > 0 ? (
              <span
                className={cn(
                  "mx-3 h-px flex-1 transition-colors",
                  index <= activeIndex ? "bg-primary" : "bg-border/60"
                )}
              />
            ) : null}
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-medium transition-colors",
                  state === "completed" &&
                    "border-primary bg-primary text-primary-foreground",
                  state === "active" &&
                    "border-primary text-primary bg-primary/10",
                  state === "pending" &&
                    "border-border/60 text-muted-foreground"
                )}
              >
                {state === "completed" ? (
                  <CheckIcon className="size-3.5" />
                ) : (
                  index + 1
                )}
              </span>
              <span
                className={cn(
                  "text-sm font-medium transition-colors",
                  state === "pending"
                    ? "text-muted-foreground"
                    : "text-foreground"
                )}
              >
                {s.title}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Step 1 — pick the target framework (only LangGraph is available in V1). */
function FrameworkStep({
  selected,
  onSelect,
}: {
  selected: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      {FRAMEWORKS.map((fw) => {
        const isSelected = fw.id === selected;
        return (
          <button
            key={fw.id}
            type="button"
            disabled={!fw.available}
            aria-pressed={isSelected}
            onClick={() => fw.available && onSelect(fw.id)}
            className={cn(
              "flex items-start gap-3 rounded-xl border px-4 py-3 text-left transition-colors",
              isSelected
                ? "border-primary bg-primary/5"
                : "border-border/60 bg-muted/15 hover:bg-muted/30",
              !fw.available && "cursor-not-allowed opacity-50"
            )}
          >
            <span
              className={cn(
                "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg",
                isSelected
                  ? "bg-primary/10 text-primary"
                  : "bg-muted text-muted-foreground"
              )}
            >
              <SparklesIcon className="size-4" />
            </span>
            <span className="flex min-w-0 flex-col gap-1">
              <span className="flex items-center gap-2 text-sm font-medium">
                {fw.name}
                <span className="text-muted-foreground bg-muted rounded px-1.5 py-0.5 text-[0.6875rem] font-normal">
                  {fw.stack}
                </span>
              </span>
              <span className="text-muted-foreground text-xs/relaxed">
                {fw.description}
              </span>
            </span>
            <span
              className={cn(
                "mt-1 shrink-0 transition-opacity",
                isSelected ? "text-primary opacity-100" : "opacity-0"
              )}
            >
              <CheckIcon className="size-4" />
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Step 2 — parent directory, project name, and the combined target preview. */
function TargetStep({
  parentDir,
  projectName,
  targetPreview,
  error,
  disabled,
  onParentChange,
  onNameChange,
  onBrowse,
}: {
  parentDir: string;
  projectName: string;
  targetPreview: string;
  error: string | null;
  disabled: boolean;
  onParentChange: (next: string) => void;
  onNameChange: (next: string) => void;
  onBrowse: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <Field label="Parent directory">
        <div className="flex items-center gap-2">
          <Input
            value={parentDir}
            disabled={disabled}
            spellCheck={false}
            className="font-mono"
            onChange={(e) => onParentChange(e.target.value)}
            placeholder="~"
          />
          <Button
            variant="secondary"
            size="sm"
            disabled={disabled}
            onClick={onBrowse}
          >
            <FolderIcon className="size-4" />
            Browse
          </Button>
        </div>
      </Field>

      <Field label="Project name">
        <Input
          value={projectName}
          disabled={disabled}
          spellCheck={false}
          className="font-mono"
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="my-agent"
        />
      </Field>

      <Field label="The project will be created at">
        <div className="border-border/60 bg-muted/30 text-muted-foreground truncate rounded-md border px-2 py-1.5 font-mono text-xs">
          {targetPreview}
        </div>
      </Field>

      {error ? (
        <div className="text-destructive text-xs/relaxed">{error}</div>
      ) : null}
    </div>
  );
}

/** A stacked label-above-control field, matching the settings pages' rhythm. */
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium">{label}</span>
      {children}
    </div>
  );
}

/**
 * Step 3 (gate) — shown when `uv` isn't on PATH. `uv` is required to scaffold
 * the Python project, so we stop here and point the user at Astral's installer.
 */
function UvMissingStep() {
  return (
    <div className="flex flex-col gap-4">
      <div className="border-border/60 bg-muted/15 flex items-start gap-3 rounded-xl border px-4 py-3">
        <span className="bg-muted text-muted-foreground mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg">
          <TerminalIcon className="size-4" />
        </span>
        <span className="flex flex-col gap-1">
          <span className="text-sm font-medium">uv is required</span>
          <span className="text-muted-foreground text-xs/relaxed">
            This generator uses{" "}
            <span className="font-mono">uv</span> — Astral&apos;s Python package
            manager — to scaffold the project and install dependencies. It
            wasn&apos;t found on your PATH.
          </span>
        </span>
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium">Install it, then come back</span>
        <div className="border-border/60 bg-muted/30 text-muted-foreground rounded-md border px-2 py-1.5 font-mono text-xs">
          curl -LsSf https://astral.sh/uv/install.sh | sh
        </div>
        <span className="text-muted-foreground text-xs">
          Or click “Install uv” to open the installation guide. Once installed,
          go back and generate again.
        </span>
      </div>
    </div>
  );
}

/** Step 3 — live generation progress (or an error). Success → {@link SuccessStep}. */
function RunStep({
  events,
  error,
  running,
}: {
  events: WorkflowEvent[];
  error: string | null;
  running: boolean;
}) {
  return (
    <div className="flex h-full flex-col gap-3">
      <div className="border-border/60 bg-muted/15 min-h-0 flex-1 overflow-y-auto rounded-xl border p-3 font-mono text-xs">
        {events.length === 0 && !error ? (
          <div className="text-muted-foreground">Starting…</div>
        ) : null}
        {events.map((event, index) => (
          <ProgressLine key={index} event={event} />
        ))}
        {error ? (
          <div className="text-destructive mt-2 whitespace-pre-wrap">
            {error}
          </div>
        ) : null}
      </div>

      {running ? (
        <p className="text-muted-foreground text-xs">
          This can take a moment while dependencies install.
        </p>
      ) : null}
    </div>
  );
}

/**
 * The final success page: a hero confirmation and an elegant numbered list of
 * what to do next — set up `.env`, (if there are custom tools) finish them via
 * PLAN.md in a coding agent, and launch `langgraph dev` to open LangGraph Studio.
 */
function SuccessStep({
  dir,
  envWritten,
  hasFunctionTools,
}: {
  dir: string;
  envWritten: boolean;
  hasFunctionTools: boolean;
}) {
  const steps: { title: string; body: React.ReactNode }[] = [];

  steps.push({
    title: "Set up your environment",
    body: envWritten ? (
      <p className="text-muted-foreground text-xs/relaxed">
        Your API keys were written to{" "}
        <code className="text-foreground font-mono">.env</code> — open it to
        review and fill in anything still blank.
      </p>
    ) : (
      <>
        <CommandBlock command="cp .env.example .env" />
        <p className="text-muted-foreground text-xs/relaxed">
          Then add your API keys.
        </p>
      </>
    ),
  });

  steps.push({
    title: "Finish it in your coding agent",
    body: (
      <p className="text-muted-foreground text-xs/relaxed">
        Open <code className="text-foreground font-mono">PLAN.md</code> in your
        coding agent (Claude Code, Cursor, Codex…) and follow it
        {hasFunctionTools ? (
          <>
            {" "}
            to implement your custom function tools — the agent won&apos;t run
            until they&apos;re filled in.
          </>
        ) : (
          " to review the project and finish any remaining steps."
        )}
      </p>
    ),
  });

  steps.push({
    title: "Launch & explore",
    body: (
      <>
        <CommandBlock command={`cd ${_shellQuote(dir)} && uv run langgraph dev`} />
        <p className="text-muted-foreground text-xs/relaxed">
          Then open LangGraph Studio in your browser to inspect, trace, and run
          your agent.
        </p>
      </>
    ),
  });

  return (
    <div className="flex flex-col">
      <div className="flex flex-col items-center gap-3 pb-7 pt-1 text-center">
        <div className="ring-emerald-500/20 flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400/20 to-primary/20 ring-1">
          <CheckIcon className="size-7 text-emerald-500" />
        </div>
        <div className="flex flex-col gap-1">
          <h3 className="text-lg font-semibold tracking-tight">
            Your agent is ready
          </h3>
          <p className="text-muted-foreground max-w-md truncate text-xs">
            Generated at <span className="font-mono">{dir}</span>
          </p>
        </div>
      </div>

      <div className="border-border/60 bg-muted/15 flex flex-col gap-5 rounded-xl border p-5">
        <span className="text-muted-foreground text-[0.6875rem] font-medium uppercase tracking-wider">
          Next steps
        </span>
        {steps.map((s, index) => (
          <div key={s.title} className="flex gap-3">
            <span className="border-primary/40 bg-primary/10 text-primary mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-medium">
              {index + 1}
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <span className="text-sm font-medium">{s.title}</span>
              {s.body}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** A copyable monospace command chip. */
function CommandBlock({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(() => {
    navigator.clipboard
      ?.writeText(command)
      .then(() => setCopied(true))
      .catch(() => {
        /* clipboard unavailable — ignore */
      });
  }, [command]);
  useEffect(() => {
    if (!copied) {
      return;
    }
    const id = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(id);
  }, [copied]);

  return (
    <div className="border-border/60 bg-background/60 flex items-center gap-2 rounded-lg border px-3 py-2">
      <code className="text-foreground min-w-0 flex-1 truncate font-mono text-xs">
        {command}
      </code>
      <button
        type="button"
        onClick={copy}
        aria-label="Copy command"
        className="text-muted-foreground hover:text-foreground shrink-0 transition-colors"
      >
        {copied ? (
          <CheckIcon className="size-3.5 text-emerald-500" />
        ) : (
          <CopyIcon className="size-3.5" />
        )}
      </button>
    </div>
  );
}

/** Quote a path for a POSIX shell only when it needs it. */
function _shellQuote(path: string): string {
  return /^[A-Za-z0-9_./~-]+$/.test(path) ? path : `'${path.replace(/'/g, "'\\''")}'`;
}

/** `{{@include("path")}}` macro with a single quoted path argument. */
const INCLUDE_MACRO_RE = /\{\{\s*@include\(\s*(['"])([\s\S]*?)\1\s*\)\s*\}\}/g;

/**
 * Expand LLM Space's `@include(...)` macro by inlining the referenced files,
 * so the generated project (which renders with plain Jinja2) doesn't need it.
 * Bounded recursion guards against include cycles.
 */
async function _expandIncludes(
  text: string,
  readText: (path: string) => Promise<string>,
  depth = 0
): Promise<string> {
  if (depth > 10 || !text.includes("@include")) {
    return text;
  }
  const matches = [...text.matchAll(INCLUDE_MACRO_RE)];
  if (matches.length === 0) {
    return text;
  }
  let out = "";
  let last = 0;
  for (const match of matches) {
    out += text.slice(last, match.index);
    let content: string;
    try {
      content = await readText(match[2]);
    } catch {
      content = "";
    }
    out += await _expandIncludes(content, readText, depth + 1);
    last = (match.index ?? 0) + match[0].length;
  }
  return out + text.slice(last);
}

function ProgressLine({ event }: { event: WorkflowEvent }) {
  if (event.type === "phase") {
    return (
      <div className="text-foreground mt-2 font-semibold first:mt-0">
        {event.title}
      </div>
    );
  }
  if (event.type === "log") {
    return <div className="text-muted-foreground pl-3">{event.message}</div>;
  }
  const tone =
    event.status === "error"
      ? "text-destructive"
      : event.status === "done"
        ? "text-emerald-500"
        : "text-muted-foreground";
  return (
    <div className={`pl-3 ${tone}`}>
      {event.label}: {event.status}
    </div>
  );
}

/**
 * Resolve the provider/model facts the generator's model factory needs — the
 * base URL + raw API key from the configured provider, and whether the model
 * speaks the DeepSeek thinking format (its OpenAI-completions `compat` flag).
 */
function _resolveModelInfo(
  providers: ModelProviderGroup[],
  model: ModelConfig
): GeneratorModelInfo {
  const group = providers.find((g) => g.id === model.provider);
  const piModel = group?.models.find((m) => m.id === model.id);
  // `compat.requiresReasoningContentOnAssistantMessages` marks DeepSeek-style
  // reasoning models served over an OpenAI-compatible API.
  const compat = piModel?.compat as
    | { requiresReasoningContentOnAssistantMessages?: boolean }
    | undefined;
  return {
    name: piModel?.name ?? model.id,
    baseUrl: group?.baseUrl || piModel?.baseUrl || undefined,
    apiKey: group?.apiKey,
    anthropic: piModel?.api === "anthropic-messages",
    deepseekThinking:
      compat?.requiresReasoningContentOnAssistantMessages === true,
    supportsReasoning: piModel?.reasoning ?? false,
  };
}

/**
 * Resolve the thread's MCP tools to their server configs from settings, mapping
 * each to the generator's serializable {@link GeneratorMcpServer}. Only servers
 * the thread's MCP tools reference are returned. Best-effort: returns `[]` on any
 * failure (or when there are no MCP tools) so generation can still proceed.
 */
async function _resolveMcpServers(
  context: ThreadContext | undefined,
  mcp: { listServers(): Promise<McpServerView[]> }
): Promise<GeneratorMcpServer[]> {
  const usedServerIds = new Set(
    (context?.tools ?? []).flatMap((t) => (t.type === "mcp" ? [t.serverId] : []))
  );
  if (usedServerIds.size === 0) {
    return [];
  }
  try {
    const servers = await mcp.listServers();
    return servers
      .filter((s) => usedServerIds.has(s.id))
      .map((s) => ({
        id: s.id,
        serverName: s.serverName,
        transport: s.transport,
        command: s.command,
        args: s.args,
        cwd: s.cwd,
        env: s.env,
        url: s.url,
        headers: s.headers,
      }));
  } catch {
    return [];
  }
}

/** Derive a kebab-case default project name from the thread title. */
function _defaultProjectName(title: string | undefined): string {
  const slug = _toKebab(title ?? "");
  return slug || "my-agent";
}

/** Lowercase, hyphen-separated slug (the `abc-xyz` project-name format). */
function _toKebab(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Human-readable preview of `parentDir/projectName` (no filesystem access). */
function _joinPreview(parentDir: string, projectName: string): string {
  const parent = (parentDir || "~").replace(/[/\\]+$/, "");
  const name = projectName.trim() || "…";
  return `${parent}/${name}`;
}
