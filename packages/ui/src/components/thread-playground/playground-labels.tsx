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
 * descriptions, system prompts, generated code, and thread content — are
 * deliberately not part of this type and must not be localized.
 */
export interface PlaygroundLabels {
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
}

export const DEFAULT_PLAYGROUND_LABELS: PlaygroundLabels = {
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
  return useContext(PlaygroundLabelsContext) ?? DEFAULT_PLAYGROUND_LABELS;
}
