"use client";

import { useExperimental } from "@/components/experimental-provider";
import { Switch } from "@/components/ui/switch";

import { SettingsPage } from "./settings-page";

export function ExperimentalPage() {
  const { tracingEnabled, setTracingEnabled } = useExperimental();
  return (
    <SettingsPage title="Experimental">
      <div className="flex h-14 items-center justify-between gap-4">
        <span className="flex flex-col gap-0.5 text-sm">
          Tracing
          <span className="text-muted-foreground text-xs">
            Enable to connect Langfuse or create a manual project for JSON
            exports.
          </span>
        </span>
        <Switch
          checked={tracingEnabled}
          onCheckedChange={setTracingEnabled}
          aria-label="Tracing"
        />
      </div>
    </SettingsPage>
  );
}
