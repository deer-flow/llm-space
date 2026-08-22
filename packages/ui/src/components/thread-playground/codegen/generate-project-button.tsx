"use client";

import {
  type McpServerView,
  type ModelConfig,
  type ModelProviderGroup,
  type SearchSettings,
  type ThreadContext,
} from "@llm-space/core";
import {
  envFile,
  getGenerator,
  isMetaUserMessage,
  mcpEnvEntries,
  type DepsInstallStatus,
  type GeneratorCapabilities,
  type GeneratorMcpServer,
  type GeneratorModelInfo,
  type GeneratorResult,
} from "@llm-space/core/generator";
import {
  createOneShotRunner,
  createWorkflowContext,
  type WorkflowEvent,
} from "@llm-space/core/workflow";
import {
  ArrowRightIcon,
  BotIcon,
  BracesIcon,
  CheckIcon,
  CircleHelpIcon,
  CopyIcon,
  ExternalLinkIcon,
  FileCode2Icon,
  FolderIcon,
  FolderOpenIcon,
  FolderTreeIcon,
  PackageIcon,
  RocketIcon,
  SparklesIcon,
  TerminalIcon,
  WorkflowIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { useHostServices } from "@llm-space/ui/host";
import { Spinner } from "@llm-space/ui/ui/spinner";
import { Switch } from "@llm-space/ui/ui/switch";

import { docsUrl } from "../../../lib/docs-url";
import { formatString, useI18n } from "../../../lib/i18n";
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
import { useProviderProfileSelection } from "../model/provider-profile-selection-provider";
import { useThreadStore, useThreadStoreApi } from "../stores/thread-store";

import { createGenerateProjectPromptPreparer } from "./generate-project-prompt-preparer";
import {
  bindProjectGenerationRuntime,
  type ProjectGenerationRuntime,
} from "./project-generation-runtime";

/** The generator to run. V1 ships only LangGraph. */
const GENERATOR_ID = "langgraph";

/** Default parent directory — the Desktop is the natural home for a new project. */
const DEFAULT_PARENT_DIR = "~/Desktop";

/** Astral's uv installation guide, opened from the "uv required" gate. */
const UV_INSTALL_URL =
  "https://docs.astral.sh/uv/getting-started/installation/";

/** Selectable target frameworks. Only LangGraph is available in V1. */
const FRAMEWORKS = [
  {
    id: "langgraph",
    name: "LangGraph",
    stack: "Python",
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
export function GenerateProjectButton({
  disabled = false,
  open: controlledOpen,
  onOpenChange,
  showTrigger = true,
}: {
  disabled?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  showTrigger?: boolean;
}) {
  const {
    generator,
    createTransport,
    skills,
    files,
    builtinTools,
    mcp,
    actions,
    presentational,
  } = useHostServices();
  const { t } = useI18n();
  const store = useThreadStoreApi();
  const context = useThreadStore((s) => s.thread.context);
  const runtimeId = useThreadStore((s) => s.runtimeId);
  const savedModel = useThreadStore((s) => s.thread.model);
  const title = useThreadStore((s) => s.thread.title);
  const fallbackModel = useFirstAvailableModel();
  const providers = useModels();
  const model = savedModel ?? fallbackModel;
  const { selectedProfileId } = useProviderProfileSelection(
    model?.provider ?? ""
  );
  const preparePromptContext = useMemo(
    () => createGenerateProjectPromptPreparer({ files, store }),
    [files, store]
  );

  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setDialogOpen = useCallback(
    (nextOpen: boolean) => {
      if (controlledOpen === undefined) {
        setInternalOpen(nextOpen);
      }
      onOpenChange?.(nextOpen);
    },
    [controlledOpen, onOpenChange]
  );
  const [step, setStep] = useState<WizardStep>("framework");
  const [framework, setFramework] = useState<string>(GENERATOR_ID);

  // Directory step.
  const [parentDir, setParentDir] = useState(DEFAULT_PARENT_DIR);
  const [projectName, setProjectName] = useState("");
  const metaUserPromptSuggested = useMemo(
    () => isMetaUserMessage(context),
    [context]
  );
  const hasFirstUserMessage = context?.messages?.[0]?.role === "user";
  const [useMetaUserPrompt, setUseMetaUserPrompt] = useState(
    metaUserPromptSuggested
  );
  const [preparing, setPreparing] = useState(false);
  const [targetError, setTargetError] = useState<string | null>(null);

  // Run step.
  const abortRef = useRef<AbortController | null>(null);
  const generationRuntimeRef = useRef<ProjectGenerationRuntime | null>(null);
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
    setUseMetaUserPrompt(metaUserPromptSuggested);
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
    generationRuntimeRef.current = null;
  }, [open, title, metaUserPromptSuggested]);

  const targetPreview = useMemo(
    () => _joinPreview(parentDir, projectName),
    [parentDir, projectName]
  );

  const runGeneration = useCallback(
    async (targetDir: string) => {
      if (!generator || !runtimeId || !model) {
        return;
      }
      const generationRuntime = bindProjectGenerationRuntime({
        runtimeId,
        createTransport,
        skills,
        mcp,
        generator,
      });
      if (!generationRuntime) {
        return;
      }
      generationRuntimeRef.current = generationRuntime;
      setRunning(true);
      setEvents([]);
      setError(null);
      setResult(null);

      const capabilities: GeneratorCapabilities = {
        checkUv: () => generator.checkUv(),
        // Raw pass-through: the generator inspects the exit code / `timedOut`
        // itself (a slow `uv sync` is reported, not thrown, so generation still
        // finishes and the user can rerun it).
        runUv: (rootDir, args, opts) => generator.runUv(rootDir, args, opts),
        writeFile: (rootDir, relativePath, contents) =>
          generator.writeFile(rootDir, relativePath, contents),
        removeFile: (rootDir, relativePath) =>
          generator.removeFile(rootDir, relativePath),
      };

      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const skillList = await generationRuntime.listEnabledSkills();
        const {
          rendered,
          systemPromptTemplate,
          firstUserMessageTemplate,
          renderedVariableValues,
        } = await preparePromptContext({
          skillList,
          useMetaUserPrompt,
        });
        const workflow = createWorkflowContext({
          runOneShot: createOneShotRunner({
            transport: generationRuntime.transport,
            connection: {
              providerId: model.provider,
              ...(selectedProfileId ? { profileId: selectedProfileId } : {}),
            },
          }),
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
        const searchInfo = await generationRuntime
          .getSearchSettings()
          .catch(() => undefined);
        setLastSearch(searchInfo);
        // Resolve the thread's MCP tools to their server configs (transport,
        // command/URL) from settings so the generated project connects for real.
        // Best-effort — a failure here shouldn't abort generation.
        const mcpServers = await _resolveMcpServers(context, () =>
          generationRuntime.listMcpServers()
        );
        setLastMcpServers(mcpServers);
        const outcome = await definition.run(workflow, {
          targetDir,
          context: context ?? {},
          rendered: rendered.context,
          systemPromptTemplate,
          firstUserMessageTemplate,
          useMetaUserPrompt,
          skills: skillList.map((s) => ({ name: s.name, path: s.path })),
          renderedVariableValues,
          model,
          modelInfo: _resolveModelInfo(providers, model, selectedProfileId),
          searchInfo,
          mcpServers,
          capabilities,
        });
        if (outcome) {
          setResult(outcome);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setRunning(false);
      }
    },
    [
      generator,
      createTransport,
      runtimeId,
      model,
      context,
      skills,
      preparePromptContext,
      framework,
      providers,
      selectedProfileId,
      mcp,
      useMetaUserPrompt,
    ]
  );

  // Directory step "Next": require uv, validate + create the target, then run.
  const prepareAndRun = useCallback(async () => {
    if (!generator) {
      return;
    }
    if (!model) {
      toast.error(t.playground.codegen.noModelAvailable);
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
  }, [generator, model, parentDir, projectName, runGeneration, t]);

  // Abort an in-progress run and close the wizard.
  const cancelRun = useCallback(() => {
    abortRef.current?.abort();
    setDialogOpen(false);
  }, [setDialogOpen]);

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

  const openGeneratedProject = useCallback(async () => {
    if (!result) {
      return;
    }
    try {
      await builtinTools.fsReveal(result.dir);
    } catch (error) {
      toast.error(t.playground.codegen.failedToOpenGeneratedProject, {
        description:
          error instanceof Error
            ? error.message
            : t.playground.message.pleaseTryAgain,
      });
    }
  }, [builtinTools, result, t]);

  const skipEnvFile = useCallback(() => {
    void openGeneratedProject();
    setEnvConfirmOpen(false);
    setDialogOpen(false);
  }, [openGeneratedProject, setDialogOpen]);

  // Opt-in: write a real `.env` into the generated project, resolving the
  // model + search keys to their actual values (following `$ENV` references).
  const createEnvFile = useCallback(async () => {
    const generationRuntime = generationRuntimeRef.current;
    if (!generator || !generationRuntime || !model || !result) {
      return;
    }
    setWritingEnv(true);
    let envCreated = false;
    try {
      const modelInfo = _resolveModelInfo(providers, model, selectedProfileId);
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
      const { modelApiKey, envValues } = await generationRuntime.resolveEnv(
        model.provider,
        envNames,
        selectedProfileId
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
      toast.success(t.playground.codegen.envCreatedWithKeys);
      envCreated = true;
    } catch (e) {
      toast.error(t.playground.codegen.couldNotCreateEnv, {
        description: e instanceof Error ? e.message : String(e),
      });
    }
    try {
      if (
        !envCreated ||
        !(await generator.openDevTerminal(result.dir))
      ) {
        await openGeneratedProject();
      }
    } catch (e) {
      toast.error(t.playground.codegen.couldNotStartDevServer, {
        description: e instanceof Error ? e.message : String(e),
      });
      await openGeneratedProject();
    } finally {
      setWritingEnv(false);
      setEnvConfirmOpen(false);
      setDialogOpen(false);
    }
  }, [
    generator,
    model,
    result,
    providers,
    selectedProfileId,
    context,
    lastSearch,
    lastMcpServers,
    openGeneratedProject,
    setDialogOpen,
    t,
  ]);

  if (presentational || !generator || !runtimeId) {
    return null;
  }

  const busy = running || preparing;

  return (
    <>
      {showTrigger ? (
        <Tooltip
          content={
            <span className="flex items-center gap-1.5">
              {t.playground.codegen.generateRunnableAgentForThread}
              <BetaBadge />
            </span>
          }
        >
          <Button
            variant="ghost"
            size="icon-lg"
            aria-label={t.playground.codegen.generateRunnableAgentBeta}
            disabled={disabled || running || !model}
            onClick={() => setDialogOpen(true)}
          >
            <SparklesIcon className="size-4" />
          </Button>
        </Tooltip>
      ) : null}

      <Dialog open={open} onOpenChange={busy ? undefined : setDialogOpen}>
        <DialogContent className="flex h-[42rem] max-h-[calc(100vh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl">
          <DialogHeader className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1 border-b px-6 py-4 text-left sm:text-left">
            <span className="border-primary/20 bg-primary/10 text-primary row-span-2 flex size-8 items-center justify-center self-center rounded-xl border">
              <SparklesIcon className="size-4" />
            </span>
            <DialogTitle className="col-start-2 flex items-center gap-2">
              {t.playground.codegen.generateRunnableAgent}
              <BetaBadge />
            </DialogTitle>
            <DialogDescription className="col-start-2">
              {step === "framework"
                ? t.playground.codegen.descriptionFramework
                : step === "target"
                  ? t.playground.codegen.descriptionTarget
                  : uvMissing
                    ? t.playground.codegen.descriptionUvMissing
                    : result
                      ? t.playground.codegen.descriptionResult
                      : t.playground.codegen.descriptionRunning}
            </DialogDescription>
          </DialogHeader>

          <div className="relative px-6 py-3">
            <div
              aria-hidden="true"
              className="from-muted/[0.08] via-muted/[0.03] pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b to-transparent"
            />
            <div className="relative">
              <StepIndicator step={step} />
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
            {step === "framework" ? (
              <FrameworkStep selected={framework} onSelect={setFramework} />
            ) : null}

            {step === "target" ? (
              <TargetStep
                parentDir={parentDir}
                projectName={projectName}
                targetPreview={targetPreview}
                hasFirstUserMessage={hasFirstUserMessage}
                metaUserPromptSuggested={metaUserPromptSuggested}
                useMetaUserPrompt={useMetaUserPrompt}
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
                onUseMetaUserPromptChange={setUseMetaUserPrompt}
                onBrowse={browseParent}
              />
            ) : null}

            {step === "run" && uvMissing ? <UvMissingStep /> : null}

            {step === "run" && !uvMissing && result ? (
              <SuccessStep
                dir={result.dir}
                envWritten={result.files.includes(".env")}
                depsInstall={result.depsInstall}
                hasFunctionTools={(context?.tools ?? []).some(
                  (t) => t.type === "function"
                )}
              />
            ) : null}

            {step === "run" && !uvMissing && !result ? (
              <RunStep events={events} error={error} running={running} />
            ) : null}
          </div>

          <DialogFooter className="border-t bg-background/80 px-6 py-4 backdrop-blur-xl sm:justify-between">
            <Button
              variant="ghost"
              onClick={() => actions.openLink(docsUrl("generating-projects"))}
            >
              <CircleHelpIcon className="size-4" />
              {t.playground.codegen.help}
            </Button>
            <div className="flex items-center justify-end gap-2">
              {step === "framework" ? (
              <>
                <Button variant="ghost" onClick={() => setDialogOpen(false)}>
                  {t.playground.codegen.cancel}
                </Button>
                <Button onClick={() => setStep("target")}>
                  {t.playground.codegen.next}
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
                  {t.playground.codegen.back}
                </Button>
                <Button
                  disabled={preparing || !projectName.trim()}
                  onClick={prepareAndRun}
                >
                  {preparing ? <Spinner className="size-3" /> : null}
                  {preparing
                    ? t.playground.codegen.checking
                    : t.playground.codegen.generate}
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
                  {t.playground.codegen.back}
                </Button>
                <Button onClick={() => actions.openLink(UV_INSTALL_URL)}>
                  <ExternalLinkIcon className="size-4" />
                  {t.playground.codegen.installUv}
                </Button>
              </>
              ) : null}

              {step === "run" && !uvMissing ? (
              <>
                {result ? (
                  <Button
                    variant="ghost"
                    onClick={() => void openGeneratedProject()}
                  >
                    <FolderOpenIcon className="size-4" />
                    {t.playground.codegen.openFolder}
                  </Button>
                ) : null}
                {running ? (
                  <Button variant="ghost" onClick={cancelRun}>
                    {t.playground.codegen.cancel}
                  </Button>
                ) : null}
                <Button
                  variant="default"
                  disabled={running}
                  onClick={() =>
                    result ? setEnvConfirmOpen(true) : setDialogOpen(false)
                  }
                >
                  {running ? <Spinner className="size-3" /> : null}
                  {running
                    ? t.playground.codegen.generating
                    : t.playground.codegen.done}
                </Button>
              </>
              ) : null}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={envConfirmOpen}
        onOpenChange={(next) => {
          // Dismiss ("No" / escape / outside) finishes without writing .env.
          if (!next && !writingEnv) {
            setEnvConfirmOpen(false);
            setDialogOpen(false);
          }
        }}
        title={t.playground.codegen.createEnvTitle}
        description={t.playground.codegen.createEnvDescription}
        cancelLabel={t.playground.codegen.noThanks}
        confirmLabel={t.playground.codegen.yesCreateEnv}
        confirmVariant="default"
        dimBackground={false}
        onCancel={skipEnvFile}
        onConfirm={createEnvFile}
      />
    </>
  );
}

/** A small "Beta" pill marking this as an experimental feature. */
function BetaBadge() {
  const { t } = useI18n();
  return (
    <span className="bg-primary/15 text-primary rounded px-1.5 py-0.5 text-[0.625rem] font-semibold tracking-wide uppercase">
      {t.playground.header.beta}
    </span>
  );
}

/** Ordered wizard steps with their stepper titles. */
const STEPS: WizardStep[] = ["framework", "target", "run"];

/**
 * Horizontal numbered stepper (reui-style): each step is an indicator circle +
 * title, joined by a connector line that fills as steps complete. Completed
 * steps show a checkmark, the active step is highlighted, pending steps muted.
 */
function StepIndicator({ step }: { step: WizardStep }) {
  const { t } = useI18n();
  const stepTitles: Record<WizardStep, string> = {
    framework: t.playground.codegen.stepIntroduction,
    target: t.playground.codegen.stepDestination,
    run: t.playground.codegen.stepBuild,
  };
  const activeIndex = STEPS.findIndex((s) => s === step);
  return (
    <div className="mx-auto flex max-w-2xl items-center">
      {STEPS.map((s, index) => {
        const state =
          index < activeIndex
            ? "completed"
            : index === activeIndex
              ? "active"
              : "pending";
        return (
          <div
            key={s}
            className={cn(
              "flex items-center",
              index === 0 ? "" : "flex-1"
            )}
          >
            {index > 0 ? (
              <span
                className={cn(
                  "mx-3 h-px flex-1 transition-colors duration-300",
                  index <= activeIndex ? "bg-primary" : "bg-border/60"
                )}
              />
            ) : null}
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold transition-all duration-300",
                  state === "completed" &&
                    "border-primary bg-primary text-primary-foreground shadow-sm shadow-primary/20",
                  state === "active" &&
                    "border-primary bg-primary/10 text-primary ring-4 ring-primary/8",
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
                  "text-xs font-semibold transition-colors",
                  state === "pending"
                    ? "text-muted-foreground"
                    : "text-foreground"
                )}
              >
                {stepTitles[s]}
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
  const { t } = useI18n();
  return (
    <div className="flex flex-col gap-3.5">
      <div className="bg-card group relative min-h-52 overflow-hidden rounded-2xl border shadow-sm">
        <div className="absolute inset-y-0 right-0 w-[52%] overflow-hidden">
          <img
            src="/images/codegen/thread-to-agent.jpg"
            alt={t.playground.codegen.frameworkAlt}
            className="size-full object-cover opacity-80 transition-transform duration-1000 ease-out group-hover:scale-[1.025] dark:opacity-65"
          />
          <div className="from-card absolute inset-0 bg-gradient-to-r from-0% via-transparent via-52% to-transparent" />
          <div className="from-card/10 absolute inset-0 bg-gradient-to-t via-transparent to-transparent" />
        </div>

        <div className="relative flex min-h-52 w-[62%] flex-col justify-center p-6">
          <div className="text-primary mb-3 flex items-center gap-2 text-[0.625rem] font-semibold tracking-[0.2em] uppercase">
            <WorkflowIcon className="size-3.5" />
            {t.playground.codegen.playgroundToCode}
          </div>
          <h3 className="max-w-md text-2xl font-semibold tracking-tight text-balance">
            {t.playground.codegen.takeAgentOutOfPlayground}
          </h3>
          <p className="text-muted-foreground mt-2 max-w-md text-sm/relaxed">
            {t.playground.codegen.exportIntelligence}
          </p>

          <div className="mt-5 flex items-center gap-2 text-[0.6875rem] font-medium">
            <span className="bg-background/80 flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 shadow-sm backdrop-blur-md">
              <BotIcon className="text-muted-foreground size-3.5" />
              {t.playground.codegen.playgroundContext}
            </span>
            <ArrowRightIcon className="text-muted-foreground size-3.5" />
            <span className="bg-background/80 flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 shadow-sm backdrop-blur-md">
              <PackageIcon className="text-muted-foreground size-3.5" />
              {t.playground.codegen.runnableProject}
            </span>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">
            {t.playground.codegen.exportFormat}
          </p>
          <p className="text-muted-foreground text-xs">
            {t.playground.codegen.chooseRuntime}
          </p>
        </div>
        <span className="text-muted-foreground text-[0.625rem] font-semibold tracking-wider uppercase">
          {t.playground.codegen.countAvailable}
        </span>
      </div>

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
              "group flex cursor-pointer items-center gap-4 rounded-xl border px-4 py-3.5 text-left transition-all duration-200",
              isSelected
                ? "border-foreground/20 bg-muted/35 shadow-sm"
                : "border-border/60 bg-muted/10 hover:border-foreground/15 hover:bg-muted/25",
              !fw.available && "cursor-not-allowed opacity-50"
            )}
          >
            <span className="bg-background/80 flex size-10 shrink-0 items-center justify-center rounded-xl border shadow-sm">
              <BracesIcon className="size-4.5" />
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="flex items-center gap-2 text-sm font-semibold">
                {fw.name}
                <span className="text-muted-foreground bg-muted rounded-md px-2 py-0.5 text-[0.625rem] font-semibold tracking-wide uppercase">
                  {fw.stack}
                </span>
              </span>
              <span className="text-muted-foreground line-clamp-2 text-xs/relaxed">
                {t.playground.codegen.frameworkLanggraphDescription}
              </span>
            </span>
            <span
              className={cn(
                "flex size-6 shrink-0 items-center justify-center rounded-full border transition-all",
                isSelected
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-transparent"
              )}
            >
              <CheckIcon className="size-3.5" />
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
  hasFirstUserMessage,
  metaUserPromptSuggested,
  useMetaUserPrompt,
  error,
  disabled,
  onParentChange,
  onNameChange,
  onUseMetaUserPromptChange,
  onBrowse,
}: {
  parentDir: string;
  projectName: string;
  targetPreview: string;
  hasFirstUserMessage: boolean;
  metaUserPromptSuggested: boolean;
  useMetaUserPrompt: boolean;
  error: string | null;
  disabled: boolean;
  onParentChange: (next: string) => void;
  onNameChange: (next: string) => void;
  onUseMetaUserPromptChange: (next: boolean) => void;
  onBrowse: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="text-lg font-semibold tracking-tight">
          {t.playground.codegen.giveAgentHome}
        </h3>
        <p className="text-muted-foreground mt-1 text-xs">
          {t.playground.codegen.chooseProjectHome}
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-[1.15fr_0.85fr]">
        <div className="border-border/60 bg-muted/10 flex flex-col gap-3.5 rounded-2xl border p-4">
          <Field label={t.playground.codegen.parentDirectory}>
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
                className="cursor-pointer"
              >
                <FolderIcon className="size-4" />
                {t.playground.codegen.browse}
              </Button>
            </div>
          </Field>

          <Field label={t.playground.codegen.projectName}>
            <Input
              value={projectName}
              disabled={disabled}
              spellCheck={false}
              className="font-mono"
              onChange={(e) => onNameChange(e.target.value)}
              placeholder={t.playground.codegen.projectNamePlaceholder}
            />
          </Field>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium">
              {t.playground.codegen.projectPath}
            </span>
            <div className="border-border/60 bg-background/70 text-muted-foreground truncate rounded-lg border px-3 py-2 font-mono text-xs shadow-sm">
              {targetPreview}
            </div>
          </div>
        </div>

        <div className="relative overflow-hidden rounded-2xl border bg-foreground/[0.025] p-4">
          <div className="absolute -top-12 -right-12 size-40 rounded-full bg-primary/8 blur-3xl" />
          <div className="relative flex h-full flex-col">
            <div className="mb-3 flex items-center gap-2">
              <span className="bg-background flex size-8 items-center justify-center rounded-lg border shadow-sm">
                <FolderTreeIcon className="size-4" />
              </span>
              <div>
                <p className="text-xs font-semibold">
                  {t.playground.codegen.projectBlueprint}
                </p>
                <p className="text-muted-foreground text-[0.6875rem]">
                  {t.playground.codegen.editablePythonProject}
                </p>
              </div>
            </div>
            <div className="text-muted-foreground flex flex-1 flex-col gap-1.5 font-mono text-[0.6875rem]">
              <ProjectTreeLine
                icon={FolderIcon}
                label={`${projectName || t.playground.codegen.projectNamePlaceholder}/`}
                strong
              />
              <ProjectTreeLine icon={BotIcon} label="agent.py" nested />
              <ProjectTreeLine icon={WorkflowIcon} label="langgraph.json" nested />
              <ProjectTreeLine icon={PackageIcon} label="pyproject.toml" nested />
              <ProjectTreeLine icon={FileCode2Icon} label="PLAN.md" nested />
              <ProjectTreeLine icon={FolderIcon} label="references/" nested />
            </div>
            <div className="border-border/60 text-muted-foreground mt-3 border-t pt-2.5 text-[0.6875rem]">
              {t.playground.codegen.threadContextAndPlanIncluded}
            </div>
          </div>
        </div>
      </div>

      <div className="border-border/60 bg-muted/15 flex items-start justify-between gap-5 rounded-xl border px-4 py-3">
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <label
              htmlFor="use-meta-user-prompt"
              className="text-xs font-medium"
            >
              {t.playground.codegen.useMetaUserPrompt}
            </label>
            <span
              className={cn(
                "rounded px-1.5 py-0.5 text-[0.625rem] font-medium",
                hasFirstUserMessage && metaUserPromptSuggested
                  ? "bg-primary/10 text-primary"
                  : "bg-muted text-muted-foreground"
              )}
            >
              {!hasFirstUserMessage
                ? t.playground.codegen.unavailable
                : metaUserPromptSuggested
                  ? t.playground.codegen.suggestedOn
                  : t.playground.codegen.suggestedOff}
            </span>
          </div>
          <p className="text-muted-foreground max-w-2xl text-xs">
            {hasFirstUserMessage
              ? t.playground.codegen.reuseFirstMessage
              : t.playground.codegen.noFirstUserMessage}
          </p>
        </div>
        <Switch
          id="use-meta-user-prompt"
          className="mt-0.5"
          checked={useMetaUserPrompt}
          disabled={disabled || !hasFirstUserMessage}
          onCheckedChange={onUseMetaUserPromptChange}
          aria-label={t.playground.codegen.useMetaUserPromptAria}
        />
      </div>

      {error ? (
        <div className="border-destructive/20 bg-destructive/5 text-destructive rounded-lg border px-3 py-2 text-xs/relaxed">
          {error}
        </div>
      ) : null}
    </div>
  );
}

function ProjectTreeLine({
  icon: Icon,
  label,
  nested = false,
  strong = false,
}: {
  icon: typeof FolderIcon;
  label: string;
  nested?: boolean;
  strong?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2",
        nested && "pl-5",
        strong && "text-foreground font-medium"
      )}
    >
      <Icon className="size-3.5 shrink-0" />
      <span className="truncate">{label}</span>
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
  const { t } = useI18n();
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5 py-3">
      <div className="flex flex-col items-center text-center">
        <div className="bg-muted/60 ring-border/60 mb-4 flex size-14 items-center justify-center rounded-2xl ring-1">
          <TerminalIcon className="size-6" />
        </div>
        <span className="text-muted-foreground text-[0.625rem] font-semibold tracking-[0.18em] uppercase">
          {t.playground.codegen.oneRequirement}
        </span>
        <h3 className="mt-2 text-xl font-semibold tracking-tight">
          {t.playground.codegen.installUvToBuild}
        </h3>
        <p className="text-muted-foreground mt-2 max-w-lg text-sm/relaxed">
          {t.playground.codegen.uvDescription}
        </p>
      </div>

      <div className="border-border/60 overflow-hidden rounded-2xl border">
        <div className="bg-muted/25 flex items-center gap-3 border-b px-4 py-3">
          <span className="bg-background flex size-6 items-center justify-center rounded-full border text-[0.6875rem] font-semibold">
            1
          </span>
          <span className="text-sm font-medium">
            {t.playground.codegen.installUvInTerminal}
          </span>
        </div>
        <div className="bg-neutral-950 px-4 py-4 font-mono text-xs text-neutral-200">
          <span className="mr-2 text-emerald-400">$</span>
          curl -LsSf https://astral.sh/uv/install.sh | sh
        </div>
        <div className="bg-muted/25 flex items-center gap-3 border-t px-4 py-3">
          <span className="bg-background flex size-6 items-center justify-center rounded-full border text-[0.6875rem] font-semibold">
            2
          </span>
          <span className="text-sm font-medium">
            {t.playground.codegen.returnAndGenerateAgain}
          </span>
        </div>
      </div>
      <p className="text-muted-foreground text-center text-xs">
        {t.playground.codegen.installUvOpensGuide}
      </p>
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
  const { t } = useI18n();
  return (
    <div className="grid h-full min-h-80 gap-4 md:grid-cols-[0.8fr_1.2fr]">
      <div className="relative min-h-56 overflow-hidden rounded-2xl border bg-neutral-950 text-white">
        <img
          src="/images/codegen/thread-to-agent.jpg"
          alt=""
          className="absolute inset-0 size-full object-cover opacity-55"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/35 to-black/10" />
        <div className="relative flex h-full flex-col justify-between p-5">
          <div className="flex items-center gap-2 text-[0.625rem] font-semibold tracking-[0.2em] text-white/65 uppercase">
            {running ? <Spinner className="size-3" /> : <PackageIcon className="size-3.5" />}
            {running
              ? t.playground.codegen.building
              : error
                ? t.playground.codegen.buildStopped
                : t.playground.codegen.buildComplete}
          </div>
          <div>
            <div className="mb-4 flex size-11 items-center justify-center rounded-xl border border-white/15 bg-black/25 backdrop-blur-xl">
              <RocketIcon className="size-5" />
            </div>
            <h3 className="text-xl font-semibold tracking-tight">
              {t.playground.codegen.turningContextIntoCode}
            </h3>
            <p className="mt-1.5 text-xs/relaxed text-white/65">
              {t.playground.codegen.scaffoldingCopy}
            </p>
          </div>
        </div>
      </div>

      <div className="border-border/60 bg-muted/10 flex min-h-0 flex-col overflow-hidden rounded-2xl border">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <TerminalIcon className="text-muted-foreground size-3.5" />
            <span className="text-xs font-semibold">
              {t.playground.codegen.buildActivity}
            </span>
          </div>
          <span className="text-muted-foreground text-[0.625rem] font-semibold tracking-wider uppercase">
            {formatString(
              events.length === 1
                ? t.playground.codegen.eventCount.one
                : t.playground.codegen.eventCount.other,
              { n: events.length }
            )}
          </span>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4 font-mono text-xs">
          {events.length === 0 && !error ? (
            <div className="text-muted-foreground flex items-center gap-2">
              <Spinner className="size-3" />
              {t.playground.codegen.preparingBuild}
            </div>
          ) : null}
          {events.map((event, index) => (
            <ProgressLine key={index} event={event} />
          ))}
          {error ? (
            <div className="border-destructive/20 bg-destructive/5 text-destructive mt-3 whitespace-pre-wrap rounded-lg border p-3 font-sans text-xs/relaxed">
              {error}
            </div>
          ) : null}
        </div>
        {running ? (
          <div className="text-muted-foreground border-t px-4 py-3 text-[0.6875rem]">
            {t.playground.codegen.depsFirstBuildNote}
          </div>
        ) : null}
      </div>
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
  depsInstall,
  hasFunctionTools,
}: {
  dir: string;
  envWritten: boolean;
  depsInstall: DepsInstallStatus;
  hasFunctionTools: boolean;
}) {
  const { t } = useI18n();
  const steps: { title: string; body: React.ReactNode }[] = [];

  // Dependencies weren't installed during generation (usually a slow uv
  // download hit the timeout) — walk the user through finishing it by hand.
  if (depsInstall !== "installed") {
    steps.push({
      title: t.playground.codegen.installDependencies,
      body: (
        <>
          <p className="text-muted-foreground text-xs/relaxed">
            {depsInstall === "timeout"
              ? t.playground.codegen.depsTimeoutMessage
              : depsInstall === "skipped"
                ? t.playground.codegen.depsSkippedMessage
                : t.playground.codegen.depsDidNotFinish}
          </p>
          <CommandBlock command={`cd ${_shellQuote(dir)} && uv sync`} />
          <p className="text-muted-foreground text-xs/relaxed">
            {t.playground.codegen.depsSlowMirrorPrefix}{" "}
            <code className="text-foreground font-mono">pyproject.toml</code>{" "}
            {t.playground.codegen.depsSlowMirrorSuffix}
          </p>
        </>
      ),
    });
  }

  steps.push({
    title: t.playground.codegen.setUpEnvironment,
    body: envWritten ? (
      <p className="text-muted-foreground text-xs/relaxed">
        {t.playground.codegen.envWrittenMessagePrefix}{" "}
        <code className="text-foreground font-mono">.env</code>{" "}
        {t.playground.codegen.envWrittenMessageSuffix}
      </p>
    ) : (
      <>
        <CommandBlock command="cp .env.example .env" />
        <p className="text-muted-foreground text-xs/relaxed">
          {t.playground.codegen.thenAddApiKeys}
        </p>
      </>
    ),
  });

  steps.push({
    title: t.playground.codegen.finishInCodingAgent,
    body: (
      <p className="text-muted-foreground text-xs/relaxed">
        {t.playground.codegen.finishPlanBeforeFile}{" "}
        <code className="text-foreground font-mono">PLAN.md</code>{" "}
        {t.playground.codegen.finishPlanAfterFile}
        {hasFunctionTools ? (
          <>{t.playground.codegen.finishPlanWithTools}</>
        ) : (
          t.playground.codegen.finishPlanReview
        )}
      </p>
    ),
  });

  steps.push({
    title: t.playground.codegen.launchExplore,
    body: (
      <>
        <CommandBlock
          command={`cd ${_shellQuote(dir)} && uv run langgraph dev`}
        />
        <p className="text-muted-foreground text-xs/relaxed">
          {t.playground.codegen.openLanggraphStudio}
        </p>
      </>
    ),
  });

  return (
    <div className="flex flex-col">
      <div className="relative mb-5 overflow-hidden rounded-2xl border bg-neutral-950 text-white">
        <img
          src="/images/codegen/thread-to-agent.jpg"
          alt=""
          className="absolute inset-0 size-full object-cover opacity-50"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/55 to-black/15" />
        <div className="relative flex min-h-36 items-center gap-4 p-6">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl border border-emerald-300/20 bg-emerald-400/15 backdrop-blur-xl">
            <CheckIcon className="size-6 text-emerald-300" />
          </div>
          <div className="min-w-0">
            <span className="text-[0.625rem] font-semibold tracking-[0.18em] text-emerald-300/80 uppercase">
              {t.playground.codegen.buildComplete}
            </span>
            <h3 className="mt-1 text-2xl font-semibold tracking-tight">
              {t.playground.codegen.yourAgentIsReady}
            </h3>
            <p className="mt-1 max-w-xl truncate font-mono text-xs text-white/60">
              {dir}
            </p>
          </div>
        </div>
      </div>

      <div className="border-border/60 bg-muted/10 flex flex-col gap-4 rounded-2xl border p-5">
        <span className="text-muted-foreground text-[0.6875rem] font-medium tracking-wider uppercase">
          {t.playground.codegen.nextSteps}
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
  const { t } = useI18n();
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
        aria-label={t.playground.codegen.copyCommand}
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
  return /^[A-Za-z0-9_./~-]+$/.test(path)
    ? path
    : `'${path.replace(/'/g, "'\\''")}'`;
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
  model: ModelConfig,
  profileId?: string
): GeneratorModelInfo {
  const group = providers.find((g) => g.id === model.provider);
  const piModel = group?.models.find((m) => m.id === model.id);
  const profile =
    group?.profiles.find((candidate) => candidate.id === profileId) ??
    group?.profiles[0];
  // `compat.requiresReasoningContentOnAssistantMessages` marks DeepSeek-style
  // reasoning models served over an OpenAI-compatible API.
  const compat = piModel?.compat as
    { requiresReasoningContentOnAssistantMessages?: boolean } | undefined;
  return {
    name: piModel?.name ?? model.id,
    baseUrl: profile?.baseUrl || piModel?.baseUrl || undefined,
    apiKey: profile?.apiKey,
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
  listServers: () => Promise<McpServerView[]>
): Promise<GeneratorMcpServer[]> {
  const usedServerIds = new Set(
    (context?.tools ?? []).flatMap((t) =>
      t.type === "mcp" ? [t.serverId] : []
    )
  );
  if (usedServerIds.size === 0) {
    return [];
  }
  try {
    const servers = await listServers();
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
