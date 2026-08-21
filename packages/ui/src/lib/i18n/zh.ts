import type { Messages } from "./messages";

/** Simplified Chinese mirror of the canonical English tree. */
export const zh: Messages = {
  common: {
    ok: "确定",
    cancel: "取消",
    close: "关闭",
    delete: "删除",
    add: "添加",
    retry: "重试",
    save: "保存",
    search: "搜索",
    copy: "复制",
    copied: "已复制",
    loading: "加载中…",
  },
  settings: {
    language: "语言",
    languageHint: "界面语言",
  },
  commands: {
    newFile: "新建文件",
    newFileFromPromptExample: "从示例开始",
    openStartFromExample: "从示例新建…",
    newFolder: "新建文件夹",
    renameFile: "重命名",
    duplicateFile: "复制副本",
    deleteFile: "移到废纸篓",
    revealFile: "在访达中显示",
    copyFile: "复制",
    refreshTree: "刷新",
    revealInTree: "在文件树中显示",
    importFiles: "从文件导入…",
    importFromClipboard: "从剪贴板导入",
    createTraceProject: "新建追踪项目",
    createConnectedTraceProject: "连接 Langfuse",
    importLangfuseTraceFiles: "导入 Langfuse 导出…",
    syncLangfuseTraceIds: "同步 Langfuse 追踪",
    closeTab: "关闭标签页",
    closeOtherTabs: "关闭其他标签页",
    closeAllTabs: "关闭全部标签页",
    reopenClosedTab: "重新打开已关闭的标签页",
    selectNextTab: "选择下一个标签页",
    selectPreviousTab: "选择上一个标签页",
    toggleSidebar: "切换侧边栏",
    openSettings: "设置",
    openModelSettings: "配置模型设置",
    openCommandPalette: "命令面板",
    openOnboard: "引导…",
    runThread: "运行会话",
    shareThread: "分享…",
    openVariables: "变量",
    zoomIn: "放大",
    zoomOut: "缩小",
    resetZoom: "重置缩放",
    reload: "重新加载",
    openLink: "打开链接",
    openDocument: "文档",
    reportBugs: "报告问题",
    openWorkspaceFolder: "打开工作区文件夹",
    githubLogin: "使用 GitHub 登录",
    githubLogout: "退出 GitHub",
    checkForUpdates: "检查更新…",
    applyUpdateAndRestart: "重启以更新",
  },
  menu: {
    app: {
      about: "关于 LLM Space",
      checkUpdates: "检查更新…",
      restartToUpdate: "重启以更新",
      settings: "设置…",
      quit: "退出 LLM Space",
    },
    file: {
      label: "文件",
      newFile: "新建文件",
      newFromExamples: "从示例新建…",
      newFolder: "新建文件夹",
      importFiles: "从文件导入…",
      importClipboard: "从剪贴板导入",
      share: "分享…",
      refreshWorkspace: "刷新工作区",
      revealWorkspace: "显示工作区文件夹",
      closeTab: "关闭标签页",
      closeOthers: "关闭其他标签页",
      closeAll: "关闭全部标签页",
      reopenClosed: "重新打开已关闭的标签页",
    },
    edit: {
      label: "编辑",
    },
    view: {
      label: "视图",
      commandPalette: "命令面板…",
      toggleSidebar: "切换侧边栏",
      reload: "重新加载",
      zoomIn: "放大",
      zoomOut: "缩小",
      resetZoom: "重置缩放",
    },
    window: {
      label: "窗口",
      selectPrevious: "选择上一个标签页",
      selectNext: "选择下一个标签页",
    },
    help: {
      label: "帮助",
      viewDocs: "查看文档",
      officialSite: "访问官方网站",
      github: "访问 GitHub 项目",
      harness101: "访问 Harness 101",
      reportBug: "报告问题",
      donate: "捐赠",
      onboard: "引导",
    },
  },
  reminders: {
    "jinja-templates": {
      eyebrow: "新功能",
      title: "在提示词中使用 Jinja 模板",
      description:
        "用真正的 Jinja 编写提示词——循环、条件判断和 {% for %}、{% if %}、{{ variable }} 等变量。" +
        "无需手工编辑文本，即可构建随数据自适应变化的动态、可复用提示词模板。",
    },
  },
  errors: {
    updatesUnsupportedPlatform: "此平台不支持更新。",
    updatesDownloadIncomplete: "下载未完成",
    sshBootstrapGeneric: "SSH 远程运行时引导失败（{stage} 阶段）：{label} 提前退出。",
    sshPortInUse:
      "远程运行时端口 {port} 已被占用。LLM Space 将改用其他按连接分配的端口重试，且不会停止现有监听进程。",
    sshMissingBinary:
      "远程运行时二进制文件缺失。{path} 在 SSH 服务器上不存在或不可执行。请检查远程安装目录、权限，以及运行时包是否安装在字面量 '~' 目录下。",
    sshNotExecutableBinary:
      "远程运行时二进制文件不可执行。{path} 在 SSH 服务器上不存在或不可执行。请检查远程安装目录、权限，以及运行时包是否安装在字面量 '~' 目录下。",
    sshAuthFailed: "SSH 认证失败。",
    sshAuthFailedFor: "SSH 认证失败：{target}。",
    sshAuthGuidance:
      "OpenSSH 无法使用配置的密钥、密码或口令完成认证。请检查 ~/.ssh/config、ssh-agent 以及系统的密码或口令提示，然后重试。",
    sshHostKeyFailed: "SSH 主机密钥验证失败。",
    sshHostKeyFailedFor: "SSH 主机密钥验证失败：{target}。",
    sshHostKeyImpactServerStart:
      "OpenSSH 报告该主机密钥已更改或不受信任，因此远程运行时命令未启动。",
    sshHostKeyImpactTunnelStart:
      "OpenSSH 报告该主机密钥已更改或不受信任，因此端口转发被禁用，LLM Space 未启动远程运行时。",
    sshHostKeyImpactOther:
      "OpenSSH 报告该主机密钥已更改或不受信任，因此 SSH 连接在 LLM Space 验证远程运行时之前已关闭。",
    sshHostKeyLocation: "请先确认主机身份，然后更新 {location}。",
    sshKnownHostsFallback: "您的 SSH known_hosts 文件",
    sshKnownHostsLine: "{knownHosts} 第 {line} 行",
    sshRemoveStaleEntry: "确认安全后，请删除过期的 known_hosts 条目并重新连接。",
    sshFirstConnectionFor:
      "如果是首次连接，请使用 LLM Space 的主机身份确认提示，或在终端中运行一次 ssh {target} 以查看并信任主机密钥，然后重新连接。",
    sshFirstConnection:
      "如果是首次连接，请使用 LLM Space 的主机身份确认提示，或在终端中运行一次 ssh 以查看并信任主机密钥，然后重新连接。",
    remotePortReportedInUse:
      "远程运行时报告端口 {port} 已被占用，但本次连接尝试的是端口 {attemptedPort}。",
    remotePortsExhausted:
      "尝试 {attempts} 次后仍未找到可用的按连接远程端口；现有监听进程未被停止。请重试连接，或配置其他远程服务器端口。",
    sshHealthCheckTimeout:
      "SSH 远程运行时引导在 health-check 阶段失败：{message}。预期协议 {version}。",
  },
};
