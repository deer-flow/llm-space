import { COMMAND_META, type CommandType } from "./commands";
import type { AppLanguage } from "./language";

/**
 * Chinese labels for every command. A complete `Record` (not `Partial`) makes
 * the compiler reject any new `CommandType` that ships without a translation,
 * mirroring how `COMMAND_META` forces an English label.
 */
const COMMAND_LABELS_ZH: Record<CommandType, string> = {
  newFile: "新建文件",
  newFileFromPromptExample: "从示例开始",
  openStartFromExample: "从示例新建…",
  newFolder: "新建文件夹",
  renameFile: "重命名",
  duplicateFile: "创建副本",
  deleteFile: "移到废纸篓",
  revealFile: "在 Finder 中显示",
  copyFile: "拷贝",
  refreshTree: "刷新",
  revealInTree: "在文件树中显示",
  importFiles: "从文件导入…",
  importFromClipboard: "从剪贴板导入",
  createTraceProject: "新建 Trace 项目",
  createConnectedTraceProject: "连接 Langfuse",
  importLangfuseTraceFiles: "导入 Langfuse 导出…",
  syncLangfuseTraceIds: "同步 Langfuse Trace",
  closeTab: "关闭标签页",
  closeOtherTabs: "关闭其他标签页",
  closeAllTabs: "关闭所有标签页",
  reopenClosedTab: "重新打开关闭的标签页",
  openThread: "打开 Thread",
  selectNextTab: "选择下一个标签页",
  selectPreviousTab: "选择上一个标签页",
  toggleSidebar: "切换侧边栏",
  openSettings: "设置",
  openModelSettings: "配置模型设置",
  openCommandPalette: "命令面板",
  openOnboard: "打开新手引导…",
  runThread: "运行 Thread",
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
  githubLogout: "退出 GitHub 登录",
  checkForUpdates: "检查更新…",
  applyUpdateAndRestart: "重启以更新",
};

/**
 * The localized Title-Case label for a command (command palette, context
 * menus, native menu). Dependency-free so the bun main process can use it.
 */
export function commandLabel(type: CommandType, lang: AppLanguage): string {
  return lang === "zh" ? COMMAND_LABELS_ZH[type] : COMMAND_META[type].label;
}

/**
 * Both localized labels for a command, for text matching that should hit in
 * either language (command palette search).
 */
export function commandLabels(type: CommandType): [string, string] {
  return [COMMAND_META[type].label, COMMAND_LABELS_ZH[type]];
}
