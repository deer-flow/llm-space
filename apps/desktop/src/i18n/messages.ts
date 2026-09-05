import type { AppLanguage } from "../shared/language";

/**
 * Every localized string of the app UI, keyed by language. `en` is the
 * canonical schema; `zh` must mirror its shape exactly (enforced by a unit
 * test and by the `AppMessages` type). Plain data on purpose — no React — so
 * the bun main process (native menu) reads the same tree.
 *
 * Coverage note: this tree currently carries the settings dialog chrome, the
 * General / Account / Network / Experimental pages, the command palette,
 * command labels, and the native menu. Larger pages (Models, MCP, Plugins,
 * Skills, Remote Servers) and the thread playground still hold their English
 * strings inline and will migrate tree-by-tree in follow-ups.
 */
const APP_MESSAGES = {
  en: {
    common: {
      pleaseTryAgain: "Please try again.",
    },
    /** Extra menu-only labels; command labels come from `commandLabel()`. */
    menu: {
      about: "About LLM Space",
      quit: "Quit LLM Space",
      settings: "Settings...",
      file: "File",
      edit: "Edit",
      view: "View",
      window: "Window",
      help: "Help",
      newFromExamples: "New from Examples...",
      share: "Share...",
      refreshWorkspace: "Refresh Workspace",
      revealWorkspaceFolder: "Reveal Workspace Folder",
      closeOthers: "Close Others",
      reopenClosedTabs: "Reopen Closed Tabs",
      commandPalette: "Command Palette...",
      viewDocumentation: "View Documentation",
      visitOfficialWebsite: "Visit Official Website",
      visitGitHubProject: "Visit GitHub Project",
      visitHarness101: "Visit Harness 101",
      reportBug: "Report Bug",
      donate: "Donate",
      onboard: "Onboard",
    },
    settingsDialog: {
      title: "Settings",
      groups: {
        app: "App",
        agent: "Agent",
        connections: "Connections",
      },
      pages: {
        general: "General",
        account: "Account",
        models: "Models",
        skills: "Skills",
        mcp: "MCP Servers",
        search: "Web Search",
        plugins: "Plugins",
        remote: "Remote Servers",
        network: "Network",
        experimental: "Experimental",
      },
    },
    general: {
      title: "General",
      description: "Customize appearance, defaults, privacy, and updates.",
      appearance: "Appearance",
      language: "Language",
      languageHint: "The language used for the app UI.",
      theme: "Theme",
      themeHint: "Match your system setting, or force light or dark.",
      themeLight: "Light",
      themeDark: "Dark",
      themeSystem: "System",
      primaryColor: "Primary color",
      primaryColorHint:
        "The accent color for buttons, links, and highlights.",
      reset: "Reset",
      rendering: "Rendering",
      renderingHint:
        "Full renders messages with full editors. Fast shows them as plain text for smoother scrolling on large threads.",
      renderingFull: "Full",
      renderingFast: "Fast",
      defaults: "Defaults",
      defaultModel: "Default model",
      defaultModelHint:
        "Used for new threads, and when a thread's model is no longer available.",
      defaultModelAutomatic: "Automatic",
      defaultModelAria: "Default model",
      dataPrivacy: "Data & privacy",
      workspaceFolder: "Workspace folder",
      workspaceFolderHint: "Where your threads are stored on disk.",
      analytics: {
        title: "Share anonymous usage analytics",
        hint: "Helps improve the app. Only anonymous actions are sent - never your prompts, messages, or API keys.",
        disabledHint:
          "Telemetry is turned off in this build or environment. Nothing is sent.",
        failed: "Failed to update analytics setting",
      },
      updates: "Updates",
      softwareUpdates: "Software updates",
      softwareUpdatesHint:
        "Automatic downloads updates in the background and prompts you to restart.",
      softwareUpdatesAria: "Software updates",
      automatic: "Automatic",
      checkManually: "Check manually",
      off: "Off",
      checkNow: "Check now",
    },
    account: {
      title: "Account",
      description:
        "Publish polished, shareable versions of your threads with GitHub.",
      waitingForGitHub: "Waiting for GitHub",
      finishAuthorization:
        "Finish authorization in your browser to connect LLM Space.",
      cancelSignIn: "Cancel sign-in",
      connectedWithGitHub: "Connected with GitHub",
      publishWithGitHub: "Publish with GitHub",
      heroTitleLine1: "Share the thread,",
      heroTitleLine2: "not a screenshot.",
      heroBody:
        "Turn any LLM Space thread into a read-only web page your team can open, review, and bring back into their own workspace.",
      signOut: "Sign out",
      readyToShare: "Ready to share from any thread.",
      signInWithGitHub: "Sign in with GitHub",
      secureDeviceSignIn:
        "Secure device sign-in. LLM Space never sees your password.",
      benefitOpenAnywhere: "Open anywhere",
      benefitOpenAnywhereBody:
        "Recipients only need the link—no GitHub account required.",
      benefitBringItBack: "Bring it back",
      benefitBringItBackBody:
        "Import the full thread into LLM Space with one click.",
      benefitUnlisted: "Unlisted by default",
      benefitUnlistedBody:
        "Shared as a secret Gist, outside public search.",
      privacyNoteTitle: "You decide what leaves your machine.",
      privacyNoteBody:
        "Nothing is published until you choose Share. Secret links are unlisted, not private—avoid sharing sensitive threads.",
      shareThreadPreview: "Share thread",
      runPreview: "Run",
      lookTopRight: "Look in the top-right corner of any thread.",
      researchThreadPreview: "Research thread",
      readOnlyWebPreview: "Read-only · Web",
    },
    network: {
      title: "Network",
      description:
        "Configure proxy settings for model requests and local network calls.",
      enableProxy: "Enable proxy",
      enableProxyHint:
        "Connect through a proxy for model requests and other network calls.",
      useSystemProxy: "Use system proxy",
      httpProxy: "HTTP Proxy",
      httpsProxy: "HTTPS Proxy",
      bypassList: "Bypass list",
      bypassListHint: "Comma-separated hosts that bypass the proxy.",
      bypassListAria: "Bypass list",
      onlyHttpHttpsPrefix: "Only ",
      onlyHttpHttpsMiddle: " and ",
      onlyHttpHttpsSuffix: " proxies are supported.",
      socksNotSupported:
        "A SOCKS proxy is set in System Settings, but SOCKS is not supported.",
      noSystemProxy: "No system proxy detected.",
      detectedPrefix: "Detected: ",
      detectedSuffix: " (System Settings)",
      failedToSave: "Failed to save network settings",
    },
    experimental: {
      title: "Experimental",
      description:
        "Configure preview features that are still under development.",
      tracing: "Tracing",
      tracingHint:
        "Enable to connect Langfuse or create a manual project for JSON exports.",
      reactScan: "React Scan",
      reactScanHint:
        "Highlight component re-renders after a reload. Dev builds only.",
      reloadToApply: "Reload to apply?",
      reloadDescription:
        "React Scan will be {state} after the app reloads. Reload now?",
      reactScanEnabled: "enabled",
      reactScanDisabled: "disabled",
      later: "Later",
      reload: "Reload",
    },
    apiKeyField: {
      getKey: "Get API key",
      showAria: "Show {label}",
      hideAria: "Hide {label}",
    },
    palette: {
      placeholder: "Search commands or enter arguments...",
      empty: "No commands found.",
      saveTo: "Save to…",
      importFrom: "Import from…",
    },
  },
  zh: {
    common: {
      pleaseTryAgain: "请重试。",
    },
    menu: {
      about: "关于 LLM Space",
      quit: "退出 LLM Space",
      settings: "设置…",
      file: "文件",
      edit: "编辑",
      view: "显示",
      window: "窗口",
      help: "帮助",
      newFromExamples: "从示例新建…",
      share: "分享…",
      refreshWorkspace: "刷新工作区",
      revealWorkspaceFolder: "在 Finder 中显示工作区",
      closeOthers: "关闭其他标签页",
      reopenClosedTabs: "重新打开关闭的标签页",
      commandPalette: "命令面板…",
      viewDocumentation: "查看文档",
      visitOfficialWebsite: "访问官方网站",
      visitGitHubProject: "访问 GitHub 项目",
      visitHarness101: "访问 Harness 101",
      reportBug: "报告问题",
      donate: "捐赠",
      onboard: "新手引导",
    },
    settingsDialog: {
      title: "设置",
      groups: {
        app: "应用",
        agent: "Agent",
        connections: "连接",
      },
      pages: {
        general: "通用",
        account: "账户",
        models: "模型",
        skills: "技能",
        mcp: "MCP 服务器",
        search: "网络搜索",
        plugins: "插件",
        remote: "远程服务器",
        network: "网络",
        experimental: "实验性",
      },
    },
    general: {
      title: "通用",
      description: "自定义外观、默认行为、隐私与更新。",
      appearance: "外观",
      language: "语言",
      languageHint: "应用界面所使用的语言。",
      theme: "主题",
      themeHint: "跟随系统设置，或强制浅色/深色。",
      themeLight: "浅色",
      themeDark: "深色",
      themeSystem: "跟随系统",
      primaryColor: "主题色",
      primaryColorHint: "按钮、链接和高亮所使用的强调色。",
      reset: "重置",
      rendering: "渲染",
      renderingHint:
        "“完整”使用完整编辑器渲染消息；“流畅”以纯文本显示，大 Thread 滚动更顺畅。",
      renderingFull: "完整",
      renderingFast: "流畅",
      defaults: "默认值",
      defaultModel: "默认模型",
      defaultModelHint: "用于新建 Thread，以及 Thread 原有模型不可用时。",
      defaultModelAutomatic: "自动",
      defaultModelAria: "默认模型",
      dataPrivacy: "数据与隐私",
      workspaceFolder: "工作区文件夹",
      workspaceFolderHint: "Thread 在磁盘上的存储位置。",
      analytics: {
        title: "分享匿名使用统计",
        hint: "帮助我们改进应用。只发送匿名操作——绝不会发送你的提示词、消息或 API Key。",
        disabledHint: "此构建或环境已关闭遥测。不会发送任何数据。",
        failed: "更新分析设置失败",
      },
      updates: "更新",
      softwareUpdates: "软件更新",
      softwareUpdatesHint: "自动在后台下载更新，并提示你重启。",
      softwareUpdatesAria: "软件更新",
      automatic: "自动",
      checkManually: "手动检查",
      off: "关闭",
      checkNow: "立即检查",
    },
    account: {
      title: "账户",
      description: "使用 GitHub 发布精致、可分享的 Thread 版本。",
      waitingForGitHub: "等待 GitHub",
      finishAuthorization: "在浏览器中完成授权以连接 LLM Space。",
      cancelSignIn: "取消登录",
      connectedWithGitHub: "已连接 GitHub",
      publishWithGitHub: "通过 GitHub 发布",
      heroTitleLine1: "分享的是 Thread，",
      heroTitleLine2: "而不是截图。",
      heroBody:
        "把任意 LLM Space Thread 变成团队可以打开、审阅并导入自己工作区的只读网页。",
      signOut: "退出登录",
      readyToShare: "随时可以从任意 Thread 分享。",
      signInWithGitHub: "使用 GitHub 登录",
      secureDeviceSignIn: "安全的设备登录。LLM Space 永远不会看到你的密码。",
      benefitOpenAnywhere: "随处打开",
      benefitOpenAnywhereBody: "只需链接即可打开，无需 GitHub 账号。",
      benefitBringItBack: "一键取回",
      benefitBringItBackBody: "一键将完整 Thread 导入 LLM Space。",
      benefitUnlisted: "默认不公开",
      benefitUnlistedBody: "通过私密 Gist 分享，不会出现在公开搜索中。",
      privacyNoteTitle: "由你决定什么离开你的设备。",
      privacyNoteBody:
        "在你选择分享之前，不会发布任何内容。私密链接不公开也不加密——请避免分享敏感 Thread。",
      shareThreadPreview: "分享 Thread",
      runPreview: "运行",
      lookTopRight: "在任意 Thread 的右上角即可找到。",
      researchThreadPreview: "研究 Thread",
      readOnlyWebPreview: "只读 · 网页",
    },
    network: {
      title: "网络",
      description: "为模型请求和本地网络调用配置代理。",
      enableProxy: "启用代理",
      enableProxyHint: "模型请求和其他网络调用通过代理连接。",
      useSystemProxy: "使用系统代理",
      httpProxy: "HTTP 代理",
      httpsProxy: "HTTPS 代理",
      bypassList: "例外列表",
      bypassListHint: "逗号分隔的主机列表，这些主机不走代理。",
      bypassListAria: "例外列表",
      onlyHttpHttpsPrefix: "仅支持 ",
      onlyHttpHttpsMiddle: " 和 ",
      onlyHttpHttpsSuffix: " 代理。",
      socksNotSupported: "系统设置中配置了 SOCKS 代理，但不支持 SOCKS。",
      noSystemProxy: "未检测到系统代理。",
      detectedPrefix: "检测到：",
      detectedSuffix: "（系统设置）",
      failedToSave: "保存网络设置失败",
    },
    experimental: {
      title: "实验性",
      description: "配置仍在开发中的预览功能。",
      tracing: "Tracing",
      tracingHint: "启用后可连接 Langfuse，或创建用于 JSON 导出的手动项目。",
      reactScan: "React Scan",
      reactScanHint: "重新加载后高亮组件重渲染。仅限开发版。",
      reloadToApply: "重新加载以生效？",
      reloadDescription: "应用重新加载后，React Scan 将被{state}。现在重新加载吗？",
      reactScanEnabled: "启用",
      reactScanDisabled: "停用",
      later: "稍后",
      reload: "重新加载",
    },
    apiKeyField: {
      getKey: "获取 API Key",
      showAria: "显示 {label}",
      hideAria: "隐藏 {label}",
    },
    palette: {
      placeholder: "搜索命令或输入参数…",
      empty: "未找到命令。",
      saveTo: "保存到…",
      importFrom: "从…导入",
    },
  },
};

// Not `as const` (mirroring the landing i18n): widened string types let both
// locales share one shape, with `en` as the canonical schema.
export type AppMessages = (typeof APP_MESSAGES)["en"];

/** The full message tree, keyed by language. */
export const MESSAGES: Record<AppLanguage, AppMessages> = APP_MESSAGES;

/**
 * Substitute `{name}` placeholders in a message-tree string. Kept tiny on
 * purpose — only a handful of strings need interpolation.
 */
export function formatMessage(
  template: string,
  vars: Record<string, string | number>
): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match
  );
}
