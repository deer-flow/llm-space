import type { PlaygroundLabels } from "@llm-space/ui/components/thread-playground/playground-labels";

import type { AppLanguage } from "@/shared/language";

/**
 * Localized values for the shared Thread Playground's header chrome (see
 * `packages/ui/.../playground-labels.tsx` for the schema and the boundary:
 * presentation-layer strings only). The desktop app injects the active
 * language's value through `PlaygroundLabelsProvider` in the app layout;
 * `messages.ts` stays dependency-free because the bun main process reads it.
 */
export const PLAYGROUND_LABELS: Record<AppLanguage, PlaygroundLabels> = {
  en: {
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
  },
  zh: {
    moreActions: "更多操作",
    viewRunHistory: "查看运行历史",
    hideRunHistory: "隐藏运行历史",
    compactConversation: "压缩对话",
    generateProject: "生成项目",
    betaBadge: "Beta",
    shareThread: "分享 Thread",
    undoLastEdit: "撤销上次编辑",
    redoLastEdit: "重做上次编辑",
    runThreadTooltip: "运行此 Thread",
    stopRunningTooltip: "停止运行",
    preparingThreadTooltip: "正在准备 Thread",
    runLabel: "运行",
    stopLabel: "停止",
    preparingLabel: "准备中",
    runThreadAria: "运行 Thread",
    stopRunningThreadAria: "停止运行中的 Thread",
    preparingThreadAria: "正在准备 Thread",
    runSettings: "运行设置",
    enableReActLoop: "启用 ReAct 循环",
    autoRunTools: "自动运行工具",
  },
};
