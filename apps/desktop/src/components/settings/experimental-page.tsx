"use client";

import { ConfirmDialog } from "@llm-space/ui/components/confirm-dialog";
import { Separator } from "@llm-space/ui/ui/separator";
import { useState } from "react";

import { useCommands } from "@/commands";
import { useExperimental } from "@/components/experimental-provider";

import { SettingsPage } from "./settings-page";
import { SettingsToggleRow } from "./settings-toggle-row";

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
    <SettingsPage
      title="Experimental"
      description="Configure preview features that are still under development."
      className="overflow-y-auto"
    >
      <div className="flex flex-col gap-6 pb-2">
        <SettingsToggleRow
          title="Tracing"
          hint="Enable to connect Langfuse or create a manual project for JSON exports."
          checked={tracingEnabled}
          onCheckedChange={setTracingEnabled}
        />
        {import.meta.env.DEV ? (
          <>
            <Separator />
            <SettingsToggleRow
              title="React Scan"
              hint="Highlight component re-renders after a reload. Dev builds only."
              checked={reactScanEnabled}
              onCheckedChange={handleReactScanChange}
            />
          </>
        ) : null}
      </div>
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
