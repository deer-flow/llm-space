"use client";

import {
  HostServicesProvider,
  type HostServices,
  type ModelClient,
} from "@llm-space/ui/host";
import { useMemo, type ReactNode } from "react";

import { fsReveal, listBuiltInTools } from "@/client/built-in-tools";
import {
  checkUv,
  pickGeneratorDirectory,
  prepareGeneratorDirectory,
  removeProjectFile,
  resolveGeneratorEnv,
  runUv,
  writeProjectFile,
} from "@/client/generator";
import { listMcpServers, listMcpTools } from "@/client/mcp";
import {
  directoryExists,
  ensureRootDir,
  pickDirectory,
  pickFile,
  readTextFile,
  textFileExists,
} from "@/client/paths";
import { createRpcTransport } from "@/client/rpc-transport";
import { getSearchSettings } from "@/client/search";
import { getSkillsSettings, listSkills } from "@/client/skills";
import { executeTool } from "@/client/tool-execution";
import { useCommands } from "@/commands";
import { electrobun } from "@/lib/electrobun";
import type { SettingsTab } from "@/shared/commands";
import type { RuntimeId } from "@/shared/runtime";

import { createDesktopShareThreadAction } from "./share-thread-action";

// One transport for the app: stream agent runs over Electrobun RPC to the bun
// process. It multiplexes concurrent runs by internal `streamId`, so a single
// module-level instance is safe.
const transport = createRpcTransport();

function _rpc() {
  if (!electrobun.rpc) {
    throw new Error("Electrobun RPC is not initialized");
  }
  return electrobun.rpc;
}

/** The desktop {@link ModelClient}, backed by Electrobun RPC. */
export function createElectrobunModelClient(
  runtimeId?: RuntimeId
): ModelClient {
  const scope = () => (runtimeId ? { runtimeId } : {});
  return {
    availableModels: () => _rpc().request.availableModels(scope()),
    builtinProviders: () => _rpc().request.builtinProviders(scope()),
    getDefaultModel: () => _rpc().request.getDefaultModel(scope()),
    setDefaultModel: (model) =>
      _rpc().request.setDefaultModel({ ...scope(), model }),
    removeProvider: (providerId) =>
      _rpc().request.removeProvider({ ...scope(), providerId }),
    addProvider: (providerId) =>
      _rpc().request.addProvider({ ...scope(), providerId }),
    addCustomProvider: (input) =>
      _rpc().request.addCustomProvider({ ...scope(), ...input }),
    updateProvider: (providerId, fields) =>
      _rpc().request.updateProvider({ ...scope(), providerId, ...fields }),
    setModelEnabled: (providerId, modelId, enabled) =>
      _rpc().request.setModelEnabled({
        ...scope(),
        providerId,
        modelId,
        enabled,
      }),
    setAllModelsEnabled: (providerId, enabled) =>
      _rpc().request.setAllModelsEnabled({ ...scope(), providerId, enabled }),
    testModelConnection: async (providerId, modelId, candidate) => {
      await _rpc().request.testModelConnection({
        ...scope(),
        providerId,
        modelId,
        candidate,
      });
    },
    removeCustomModel: (providerId, modelId) =>
      _rpc().request.removeCustomModel({ ...scope(), providerId, modelId }),
    upsertCustomModel: (providerId, model, originalId) =>
      _rpc().request.upsertCustomModel({
        ...scope(),
        providerId,
        model,
        originalId,
      }),
  };
}

/**
 * Provides the desktop {@link HostServices} to the shared Thread Playground:
 * the RPC transport, tool execution, skills/mcp/paths clients, and navigation
 * routed through the command bus. Must sit inside `CommandProvider`.
 */
export function DesktopHostProvider({ children }: { children: ReactNode }) {
  const { executeCommand, registerCommandHandlers } = useCommands();

  const value = useMemo<HostServices>(
    () => ({
      presentational: false,
      transport,
      executeTool,
      skills: {
        getSettings: (options) =>
          getSkillsSettings(options?.runtimeId as RuntimeId | undefined),
        listSkills: (path, options) =>
          listSkills(path, options?.runtimeId as RuntimeId | undefined),
      },
      mcp: {
        listServers: (options) =>
          listMcpServers(options?.runtimeId as RuntimeId | undefined),
        listTools: (serverId, options) =>
          listMcpTools(serverId, options?.runtimeId as RuntimeId | undefined),
      },
      builtinTools: {
        list: (options) =>
          listBuiltInTools(options?.runtimeId as RuntimeId | undefined),
        fsReveal,
      },
      paths: { ensureRootDir },
      files: {
        readText: readTextFile,
        exists: textFileExists,
        directoryExists,
        pickFile,
        pickDirectory,
      },
      generator: {
        pickDirectory: pickGeneratorDirectory,
        prepareDirectory: prepareGeneratorDirectory,
        checkUv,
        runUv,
        writeFile: writeProjectFile,
        removeFile: removeProjectFile,
        getSearchSettings,
        resolveEnv: resolveGeneratorEnv,
      },
      actions: {
        openSettings: (tab) =>
          executeCommand({
            type: "openSettings",
            args: { tab: tab as SettingsTab },
          }),
        openLink: (url) => executeCommand({ type: "openLink", args: { url } }),
        shareThread: createDesktopShareThreadAction(executeCommand),
        openVariables: (variableName) =>
          executeCommand({ type: "openVariables", args: { variableName } }),
        registerOpenVariables: (handler) =>
          registerCommandHandlers({
            openVariables: ({ variableName }) => handler(variableName),
          }),
        registerRunThread: (run) =>
          registerCommandHandlers({ runThread: () => run() }),
      },
    }),
    [executeCommand, registerCommandHandlers]
  );

  return <HostServicesProvider value={value}>{children}</HostServicesProvider>;
}
