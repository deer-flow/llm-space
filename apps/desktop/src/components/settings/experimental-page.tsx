"use client";

import { useState } from "react";

import { useCommands } from "@/commands";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useExperimental } from "@/components/experimental-provider";
import { Switch } from "@/components/ui/switch";

import { SettingsPage } from "./settings-page";

export function ExperimentalPage() {
  const { tracingEnabled, setTracingEnabled, reactScanEnabled, setReactScanEnabled } =
    useExperimental();
  const { executeCommand } = useCommands();
  const [reloadPromptOpen, setReloadPromptOpen] = useState(false);

  const handleReactScanChange = (next: boolean) => {
    setReactScanEnabled(next);
    // react-scan patches the reconciler at startup, so the change only lands
    // after a reload — offer to do it now.
    setReloadPromptOpen(true);
  };

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
      {import.meta.env.DEV ? (
        <div className="flex h-14 items-center justify-between gap-4">
          <span className="flex flex-col gap-0.5 text-sm">
            React Scan
            <span className="text-muted-foreground text-xs">
              Overlay that highlights component re-renders. Takes effect after a
              reload. Dev builds only.
            </span>
          </span>
          <Switch
            checked={reactScanEnabled}
            onCheckedChange={handleReactScanChange}
            aria-label="React Scan"
          />
        </div>
      ) : null}
      <ConfirmDialog
        open={reloadPromptOpen}
        onOpenChange={setReloadPromptOpen}
        dimBackground={false}
        title="Reload to apply?"
        description={`React Scan will be ${
          reactScanEnabled ? "enabled" : "disabled"
        } after the app reloads. Reload now?`}
        cancelLabel="Later"
        confirmLabel="Reload"
        confirmVariant="default"
        onConfirm={() => {
          setReloadPromptOpen(false);
          executeCommand({ type: "reload", args: {} });
        }}
      />
    </SettingsPage>
  );
}
