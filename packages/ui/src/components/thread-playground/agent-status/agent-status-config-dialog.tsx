"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@llm-space/ui/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@llm-space/ui/ui/select";
import { Switch } from "@llm-space/ui/ui/switch";

import { useThreadStore, useThreadStoreActions } from "../stores/thread-store";

import {
  AGENT_STATUS_COMPONENT_OPTIONS,
  AGENT_STATUS_TIME_PRESETS,
  selectAgentStatusComponents,
} from "./agent-status-options";

export function AgentStatusConfigDialog({
  open,
  onOpenChange,
  readonly,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  readonly?: boolean;
}) {
  const components = useThreadStore(selectAgentStatusComponents);
  const simulatedTimeOffsetMs = useThreadStore(
    (state) => state.thread.context?.agentStatus?.simulatedTimeOffsetMs ?? 0
  );
  const status = useThreadStore((state) => state.status);
  const { setAgentStatusComponent, setAgentStatusTimeOffset } =
    useThreadStoreActions();
  const disabled = readonly || status !== "idle";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(640px,calc(100vw-2rem))] max-w-none! gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b px-4 py-3">
          <DialogTitle>配置 Agent Status</DialogTitle>
          <DialogDescription>
            选择本线程需要的状态能力；配置会随线程一起保存。
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[min(600px,calc(100vh-8rem))] overflow-y-auto px-4">
          {AGENT_STATUS_COMPONENT_OPTIONS.map((option) => {
            const enabled = components.includes(option.id);
            const Icon = option.icon;
            const switchId = "agent-status-" + option.id;
            return (
              <div
                key={option.id}
                className="grid grid-cols-[auto_1fr_auto] gap-x-3 border-b py-4 last:border-b-0"
              >
                <Icon className="text-muted-foreground mt-0.5 size-4" />
                <div className="min-w-0">
                  <label htmlFor={switchId} className="text-sm font-medium">
                    {option.label}
                  </label>
                  <p className="text-muted-foreground mt-1 text-xs">
                    {option.description}
                  </p>
                  {option.id === "timestamps" && enabled ? (
                    <div className="mt-3 flex items-center gap-3">
                      <span className="text-muted-foreground text-xs">
                        时间模拟
                      </span>
                      <Select
                        value={String(simulatedTimeOffsetMs)}
                        disabled={disabled}
                        onValueChange={(value) =>
                          setAgentStatusTimeOffset(Number(value))
                        }
                      >
                        <SelectTrigger
                          size="sm"
                          aria-label="选择 Agent 时间模拟"
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {AGENT_STATUS_TIME_PRESETS.map((preset) => (
                            <SelectItem
                              key={preset.offsetMs}
                              value={String(preset.offsetMs)}
                            >
                              {preset.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : null}
                </div>
                <Switch
                  id={switchId}
                  checked={enabled}
                  disabled={disabled}
                  aria-label={(enabled ? "关闭" : "启用") + option.label}
                  onCheckedChange={(checked) =>
                    setAgentStatusComponent(option.id, checked)
                  }
                />
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
