import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import {
  isJSONValue,
  validatePluginManifest,
  type JSONObject,
  type PluginContext,
  type PluginContributionKind,
  type PluginDefinition,
  type PluginDevelopmentSeeder,
  type PluginDiagnostic,
  type PluginLifecycleState,
  type PluginManifest,
  type PluginRegistrar,
  type PluginSkillContent,
  type PluginSkillProvider,
  type PluginSkillSummary,
  type PluginSource,
  type PluginSourceImporter,
  type PluginSourceInput,
  type PluginSourceProbeResult,
  type PluginSourceImportResult,
  type PluginToolCallResult,
  type PluginToolDescriptor,
  type PluginToolProvider,
  type PluginView,
} from "@llm-space/plugin-api";

import { LocalPluginStorage } from "./plugin-storage";
import type {
  BundledPlugin,
  PluginRuntimeModule,
  SeededPluginSource,
} from "./types";

const SETTINGS_VERSION = 1;
const DEFAULT_OPERATION_TIMEOUT_MS = 5 * 60_000;
const DEACTIVATION_TIMEOUT_MS = 5_000;
const MAX_DIAGNOSTICS = 20;

interface PluginManagerOptions<TThread> {
  apiVersion: string;
  engineVersion: string;
  bundledPlugins: readonly BundledPlugin<TThread>[];
  localPaths?: readonly string[];
  settingsPath: string;
  storageRoot: string;
  operationTimeoutMs?: number;
  validateThread?: (value: unknown) => value is TThread;
}

interface PersistedPluginSettings {
  version: 1;
  localPaths: string[];
  plugins: Record<
    string,
    { enabled: boolean; diagnostics: PluginDiagnostic[] }
  >;
}

interface PluginCandidate<TThread> {
  key: string;
  source: PluginSource;
  manifestInput: unknown;
  localManifestPath?: string;
  discoveryErrors?: string[];
  load(): Promise<PluginRuntimeModule<TThread>>;
}

interface PluginRegistrations<TThread> {
  sourceImporters: Map<string, PluginSourceImporter<TThread>>;
  toolProviders: Map<string, PluginToolProvider>;
  skillProviders: Map<string, PluginSkillProvider>;
  developmentSeeders: Map<string, PluginDevelopmentSeeder>;
}

interface PluginRecord<TThread> {
  key: string;
  id: string;
  source: PluginSource;
  manifest?: PluginManifest;
  localManifestPath?: string;
  load: PluginCandidate<TThread>["load"];
  enabled: boolean;
  compatible: boolean;
  state: PluginLifecycleState;
  diagnostics: PluginDiagnostic[];
  definition?: PluginDefinition<TThread>;
  registrations: PluginRegistrations<TThread>;
  activationPromise?: Promise<void>;
}

/**
 * Trusted in-process plugin host. It owns static discovery, compatibility,
 * lazy activation, contribution routing, diagnostics, enablement, reload, and
 * private storage while keeping runtime modules out of the renderer bundle.
 */
export class PluginManager<TThread = unknown> {
  private readonly _apiVersion: string;
  private readonly _engineVersion: string;
  private readonly _bundledPlugins: readonly BundledPlugin<TThread>[];
  private readonly _configuredLocalPaths: readonly string[];
  private readonly _settingsPath: string;
  private readonly _storageRoot: string;
  private readonly _operationTimeoutMs: number;
  private readonly _validateThread?: (value: unknown) => value is TThread;
  private readonly _records = new Map<string, PluginRecord<TThread>>();
  private _settings: PersistedPluginSettings = _emptySettings();
  private _initialized = false;
  private _reloadIdentity = 0;

  constructor(options: PluginManagerOptions<TThread>) {
    this._apiVersion = options.apiVersion;
    this._engineVersion = options.engineVersion;
    this._bundledPlugins = options.bundledPlugins;
    this._configuredLocalPaths = options.localPaths ?? [];
    this._settingsPath = options.settingsPath;
    this._storageRoot = options.storageRoot;
    this._operationTimeoutMs =
      options.operationTimeoutMs ?? DEFAULT_OPERATION_TIMEOUT_MS;
    this._validateThread = options.validateThread;
  }

  /** Discover and validate every manifest without importing runtime modules. */
  initialize(): void {
    if (this._initialized) {
      return;
    }
    this._settings = this._readSettings();
    const localPaths = [
      ...new Set([...this._settings.localPaths, ...this._configuredLocalPaths]),
    ].sort();
    this._settings.localPaths = localPaths;

    const candidates: PluginCandidate<TThread>[] = [
      ...this._bundledPlugins.map((plugin) => ({
        key: `bundled:${plugin.manifest.id}`,
        source: "bundled" as const,
        manifestInput: plugin.manifest,
        load: () => plugin.load(),
      })),
      ...localPaths.map((localPath) => this._localCandidate(localPath)),
    ];
    this._installCandidates(candidates);
    this._initialized = true;
    for (const record of this._records.values()) {
      this._settings.plugins[record.id] = {
        enabled: record.enabled,
        diagnostics: record.diagnostics.map(_safeDiagnostic),
      };
    }
    this._writeSettings();
  }

  /** Return serializable host-owned status views in stable display order. */
  listPlugins(): PluginView[] {
    this._assertInitialized();
    return [...this._records.values()]
      .map((record) => this._view(record))
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  /** Enable or disable one plugin without deleting Thread-owned state. */
  async setEnabled(pluginId: string, enabled: boolean): Promise<PluginView[]> {
    const record = this._record(pluginId);
    if (record.enabled === enabled) {
      return this.listPlugins();
    }
    if (!enabled) {
      record.enabled = false;
      await this._deactivate(record);
      record.state = "disabled";
    } else {
      record.enabled = true;
      record.definition = undefined;
      record.registrations = _emptyRegistrations();
      record.state =
        record.compatible && record.manifest ? "inactive" : "invalid";
    }
    this._persistRecord(record);
    return this.listPlugins();
  }

  /** Reload a trusted local-development plugin and activate its replacement. */
  async reload(pluginId: string): Promise<PluginView[]> {
    const record = this._record(pluginId);
    if (record.source !== "local" || !record.localManifestPath) {
      throw new Error("Only local-development plugins can be reloaded.");
    }
    await this._deactivate(record);
    const replacement = this._localCandidate(record.localManifestPath);
    const validation = validatePluginManifest(replacement.manifestInput);
    if (!validation.valid || !validation.manifest) {
      record.compatible = false;
      record.state = "invalid";
      this._addDiagnostic(record, {
        pluginId,
        severity: "error",
        code: "reload_manifest_invalid",
        message: validation.errors.join("; "),
      });
      this._persistRecord(record);
      return this.listPlugins();
    }
    if (validation.manifest.id !== pluginId) {
      throw new Error("A reloaded plugin cannot change its stable plugin ID.");
    }
    record.manifest = validation.manifest;
    record.load = () => replacement.load();
    record.compatible = this._isCompatible(validation.manifest);
    record.definition = undefined;
    record.registrations = _emptyRegistrations();
    record.state = !record.enabled
      ? "disabled"
      : record.compatible
        ? "inactive"
        : "invalid";
    if (record.enabled && record.compatible) {
      await this._activate(record);
    }
    this._persistRecord(record);
    return this.listPlugins();
  }

  /** Probe a local source through one declared Source Importer. */
  async probeSource(input: {
    pluginId: string;
    importerId: string;
    source: PluginSourceInput;
    signal?: AbortSignal;
  }): Promise<PluginSourceProbeResult> {
    const record = this._record(input.pluginId);
    const importer = await this._sourceImporter(record, input.importerId);
    if (!importer.probe) {
      return { confidence: 0, diagnostics: [] };
    }
    return this._runContribution(
      record,
      input.importerId,
      (operation) => importer.probe!(input.source, operation),
      input.signal
    );
  }

  /** Import a local source and validate all JSON-only plugin contexts. */
  async importSource(input: {
    pluginId: string;
    importerId: string;
    source: PluginSourceInput;
    signal?: AbortSignal;
  }): Promise<PluginSourceImportResult<TThread>> {
    const record = this._record(input.pluginId);
    const importer = await this._sourceImporter(record, input.importerId);
    const result = await this._runContribution(
      record,
      input.importerId,
      (operation) => importer.importSource(input.source, operation),
      input.signal
    );
    if (this._validateThread && !this._validateThread(result.thread)) {
      throw new Error("Source Importer returned an invalid Thread.");
    }
    this._validateContexts(record.id, result.contexts);
    this._recordDiagnostics(record, result.diagnostics);
    return result;
  }

  /** List model-facing Tool descriptors for one persisted plugin context. */
  async listTools(input: {
    pluginId: string;
    providerId: string;
    context: PluginContext;
    signal?: AbortSignal;
  }): Promise<PluginToolDescriptor[]> {
    this._validateContext(input.pluginId, input.context);
    const record = this._record(input.pluginId);
    const provider = await this._toolProvider(record, input.providerId);
    const tools = await this._runContribution(
      record,
      input.providerId,
      (operation) => provider.listTools(input.context, operation),
      input.signal
    );
    for (const tool of tools) {
      if (!isJSONValue(tool.parameters)) {
        throw new Error(`Plugin tool parameters are not JSON: ${tool.name}`);
      }
    }
    return tools;
  }

  /** Route one explicit manual Tool call to its owning provider. */
  async callTool(input: {
    pluginId: string;
    providerId: string;
    context?: PluginContext;
    toolRef: string;
    arguments: JSONObject;
    signal?: AbortSignal;
  }): Promise<PluginToolCallResult> {
    if (input.context) {
      this._validateContext(input.pluginId, input.context);
    }
    if (!isJSONValue(input.arguments)) {
      throw new Error("Plugin tool arguments must be JSON-compatible.");
    }
    const record = this._record(input.pluginId);
    const provider = await this._toolProvider(record, input.providerId);
    return this._runContribution(
      record,
      input.providerId,
      (operation) =>
        provider.callTool(
          {
            context: input.context,
            toolRef: input.toolRef,
            arguments: input.arguments,
          },
          operation
        ),
      input.signal
    );
  }

  /** List Skill summaries through one explicitly scoped provider. */
  async listSkills(input: {
    pluginId: string;
    providerId: string;
    context: PluginContext;
    signal?: AbortSignal;
  }): Promise<PluginSkillSummary[]> {
    this._validateContext(input.pluginId, input.context);
    const record = this._record(input.pluginId);
    const provider = await this._skillProvider(record, input.providerId);
    return this._runContribution(
      record,
      input.providerId,
      (operation) => provider.listSkills(input.context, operation),
      input.signal
    );
  }

  /** Read one full Skill without falling through to global Skills. */
  async readSkill(input: {
    pluginId: string;
    providerId: string;
    context: PluginContext;
    resourceRef: string;
    signal?: AbortSignal;
  }): Promise<PluginSkillContent | null> {
    this._validateContext(input.pluginId, input.context);
    const record = this._record(input.pluginId);
    const provider = await this._skillProvider(record, input.providerId);
    return this._runContribution(
      record,
      input.providerId,
      (operation) =>
        provider.readSkill(
          { context: input.context, resourceRef: input.resourceRef },
          operation
        ),
      input.signal
    );
  }

  /**
   * Run startup seeders and route every returned request through an existing
   * Source Importer. Individual plugin failures remain isolated diagnostics.
   */
  async runDevelopmentSeeders(
    env: Readonly<Record<string, string | undefined>>
  ): Promise<SeededPluginSource<TThread>[]> {
    const seeded: SeededPluginSource<TThread>[] = [];
    for (const record of this._records.values()) {
      if (!record.enabled || !record.compatible || !record.manifest) {
        continue;
      }
      const declarations = record.manifest.contributions.filter(
        (item) => item.kind === "developmentSeeder"
      );
      for (const declaration of declarations) {
        try {
          await this._activate(record);
          const seeder = record.registrations.developmentSeeders.get(
            declaration.id
          );
          if (!seeder) {
            continue;
          }
          const scopedEnv = Object.fromEntries(
            declaration.environmentVariables.map((name) => [name, env[name]])
          );
          const requests = await this._runContribution(
            record,
            declaration.id,
            (operation) => seeder.seed(scopedEnv, operation)
          );
          for (const request of requests) {
            const result = await this.importSource({
              pluginId: record.id,
              importerId: request.sourceImporterId,
              source: request.source,
            });
            seeded.push({
              pluginId: record.id,
              seederId: declaration.id,
              ...(request.workspacePath
                ? { workspacePath: request.workspacePath }
                : {}),
              result,
            });
          }
        } catch (error) {
          this._addDiagnostic(record, {
            pluginId: record.id,
            contributionId: declaration.id,
            severity: "error",
            code: "development_seed_failed",
            message: _safeErrorMessage(error),
          });
        }
      }
    }
    this._writeSettings();
    return seeded;
  }

  /** Migrate a cloned context and commit only a validated JSON result. */
  async migrateContext(context: PluginContext): Promise<PluginContext> {
    this._validateContext(context.pluginId, context);
    const record = this._record(context.pluginId);
    await this._activate(record);
    if (!record.definition?.migrateContext) {
      return structuredClone(context);
    }
    const migrated = await this._runContribution(
      record,
      undefined,
      (operation) =>
        record.definition!.migrateContext!(structuredClone(context), operation)
    );
    this._validateContext(context.pluginId, migrated);
    if (migrated.contextId !== context.contextId) {
      throw new Error("Plugin context migration cannot change contextId.");
    }
    return migrated;
  }

  private _installCandidates(candidates: PluginCandidate<TThread>[]): void {
    const prepared = candidates.map((candidate) => ({
      candidate,
      validation: validatePluginManifest(candidate.manifestInput),
    }));
    const validById = new Map<string, typeof prepared>();
    for (const item of prepared) {
      const id = item.validation.manifest?.id;
      if (!id) {
        continue;
      }
      const group = validById.get(id) ?? [];
      group.push(item);
      validById.set(id, group);
    }

    for (const item of prepared.sort((left, right) =>
      left.candidate.key.localeCompare(right.candidate.key)
    )) {
      const { candidate, validation } = item;
      const manifest = validation.manifest;
      const fallbackId = manifest?.id ?? candidate.key;
      if (manifest && (validById.get(manifest.id)?.length ?? 0) > 1) {
        if (!this._records.has(manifest.id)) {
          this._records.set(
            manifest.id,
            this._invalidRecord(candidate, manifest.id, manifest, [
              `Duplicate plugin id: ${manifest.id}`,
            ])
          );
        }
        continue;
      }
      if (!validation.valid || !manifest) {
        this._records.set(
          fallbackId,
          this._invalidRecord(
            candidate,
            fallbackId,
            manifest,
            validation.errors
          )
        );
        continue;
      }
      if (candidate.discoveryErrors?.length) {
        this._records.set(
          manifest.id,
          this._invalidRecord(
            candidate,
            manifest.id,
            manifest,
            candidate.discoveryErrors
          )
        );
        continue;
      }
      const errors: string[] = [];
      if (manifest.source !== candidate.source) {
        errors.push(
          `Manifest source ${manifest.source} does not match discovered source ${candidate.source}.`
        );
      }
      if (errors.length > 0) {
        this._records.set(
          manifest.id,
          this._invalidRecord(candidate, manifest.id, manifest, errors)
        );
        continue;
      }
      const compatible = this._isCompatible(manifest);
      const persisted = this._settings.plugins[manifest.id];
      const enabled = persisted?.enabled ?? true;
      const diagnostics = (persisted?.diagnostics ?? []).map(_safeDiagnostic);
      if (!compatible) {
        diagnostics.push(
          _safeDiagnostic({
            pluginId: manifest.id,
            severity: "error",
            code: "plugin_incompatible",
            message: `Requires API ${manifest.apiVersion} and LLM Space ${manifest.engines.llmSpace}.`,
          })
        );
      }
      this._records.set(manifest.id, {
        key: candidate.key,
        id: manifest.id,
        source: candidate.source,
        manifest,
        localManifestPath: candidate.localManifestPath,
        load: () => candidate.load(),
        enabled,
        compatible,
        state: !enabled ? "disabled" : compatible ? "inactive" : "invalid",
        diagnostics: diagnostics.slice(-MAX_DIAGNOSTICS),
        registrations: _emptyRegistrations(),
      });
    }
  }

  private _invalidRecord(
    candidate: PluginCandidate<TThread>,
    id: string,
    manifest: PluginManifest | undefined,
    errors: string[]
  ): PluginRecord<TThread> {
    return {
      key: candidate.key,
      id,
      source: candidate.source,
      manifest,
      localManifestPath: candidate.localManifestPath,
      load: () => candidate.load(),
      enabled: false,
      compatible: false,
      state: "invalid",
      diagnostics: errors.map((message) =>
        _safeDiagnostic({
          pluginId: id,
          severity: "error",
          code: "manifest_invalid",
          message,
        })
      ),
      registrations: _emptyRegistrations(),
    };
  }

  private _localCandidate(localPath: string): PluginCandidate<TThread> {
    const manifestPath = localPath.endsWith("llm-space.plugin.json")
      ? path.resolve(localPath)
      : path.resolve(localPath, "llm-space.plugin.json");
    let manifestInput: unknown = {};
    if (existsSync(manifestPath)) {
      try {
        manifestInput = JSON.parse(readFileSync(manifestPath, "utf8"));
      } catch (error) {
        manifestInput = {
          invalidManifestError: _safeErrorMessage(error),
        };
      }
    }
    const runtime =
      manifestInput &&
      typeof manifestInput === "object" &&
      "runtime" in manifestInput &&
      typeof manifestInput.runtime === "string"
        ? path.resolve(path.dirname(manifestPath), manifestInput.runtime)
        : path.resolve(path.dirname(manifestPath), "index.ts");
    const root = path.dirname(manifestPath);
    const confined =
      runtime === root || runtime.startsWith(`${root}${path.sep}`);
    const load = async (): Promise<PluginRuntimeModule<TThread>> => {
      if (!confined) {
        throw new Error("Plugin runtime entry escapes its plugin directory.");
      }
      if (!existsSync(runtime)) {
        throw new Error("Plugin runtime entry does not exist.");
      }
      const identity = `${statSync(runtime).mtimeMs}-${this._reloadIdentity++}`;
      return import(`${runtime}?llmSpacePlugin=${identity}`) as Promise<
        PluginRuntimeModule<TThread>
      >;
    };
    return {
      key: `local:${manifestPath}`,
      source: "local",
      manifestInput,
      localManifestPath: manifestPath,
      discoveryErrors: [
        ...(!existsSync(manifestPath)
          ? ["Plugin manifest does not exist."]
          : []),
        ...(!confined
          ? ["Plugin runtime entry escapes its plugin directory."]
          : []),
        ...(confined && !existsSync(runtime)
          ? ["Plugin runtime entry does not exist."]
          : []),
      ],
      load,
    };
  }

  private async _activate(record: PluginRecord<TThread>): Promise<void> {
    if (!record.enabled) {
      throw new Error(`Plugin is disabled: ${record.id}`);
    }
    if (record.state === "active") {
      return;
    }
    if (record.activationPromise) {
      return record.activationPromise;
    }
    if (!record.compatible || !record.manifest) {
      throw new Error(`Plugin is incompatible or invalid: ${record.id}`);
    }

    record.state = "activating";
    const activation = (async () => {
      const staged = _emptyRegistrations<TThread>();
      try {
        const module = await record.load();
        const definition = module.default ?? module.plugin;
        if (!definition || typeof definition.activate !== "function") {
          throw new Error(
            "Plugin runtime does not export a plugin definition."
          );
        }
        const registrar = this._registrar(record, staged);
        await definition.activate(registrar, {
          pluginId: record.id,
          storage: new LocalPluginStorage(this._storageRoot, record.id),
          logger: {
            debug: (message) => {
              if (process.env.NODE_ENV !== "production") {
                console.info(`[plugin:${record.id}] ${message}`);
              }
            },
          },
        });
        this._validateRuntimeRegistrations(record, staged);
        record.definition = definition;
        record.registrations = staged;
        record.state = "active";
      } catch (error) {
        record.definition = undefined;
        record.registrations = _emptyRegistrations();
        record.state = "failed";
        this._addDiagnostic(record, {
          pluginId: record.id,
          severity: "error",
          code: "activation_failed",
          message: _safeErrorMessage(error),
        });
        throw error;
      } finally {
        record.activationPromise = undefined;
        this._persistRecord(record);
      }
    })();
    record.activationPromise = activation;
    return activation;
  }

  private async _deactivate(record: PluginRecord<TThread>): Promise<void> {
    if (record.activationPromise) {
      try {
        await record.activationPromise;
      } catch {
        // Activation already recorded its own diagnostic.
      }
    }
    if (!record.definition) {
      record.registrations = _emptyRegistrations();
      return;
    }
    record.state = "deactivating";
    if (record.definition.deactivate) {
      try {
        await this._runWithTimeout(
          (signal) => record.definition!.deactivate!(signal),
          undefined,
          DEACTIVATION_TIMEOUT_MS
        );
      } catch (error) {
        this._addDiagnostic(record, {
          pluginId: record.id,
          severity: "warning",
          code: "deactivation_failed",
          message: _safeErrorMessage(error),
        });
      }
    }
    record.definition = undefined;
    record.registrations = _emptyRegistrations();
  }

  private _registrar(
    record: PluginRecord<TThread>,
    staged: PluginRegistrations<TThread>
  ): PluginRegistrar<TThread> {
    return {
      registerSourceImporter: (id, importer) =>
        this._register(
          record,
          staged.sourceImporters,
          "sourceImporter",
          id,
          importer
        ),
      registerToolProvider: (id, provider) =>
        this._register(
          record,
          staged.toolProviders,
          "toolProvider",
          id,
          provider
        ),
      registerSkillProvider: (id, provider) =>
        this._register(
          record,
          staged.skillProviders,
          "skillProvider",
          id,
          provider
        ),
      registerDevelopmentSeeder: (id, seeder) =>
        this._register(
          record,
          staged.developmentSeeders,
          "developmentSeeder",
          id,
          seeder
        ),
    };
  }

  private _register<T>(
    record: PluginRecord<TThread>,
    registry: Map<string, T>,
    kind: PluginContributionKind,
    id: string,
    contribution: T
  ): void {
    const declared = record.manifest?.contributions.some(
      (item) => item.kind === kind && item.id === id
    );
    if (!declared) {
      throw new Error(`Runtime registered undeclared ${kind}: ${id}`);
    }
    if (registry.has(id)) {
      throw new Error(`Runtime registered duplicate ${kind}: ${id}`);
    }
    registry.set(id, contribution);
  }

  private _validateRuntimeRegistrations(
    record: PluginRecord<TThread>,
    registrations: PluginRegistrations<TThread>
  ): void {
    for (const contribution of record.manifest?.contributions ?? []) {
      const registered = _registryForKind(registrations, contribution.kind).has(
        contribution.id
      );
      if (!registered) {
        throw new Error(
          `Runtime did not register declared ${contribution.kind}: ${contribution.id}`
        );
      }
    }
  }

  private async _sourceImporter(
    record: PluginRecord<TThread>,
    id: string
  ): Promise<PluginSourceImporter<TThread>> {
    await this._activate(record);
    const importer = record.registrations.sourceImporters.get(id);
    if (!importer) {
      throw new Error(`Source Importer is unavailable: ${record.id}/${id}`);
    }
    return importer;
  }

  private async _toolProvider(
    record: PluginRecord<TThread>,
    id: string
  ): Promise<PluginToolProvider> {
    await this._activate(record);
    const provider = record.registrations.toolProviders.get(id);
    if (!provider) {
      throw new Error(`Tool Provider is unavailable: ${record.id}/${id}`);
    }
    return provider;
  }

  private async _skillProvider(
    record: PluginRecord<TThread>,
    id: string
  ): Promise<PluginSkillProvider> {
    await this._activate(record);
    const provider = record.registrations.skillProviders.get(id);
    if (!provider) {
      throw new Error(`Skill Provider is unavailable: ${record.id}/${id}`);
    }
    return provider;
  }

  private async _runContribution<T>(
    record: PluginRecord<TThread>,
    contributionId: string | undefined,
    operation: (context: { signal: AbortSignal }) => Promise<T> | T,
    externalSignal?: AbortSignal
  ): Promise<T> {
    try {
      return await this._runWithTimeout(
        (signal) => operation({ signal }),
        externalSignal,
        this._operationTimeoutMs
      );
    } catch (error) {
      this._addDiagnostic(record, {
        pluginId: record.id,
        ...(contributionId ? { contributionId } : {}),
        severity: "error",
        code: externalSignal?.aborted
          ? "operation_aborted"
          : "operation_failed",
        message: _safeErrorMessage(error),
      });
      throw new Error(_safeErrorMessage(error), { cause: error });
    }
  }

  private _runWithTimeout<T>(
    operation: (signal: AbortSignal) => Promise<T> | T,
    externalSignal: AbortSignal | undefined,
    timeoutMs: number
  ): Promise<T> {
    const controller = new AbortController();
    const abort = () => controller.abort(externalSignal?.reason);
    externalSignal?.addEventListener("abort", abort, { once: true });
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        controller.abort(new Error("Plugin operation timed out."));
        reject(new Error("Plugin operation timed out."));
      }, timeoutMs);
    });
    const aborted = new Promise<never>((_resolve, reject) => {
      if (externalSignal?.aborted) {
        reject(new Error("Plugin operation was cancelled."));
        return;
      }
      externalSignal?.addEventListener(
        "abort",
        () => reject(new Error("Plugin operation was cancelled.")),
        { once: true }
      );
    });
    return Promise.race([
      Promise.resolve().then(() => operation(controller.signal)),
      timeout,
      aborted,
    ]).finally(() => {
      if (timer) {
        clearTimeout(timer);
      }
      externalSignal?.removeEventListener("abort", abort);
    });
  }

  private _validateContexts(pluginId: string, contexts: PluginContext[]): void {
    const ids = new Set<string>();
    for (const context of contexts) {
      this._validateContext(pluginId, context);
      if (ids.has(context.contextId)) {
        throw new Error(`Duplicate plugin context id: ${context.contextId}`);
      }
      ids.add(context.contextId);
    }
  }

  private _validateContext(pluginId: string, context: PluginContext): void {
    if (context.pluginId !== pluginId) {
      throw new Error("Plugin context ownership does not match the route.");
    }
    if (!context.contextId || !context.sourceId || !context.label) {
      throw new Error("Plugin context is missing stable identity metadata.");
    }
    if (!Number.isInteger(context.schemaVersion) || context.schemaVersion < 1) {
      throw new Error(
        "Plugin context schemaVersion must be a positive integer."
      );
    }
    if (!isJSONValue(context.data)) {
      throw new Error("Plugin context data must be JSON-compatible.");
    }
  }

  private _isCompatible(manifest: PluginManifest): boolean {
    try {
      return (
        _major(manifest.apiVersion) === _major(this._apiVersion) &&
        Bun.semver.satisfies(this._engineVersion, manifest.engines.llmSpace)
      );
    } catch {
      return false;
    }
  }

  private _view(record: PluginRecord<TThread>): PluginView {
    return {
      id: record.id,
      name: record.manifest?.name ?? record.id,
      version: record.manifest?.version ?? "Unknown",
      ...(record.manifest?.description
        ? { description: record.manifest.description }
        : {}),
      source: record.source,
      compatible: record.compatible,
      enabled: record.enabled,
      state: record.state,
      capabilities: record.manifest?.capabilities ?? [],
      contributions: record.manifest?.contributions ?? [],
      diagnostics: record.diagnostics.map((diagnostic) => ({ ...diagnostic })),
    };
  }

  private _record(pluginId: string): PluginRecord<TThread> {
    this._assertInitialized();
    const record = this._records.get(pluginId);
    if (!record) {
      throw new Error(`Plugin is unavailable: ${pluginId}`);
    }
    return record;
  }

  private _assertInitialized(): void {
    if (!this._initialized) {
      throw new Error("PluginManager has not been initialized.");
    }
  }

  private _recordDiagnostics(
    record: PluginRecord<TThread>,
    diagnostics: PluginDiagnostic[]
  ): void {
    for (const diagnostic of diagnostics) {
      this._addDiagnostic(record, diagnostic);
    }
  }

  private _addDiagnostic(
    record: PluginRecord<TThread>,
    diagnostic: PluginDiagnostic
  ): void {
    record.diagnostics = [
      ...record.diagnostics,
      _safeDiagnostic({ ...diagnostic, pluginId: record.id }),
    ].slice(-MAX_DIAGNOSTICS);
    this._persistRecord(record);
  }

  private _readSettings(): PersistedPluginSettings {
    try {
      const parsed = JSON.parse(
        readFileSync(this._settingsPath, "utf8")
      ) as Partial<PersistedPluginSettings>;
      return {
        version: SETTINGS_VERSION,
        localPaths: Array.isArray(parsed.localPaths)
          ? parsed.localPaths.filter(
              (item): item is string => typeof item === "string"
            )
          : [],
        plugins:
          parsed.plugins && typeof parsed.plugins === "object"
            ? parsed.plugins
            : {},
      };
    } catch {
      return _emptySettings();
    }
  }

  private _persistRecord(record: PluginRecord<TThread>): void {
    this._settings.plugins[record.id] = {
      enabled: record.enabled,
      diagnostics: record.diagnostics.map(_safeDiagnostic),
    };
    this._writeSettings();
  }

  private _writeSettings(): void {
    mkdirSync(path.dirname(this._settingsPath), { recursive: true });
    const temporary = `${this._settingsPath}.tmp`;
    writeFileSync(
      temporary,
      `${JSON.stringify(this._settings, null, 2)}\n`,
      "utf8"
    );
    renameSync(temporary, this._settingsPath);
  }
}

function _emptySettings(): PersistedPluginSettings {
  return { version: SETTINGS_VERSION, localPaths: [], plugins: {} };
}

function _emptyRegistrations<TThread>(): PluginRegistrations<TThread> {
  return {
    sourceImporters: new Map(),
    toolProviders: new Map(),
    skillProviders: new Map(),
    developmentSeeders: new Map(),
  };
}

function _registryForKind<TThread>(
  registrations: PluginRegistrations<TThread>,
  kind: PluginContributionKind
): Map<string, unknown> {
  switch (kind) {
    case "sourceImporter":
      return registrations.sourceImporters;
    case "toolProvider":
      return registrations.toolProviders;
    case "skillProvider":
      return registrations.skillProviders;
    case "developmentSeeder":
      return registrations.developmentSeeders;
  }
}

function _major(version: string): number {
  const major = Number.parseInt(version.split(".")[0] ?? "", 10);
  if (!Number.isInteger(major)) {
    throw new Error(`Invalid semantic version: ${version}`);
  }
  return major;
}

function _safeDiagnostic(diagnostic: PluginDiagnostic): PluginDiagnostic {
  return {
    pluginId: diagnostic.pluginId,
    ...(diagnostic.contributionId
      ? { contributionId: diagnostic.contributionId }
      : {}),
    severity: diagnostic.severity,
    code: diagnostic.code.slice(0, 120),
    message: _redact(diagnostic.message).slice(0, 1_000),
    ...(diagnostic.metadata && isJSONValue(diagnostic.metadata)
      ? { metadata: _redactJSON(diagnostic.metadata) as JSONObject }
      : {}),
    timestamp: diagnostic.timestamp ?? Date.now(),
  };
}

function _safeErrorMessage(error: unknown): string {
  return _redact(error instanceof Error ? error.message : String(error)).slice(
    0,
    1_000
  );
}

function _redact(input: string): string {
  return input
    .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi, "$1 [redacted]")
    .replace(
      /\b(api[-_ ]?key|token|secret|password)\b\s*[:=]\s*[^\s,;]+/gi,
      "$1=[redacted]"
    );
}

function _redactJSON(
  value: import("@llm-space/plugin-api").JSONValue
): import("@llm-space/plugin-api").JSONValue {
  if (typeof value === "string") {
    return _redact(value);
  }
  if (Array.isArray(value)) {
    return value.map(_redactJSON);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        /api[-_]?key|token|secret|password|authorization/i.test(key)
          ? "[redacted]"
          : _redactJSON(item),
      ])
    );
  }
  return value;
}
