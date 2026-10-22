"use client";

import { createContext, useContext, type ReactNode } from "react";

/**
 * Presentation-layer strings for the thread playground's header action
 * cluster (run/undo/redo controls and the "More actions" dropdown). English
 * defaults live here so a host without a provider (the static web viewer)
 * keeps working; the desktop app supplies a localized value from its own
 * message tree through {@link PlaygroundLabelsProvider}.
 *
 * Boundary: these are UI chrome only. Model-facing strings — tool names and
 * definitions, system prompts, generated code, and thread content — are
 * deliberately not part of this type and must not be localized.
 */
export interface PlaygroundLabels {
  /** UI-only summaries keyed by built-in name; missing entries use the English definition. */
  builtInToolDescriptions: Readonly<Record<string, string | undefined>>;
  /** Localize a provider name for presentation without changing its identity. */
  providerDisplayName: (provider: { id: string; name: string }) => string;
  /** Tooltip + aria-label of the "More actions" dropdown trigger. */
  moreActions: string;
  viewRunHistory: string;
  hideRunHistory: string;
  compactConversation: string;
  generateProject: string;
  /** The small uppercase badge beside "Generate Project". */
  betaBadge: string;
  shareThread: string;
  undoLastEdit: string;
  redoLastEdit: string;
  /** Run-button tooltip per thread status. */
  runThreadTooltip: string;
  stopRunningTooltip: string;
  preparingThreadTooltip: string;
  /** Run-button visible label per thread status. */
  runLabel: string;
  stopLabel: string;
  preparingLabel: string;
  /** Run-button aria-label per thread status. */
  runThreadAria: string;
  stopRunningThreadAria: string;
  preparingThreadAria: string;
  /** The run-settings chevron menu beside the Run button. */
  runSettings: string;
  enableReActLoop: string;
  autoRunTools: string;
  dialogs: {
    add: string;
    remove: string;
    cancel: string;
    save: string;
    create: string;
    searchTools: string;
    enableAllTools: string;
    disableAllTools: string;
    confirmations: {
      firecrawlLimitTitle: string;
      firecrawlLimitDescription: string;
      notNow: string;
      configureApiKey: string;
      deleteVariableTitle: string;
      deleteVariableReferencedDescription: (name: string) => string;
      deleteVariableDescription: (name: string) => string;
      deleteVariable: string;
      removeRubricScoresTitle: string;
      removeRubricScoresDescription: string;
      removeScoresAndSave: string;
      deleteRubricTitle: string;
      deleteRubricDescription: string;
      createEnvFileTitle: string;
      createEnvFileDescription: string;
      noThanks: string;
      createEnvFile: string;
      removeRunTitle: string;
      removeRunDescription: string;
      removeEvaluationTitle: string;
      removeEvaluationDescription: string;
    };
    images: {
      fileInputAria: string;
      addImageAria: string;
      addImages: string;
      fromFiles: string;
      fromClipboard: string;
    };
    compaction: {
      title: string;
      preview: string;
      introDescription: string;
      configureDescription: string;
      reviewDescription: string;
      compactConversation: string;
      needsTwoTurns: string;
      help: string;
      next: string;
      back: string;
      start: string;
      apply: string;
      creatingCopy: string;
      preparing: string;
      compacting: string;
      tryAgain: string;
    };
    stats: {
      tokenUsage: string;
      input: string;
      output: string;
      cached: string;
      timing: string;
      firstToken: string;
      requestSent: string;
      complete: string;
      waiting: (duration: string) => string;
      generating: (duration: string) => string;
      response: string;
      totalResponseTime: string;
      timeToFirstToken: string;
      tokensPerSecond: string;
      tokensPerSecondValue: (value: string) => string;
      tpsHint: string;
      cacheRead: string;
      cost: string;
      total: string;
    };
    builtIn: {
      title: string;
      description: string;
      fileSystem: string;
      web: string;
      media: string;
      misc: string;
      emptySearch: string;
      emptyCategory: string;
      loadFailed: string;
      chooseImageModel: string;
      chooseImageModelHint: string;
      provider: string;
      chooseProvider: string;
      imageProviderAria: string;
      model: string;
      profile: string;
      defaultSize: string;
      watermark: string;
      imageModelAria: string;
      chooseModel: string;
      imageSizeAria: string;
      imageWatermarkAria: string;
      noImageModels: string;
    };
    mcp: {
      title: string;
      description: string;
      loadServersFailed: string;
      loadToolsFailed: string;
      loading: string;
      noServers: string;
      configure: string;
      noServersConfigured: string;
      openSettings: string;
      testServer: string;
      noToolsLoaded: string;
    };
    plugins: {
      title: string;
      description: string;
      searchAria: string;
      localOnly: string;
      emptySearch: string;
      empty: string;
      loadFailed: string;
    };
    variables: { title: string; description: string; help: string };
    skills: {
      title: string;
      description: string;
      search: string;
      allDefault: string;
      selected: (count: number) => string;
      selectAll: string;
      selectNone: string;
      loading: string;
      empty: string;
      manage: string;
      done: string;
    };
    modelParams: {
      title: string;
      temperature: string;
      maxTokens: string;
      thinkingEffort: string;
      responseFormat: string;
      enable: string;
      disable: string;
      configure: string;
      details: string;
      editSchema: string;
      reasoningLevels: Record<
        "off" | "minimal" | "low" | "medium" | "high" | "xhigh",
        string
      >;
    };
    toolEditor: {
      addFunction: string;
      editFunction: string;
      functionDescription: string;
      definition: string;
      addProviderHosted: string;
      editProviderHosted: string;
      providerHostedDescription: string;
      configuration: string;
      generateFunctionPlaceholder: string;
      generateSystemPromptPlaceholder: string;
      systemPromptPlaceholder: string;
    };
    sections: {
      models: string;
      tools: string;
      variables: string;
      add: string;
      systemPrompt: string;
      addBuiltInTools: string;
      addPluginTools: string;
      addMcpTools: string;
      addProviderHostedTool: string;
      addCustomFunctionTool: string;
    };
    toolCalls: {
      count: (count: number) => string;
      callTools: string;
      callAvailableTools: string;
      continue: string;
      runFromMessage: string;
      previewText: string;
      noText: string;
    };
    /** Collapsed cross-message process group headers. */
    processGroups: {
      lastTool: (name: string) => string;
      errors: (count: number) => string;
    };
    messages: {
      user: string;
      assistant: string;
      add: string;
      dragHandle: (role: string) => string;
      dragToReorder: string;
      text: (role: string) => string;
    };
    modelCard: {
      model: string;
      provider: string;
      apiType: string;
      baseUrl: string;
      contextWindow: string;
      maxTokens: string;
      reasoning: string;
      imageInput: string;
      inputCost: string;
      outputCost: string;
      supported: string;
      notSupported: string;
    };
    examples: { title: string; labels: Record<string, string> };
    toolCallCard: {
      previewArguments: string;
      copyArguments: string;
      calling: string;
      call: string;
      previewResponse: string;
      markError: string;
      clearError: string;
      argumentsCopied: string;
      copyArgumentsFailed: string;
      callFailed: (name: string) => string;
      addResponses: string;
    };
    variablesPanel: {
      builtIn: string;
      custom: string;
      addCustom: string;
      noCustom: string;
      addVariable: string;
      availableSkills: string;
      selectSkills: string;
      name: string;
      format: string;
      indent: string;
      value: string;
      default: string;
      spaces: (count: number) => string;
      loadingSkills: string;
      allSkills: string;
      noneSelected: string;
      selectedSkills: (count: number) => string;
      missingSkills: (count: number) => string;
      empty: string;
      noFile: string;
      text: string;
      fileContent: string;
      currentDate: string;
      currentWorkingDirectory: string;
      directory: string;
      browse: string;
      revealInFinder: string;
      userDefined: string;
      jsonVariable: string;
      valueJson: string;
      fileVariable: string;
      filePath: string;
      markdownList: string;
    };
    tooltips: {
      generate: string;
      insertMessage: string;
      toggleRole: string;
      removeMessage: string;
      expandMessage: string;
      collapseMessage: string;
      removeImage: string;
      openImagePreview: string;
      removeTool: string;
      deleteVariable: string;
      editTitle: string;
      clickToEditTitle: string;
      threadTitle: string;
      previousRun: string;
      nextRun: string;
      inspectRun: string;
      restoreRun: string;
      removeRun: string;
      selectRun: string;
      removeFromComparison: string;
      removeEvaluation: string;
      closeRunHistory: string;
      backToRunHistory: string;
      editRubric: string;
      createRubric: string;
      evaluationRubric: string;
      moveCriterionUp: string;
      moveCriterionDown: string;
      removeCriterion: string;
      expand: string;
      collapse: string;
    };
    codegen: {
      trigger: string;
      title: string;
      intro: string;
      destination: string;
      build: string;
      frameworkDescription: string;
      targetDescription: string;
      compilingDescription: string;
      help: string;
      cancel: string;
      next: string;
      back: string;
      generate: string;
      checking: string;
      generating: string;
      done: string;
      openFolder: string;
      installUv: string;
      playgroundToCode: string;
      takeAgentOut: string;
      exportIntelligence: string;
      playgroundContext: string;
      runnableProject: string;
      exportFormat: string;
      chooseRuntime: string;
      available: string;
      giveHome: string;
      chooseProjectHome: string;
      parentDirectory: string;
      projectName: string;
      projectPath: string;
      browse: string;
      projectBlueprint: string;
      editablePythonProject: string;
      contextIncluded: string;
      useMetaUserPrompt: string;
      unavailable: string;
      suggestedOn: string;
      suggestedOff: string;
      metaPromptEnabled: string;
      metaPromptUnavailable: string;
      building: string;
      buildStopped: string;
      buildComplete: string;
      buildActivity: string;
      preparingBuild: string;
      dependenciesMayTake: string;
      nextSteps: string;
      agentReady: string;
      copyCommand: string;
    };
  };
}

export function identityProviderDisplayName(provider: {
  id: string;
  name: string;
}): string {
  return provider.name;
}

export const DEFAULT_PLAYGROUND_LABELS: PlaygroundLabels = {
  builtInToolDescriptions: {},
  providerDisplayName: identityProviderDisplayName,
  moreActions: "More actions",
  viewRunHistory: "View Run History",
  hideRunHistory: "Hide Run History",
  compactConversation: "Compact Conversation",
  generateProject: "Generate Project",
  betaBadge: "Beta",
  shareThread: "Share Thread",
  undoLastEdit: "Undo last edit",
  redoLastEdit: "Redo last edit",
  runThreadTooltip: "Run this thread",
  stopRunningTooltip: "Stop running",
  preparingThreadTooltip: "Preparing thread",
  runLabel: "Run",
  stopLabel: "Stop",
  preparingLabel: "Preparing",
  runThreadAria: "Run thread",
  stopRunningThreadAria: "Stop running thread",
  preparingThreadAria: "Preparing thread",
  runSettings: "Run settings",
  enableReActLoop: "Enable ReAct loop",
  autoRunTools: "Auto run tools",
  dialogs: {
    add: "Add",
    remove: "Remove",
    cancel: "Cancel",
    save: "Save",
    create: "Create",
    searchTools: "Search tools",
    enableAllTools: "Enable all tools",
    disableAllTools: "Disable all tools",
    confirmations: {
      firecrawlLimitTitle: "Firecrawl daily limit reached",
      firecrawlLimitDescription:
        "The built-in web tools hit Firecrawl's daily limit of free, unauthenticated credits. Add a Firecrawl API key to raise the limit and keep using web fetch and search.",
      notNow: "Not now",
      configureApiKey: "Configure API key",
      deleteVariableTitle: "Delete variable?",
      deleteVariableReferencedDescription: (name) =>
        `This thread references "{{${name}}}". Deleting this variable will leave unresolved placeholders.`,
      deleteVariableDescription: (name) =>
        `This removes "{{${name}}}" and its value from this thread.`,
      deleteVariable: "Delete variable",
      removeRubricScoresTitle: "Remove rubric scores?",
      removeRubricScoresDescription:
        "Saving without a rubric permanently removes the saved rubric snapshot and all criterion scores from this evaluation. This cannot be undone.",
      removeScoresAndSave: "Remove scores and save",
      deleteRubricTitle: "Delete rubric?",
      deleteRubricDescription:
        "The reusable definition will be removed. Saved evaluations keep their immutable rubric snapshots and scores.",
      createEnvFileTitle: "Create a .env file for you?",
      createEnvFileDescription:
        "Write your model and search-engine API keys — resolving values from your environment variables — into the project's .env so it's ready to run. You can also do this yourself later.",
      noThanks: "No thanks",
      createEnvFile: "Yes, create .env",
      removeRunTitle: "Remove Run?",
      removeRunDescription:
        "This removes the saved run from this thread and removes any evaluations that reference it.",
      removeEvaluationTitle: "Remove Evaluation?",
      removeEvaluationDescription:
        "This removes the saved evaluation from this thread. The compared runs are kept.",
    },
    images: {
      fileInputAria: "Image files",
      addImageAria: "Add image to message",
      addImages: "Add Images",
      fromFiles: "From Files",
      fromClipboard: "From Clipboard",
    },
    compaction: {
      title: "Compact conversation",
      preview: "Preview",
      introDescription:
        "See how compaction creates room without losing the thread.",
      configureDescription:
        "Choose what stays verbatim and what the checkpoint should emphasize.",
      reviewDescription:
        "Review the generated checkpoint before changing the conversation.",
      compactConversation: "Compact conversation",
      needsTwoTurns: "At least two user turns are needed to compact",
      help: "Help",
      next: "Next",
      back: "Back",
      start: "Start compact",
      apply: "Apply compaction",
      creatingCopy: "Creating copy…",
      preparing: "Preparing…",
      compacting: "Compacting…",
      tryAgain: "Try again",
    },
    stats: {
      tokenUsage: "Token usage",
      input: "Input",
      output: "Output",
      cached: "Cached",
      timing: "Timing",
      firstToken: "First token",
      requestSent: "Request sent",
      complete: "Complete",
      waiting: (duration) => `Waiting ${duration}`,
      generating: (duration) => `Generating ${duration}`,
      response: "Response",
      totalResponseTime: "Total response time",
      timeToFirstToken: "Time to first token (TTFT)",
      tokensPerSecond: "Tokens per second (TPS)",
      tokensPerSecondValue: (value) => `${value} tokens/s`,
      tpsHint: "TPS counts output tokens only during the generating segment.",
      cacheRead: "Cache Read",
      cost: "Cost",
      total: "Total",
    },
    builtIn: {
      title: "Add built-in tools",
      description: "Choose built-in tools to make available in this thread.",
      fileSystem: "File system",
      web: "Web",
      media: "Media",
      misc: "Misc",
      emptySearch: "No tools match your search.",
      emptyCategory: "No built-in tools in this category.",
      loadFailed: "Failed to load built-in tools",
      chooseImageModel: "Choose an enabled image model",
      chooseImageModelHint:
        "Enable an image model in Settings, then select it here.",
      provider: "Provider",
      chooseProvider: "Choose provider",
      imageProviderAria: "Generate image provider",
      model: "Model",
      profile: "Profile",
      defaultSize: "Default size",
      watermark: "Watermark",
      imageModelAria: "Generate image model",
      chooseModel: "Choose model",
      imageSizeAria: "Default image size",
      imageWatermarkAria: "Add AI-generated watermark",
      noImageModels:
        "Enable an image model for this provider in Settings before adding this tool.",
    },
    mcp: {
      title: "Add MCP tools",
      description:
        "Choose a server, then add one or more MCP tools to this thread.",
      loadServersFailed: "Failed to load MCP servers",
      loadToolsFailed: "Failed to load MCP tools",
      loading: "Loading…",
      noServers: "No servers",
      configure: "Configure MCP",
      noServersConfigured: "No MCP servers configured.",
      openSettings: "Open settings",
      testServer: "Test server",
      noToolsLoaded: "no tools loaded",
    },
    plugins: {
      title: "Add Plugin Tools",
      description:
        "Choose tools from locally installed Plugins for this thread.",
      searchAria: "Search Plugin Tools",
      localOnly: "Plugin Tools are available only in the local runtime.",
      emptySearch: "No Plugin Tools match your search.",
      empty: "No Plugin Tools are available.",
      loadFailed: "Failed to load Plugin Tools",
    },
    variables: {
      title: "Variables",
      description:
        "Use {{variable_name}} as placeholder in your prompt, messages and tool results to reference the variable. e.g. {{current_date}} will be replaced with the current date.",
      help: "Help",
    },
    skills: {
      title: "Select skills",
      description:
        "All enabled skills are included by default. Pick specific skills to narrow it to only those.",
      search: "Search skills",
      allDefault: "All skills (default)",
      selected: (count) => `Selected ${count}`,
      selectAll: "Select all",
      selectNone: "Select none",
      loading: "Loading skills...",
      empty: "No matching skills.",
      manage: "Manage skill folders",
      done: "Done",
    },
    modelParams: {
      title: "Model settings",
      temperature: "Temperature",
      maxTokens: "Max tokens",
      thinkingEffort: "Thinking effort",
      responseFormat: "Response format",
      enable: "Enable",
      disable: "Disable",
      configure: "Configure model settings",
      details: "Show model details",
      editSchema: "Edit schema",
      reasoningLevels: {
        off: "Off",
        minimal: "Minimal",
        low: "Low",
        medium: "Medium",
        high: "High",
        xhigh: "X-High",
      },
    },
    toolEditor: {
      addFunction: "Add function tool",
      editFunction: "Edit tool",
      functionDescription:
        "A function tool consists of a name, description, and parameters. Parameters are defined using JSON Schema. Since the tool is customized, you need to provide a response at runtime.",
      definition: "Definition",
      addProviderHosted: "Add provider-hosted tool",
      editProviderHosted: "Edit provider-hosted tool",
      providerHostedDescription:
        "This JSON is passed directly to the selected model service. Fields beyond type are preserved unchanged. LLM Space does not verify whether the selected provider or model supports the tool or its parameters. Provider-hosted tools run inside the model request and are not controlled by Auto run tools.",
      configuration: "Configuration",
      generateFunctionPlaceholder:
        "Describe what your function does (or paste your function declaration code), and we'll generate a definition.",
      generateSystemPromptPlaceholder:
        "Describe the assistant you want (its role, tone, and rules), and we'll generate a system prompt.",
      systemPromptPlaceholder: "Enter system prompt here",
    },
    sections: {
      models: "Models",
      tools: "Tools",
      variables: "Variables",
      add: "Add",
      systemPrompt: "System prompt",
      addBuiltInTools: "Add Built-in Tools",
      addPluginTools: "Add Plugin Tools",
      addMcpTools: "Add MCP Tools",
      addProviderHostedTool: "Add Provider-Hosted Tool",
      addCustomFunctionTool: "Add Custom Function Tool",
    },
    toolCalls: {
      count: (count) => `${count} tool call${count === 1 ? "" : "s"}`,
      callTools: "Call tools",
      callAvailableTools: "Call available tools",
      continue: "Continue",
      runFromMessage: "Run from this message",
      previewText: "Preview text content",
      noText: "No text content",
    },
    processGroups: {
      lastTool: (name) => `Last: ${name}`,
      errors: (count) => `${count} failed`,
    },
    messages: {
      user: "User",
      assistant: "Assistant",
      add: "Add message",
      dragHandle: (role) => `${role} message drag handle`,
      dragToReorder: "Drag to reorder",
      text: (role) => `${role} message text`,
    },
    modelCard: {
      model: "Model",
      provider: "Provider",
      apiType: "API type",
      baseUrl: "Base URL",
      contextWindow: "Context window",
      maxTokens: "Max tokens",
      reasoning: "Reasoning",
      imageInput: "Image input",
      inputCost: "Input cost",
      outputCost: "Output cost",
      supported: "Supported",
      notSupported: "Not supported",
    },
    examples: {
      title: "Examples",
      labels: {
        blank: "Blank - Create from scratch",
        "general-agent": "General Agent",
        "deep-research": "Deep Research",
        translation: "Translation",
        "deep-wiki": "Deep Wiki",
        "compact-memory": "Compact Memory",
        "meta-prompt": "Meta Prompt",
        "meta-image-prompt": "Meta Image Prompt",
      },
    },
    toolCallCard: {
      previewArguments: "Preview arguments",
      copyArguments: "Copy arguments",
      calling: "Calling tool",
      call: "Call this tool",
      previewResponse: "Preview response",
      markError: "Mark as error",
      clearError: "Clear error",
      argumentsCopied: "Arguments copied",
      copyArgumentsFailed: "Failed to copy arguments",
      callFailed: (name) => `Failed to call ${name}()`,
      addResponses: "Add tool responses before continuing",
    },
    variablesPanel: {
      builtIn: "Built-in",
      custom: "Custom",
      addCustom: "Add custom variable",
      noCustom: "No custom variables.",
      addVariable: "Add variable",
      availableSkills: "Available skills",
      selectSkills: "Select skills",
      name: "Name",
      format: "Format",
      indent: "Indent",
      value: "Value",
      default: "Default",
      spaces: (count) => `${count} spaces`,
      loadingSkills: "Loading skills...",
      allSkills: "All skills",
      noneSelected: "None selected",
      selectedSkills: (count) => `${count} selected`,
      missingSkills: (count) => `${count} missing`,
      empty: "(empty)",
      noFile: "(no file)",
      text: "Text",
      fileContent: "File content",
      currentDate: "Current date",
      currentWorkingDirectory: "Current working directory",
      directory: "Directory",
      browse: "Browse…",
      revealInFinder: "Reveal in Finder",
      userDefined: "User defined variable",
      jsonVariable: "JSON variable",
      valueJson: "Value (JSON)",
      fileVariable: "File content variable",
      filePath: "File path",
      markdownList: "Markdown list",
    },
    tooltips: {
      generate: "Generate",
      insertMessage: "Insert message here",
      toggleRole: "Toggle role",
      removeMessage: "Remove message",
      expandMessage: "Expand message",
      collapseMessage: "Collapse message",
      removeImage: "Remove image",
      openImagePreview: "Open image preview",
      removeTool: "Remove tool",
      deleteVariable: "Delete variable",
      editTitle: "Edit title",
      clickToEditTitle: "Click to edit title",
      threadTitle: "Thread title",
      previousRun: "Previous run",
      nextRun: "Next run",
      inspectRun: "Inspect run",
      restoreRun: "Restore run",
      removeRun: "Remove run",
      selectRun: "Select run",
      removeFromComparison: "Remove from comparison",
      removeEvaluation: "Remove evaluation",
      closeRunHistory: "Close run history",
      backToRunHistory: "Back to run history",
      editRubric: "Edit rubric",
      createRubric: "Create rubric",
      evaluationRubric: "Evaluation rubric",
      moveCriterionUp: "Move criterion up",
      moveCriterionDown: "Move criterion down",
      removeCriterion: "Remove criterion",
      expand: "Click to expand",
      collapse: "Click to collapse",
    },
    codegen: {
      trigger: "Generate a runnable agent for this thread",
      title: "Generate a runnable agent",
      intro: "Introduction",
      destination: "Destination",
      build: "Build",
      frameworkDescription:
        "Turn this thread into a real codebase—prompt, tools, variables, messages, and a plan to finish it.",
      targetDescription:
        "Name the project, choose its home, and preview what will be created.",
      compilingDescription: "Compiling thread context into a runnable project.",
      help: "Help",
      cancel: "Cancel",
      next: "Next",
      back: "Back",
      generate: "Generate",
      checking: "Checking…",
      generating: "Generating…",
      done: "Done",
      openFolder: "Open folder",
      installUv: "Install uv",
      playgroundToCode: "Playground → code",
      takeAgentOut: "Take the agent out of the playground.",
      exportIntelligence:
        "Export the intelligence already assembled here into a project you can inspect, version, and run.",
      playgroundContext: "Playground context",
      runnableProject: "Runnable project",
      exportFormat: "Export format",
      chooseRuntime: "Choose the runtime that will receive this thread.",
      available: "1 available",
      giveHome: "Give your agent a home",
      chooseProjectHome: "Choose where the editable project will live.",
      parentDirectory: "Parent directory",
      projectName: "Project name",
      projectPath: "Project path",
      browse: "Browse",
      projectBlueprint: "Project blueprint",
      editablePythonProject: "A real, editable Python project",
      contextIncluded: "Thread context and PLAN.md included.",
      useMetaUserPrompt: "Use meta user prompt",
      unavailable: "Unavailable",
      suggestedOn: "Suggested on",
      suggestedOff: "Suggested off",
      metaPromptEnabled:
        "Reuse the first message as runtime context before every model call.",
      metaPromptUnavailable:
        "This thread has no first user message to use as runtime context.",
      building: "Building",
      buildStopped: "Build stopped",
      buildComplete: "Build complete",
      buildActivity: "Build activity",
      preparingBuild: "Preparing the build…",
      dependenciesMayTake:
        "Dependencies may take a moment to install on the first build.",
      nextSteps: "Next steps",
      agentReady: "Your agent is ready",
      copyCommand: "Copy command",
    },
  },
};

const PlaygroundLabelsContext = createContext<PlaygroundLabels | null>(null);

/** Supply localized playground chrome; omit to fall back to English. */
export function PlaygroundLabelsProvider({
  value,
  children,
}: {
  value: PlaygroundLabels;
  children: ReactNode;
}) {
  return (
    <PlaygroundLabelsContext.Provider value={value}>
      {children}
    </PlaygroundLabelsContext.Provider>
  );
}

export function usePlaygroundLabels(): PlaygroundLabels {
  const value = useContext(PlaygroundLabelsContext);
  if (!value) return DEFAULT_PLAYGROUND_LABELS;
  // Merge defaults so a host compiled against an earlier label schema (or a
  // hot-reloaded provider) cannot make newly-added chrome crash at runtime.
  return {
    ...DEFAULT_PLAYGROUND_LABELS,
    ...value,
    dialogs: {
      ...DEFAULT_PLAYGROUND_LABELS.dialogs,
      ...value.dialogs,
      confirmations: {
        ...DEFAULT_PLAYGROUND_LABELS.dialogs.confirmations,
        ...value.dialogs.confirmations,
      },
      images: {
        ...DEFAULT_PLAYGROUND_LABELS.dialogs.images,
        ...value.dialogs.images,
      },
      compaction: {
        ...DEFAULT_PLAYGROUND_LABELS.dialogs.compaction,
        ...value.dialogs.compaction,
      },
      stats: {
        ...DEFAULT_PLAYGROUND_LABELS.dialogs.stats,
        ...value.dialogs.stats,
      },
      builtIn: {
        ...DEFAULT_PLAYGROUND_LABELS.dialogs.builtIn,
        ...value.dialogs.builtIn,
      },
      mcp: { ...DEFAULT_PLAYGROUND_LABELS.dialogs.mcp, ...value.dialogs.mcp },
      plugins: {
        ...DEFAULT_PLAYGROUND_LABELS.dialogs.plugins,
        ...value.dialogs.plugins,
      },
      variables: {
        ...DEFAULT_PLAYGROUND_LABELS.dialogs.variables,
        ...value.dialogs.variables,
      },
      skills: {
        ...DEFAULT_PLAYGROUND_LABELS.dialogs.skills,
        ...value.dialogs.skills,
      },
      modelParams: {
        ...DEFAULT_PLAYGROUND_LABELS.dialogs.modelParams,
        ...value.dialogs.modelParams,
      },
      toolEditor: {
        ...DEFAULT_PLAYGROUND_LABELS.dialogs.toolEditor,
        ...value.dialogs.toolEditor,
      },
      sections: {
        ...DEFAULT_PLAYGROUND_LABELS.dialogs.sections,
        ...value.dialogs.sections,
      },
      toolCalls: {
        ...DEFAULT_PLAYGROUND_LABELS.dialogs.toolCalls,
        ...value.dialogs.toolCalls,
      },
      messages: {
        ...DEFAULT_PLAYGROUND_LABELS.dialogs.messages,
        ...value.dialogs.messages,
      },
      modelCard: {
        ...DEFAULT_PLAYGROUND_LABELS.dialogs.modelCard,
        ...value.dialogs.modelCard,
      },
      examples: {
        ...DEFAULT_PLAYGROUND_LABELS.dialogs.examples,
        ...value.dialogs.examples,
        labels: {
          ...DEFAULT_PLAYGROUND_LABELS.dialogs.examples.labels,
          ...value.dialogs.examples.labels,
        },
      },
      toolCallCard: {
        ...DEFAULT_PLAYGROUND_LABELS.dialogs.toolCallCard,
        ...value.dialogs.toolCallCard,
      },
      variablesPanel: {
        ...DEFAULT_PLAYGROUND_LABELS.dialogs.variablesPanel,
        ...value.dialogs.variablesPanel,
      },
      tooltips: {
        ...DEFAULT_PLAYGROUND_LABELS.dialogs.tooltips,
        ...value.dialogs.tooltips,
      },
      codegen: {
        ...DEFAULT_PLAYGROUND_LABELS.dialogs.codegen,
        ...value.dialogs.codegen,
      },
    },
  };
}
