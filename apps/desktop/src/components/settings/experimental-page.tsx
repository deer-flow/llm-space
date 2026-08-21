"use client";

import { ConfirmDialog } from "@llm-space/ui/components/confirm-dialog";
import { useI18n } from "@llm-space/ui/lib/i18n";
import { Separator } from "@llm-space/ui/ui/separator";
import { useState } from "react";

import { useCommands } from "@/commands";
import { useExperimental } from "@/components/experimental-provider";

import { SettingsPage } from "./settings-page";
import { SettingsToggleRow } from "./settings-toggle-row";

export function ExperimentalPage() {
  const { t } = useI18n();
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
      title={t.settings.dialog.tabs.experimental}
      description={t.settings.experimental.description}
      className="overflow-y-auto"
    >
      <div className="flex flex-col gap-6 pb-2">
        <SettingsToggleRow
          title={t.settings.experimental.tracing}
          hint={t.settings.experimental.tracingHint}
          checked={tracingEnabled}
          onCheckedChange={setTracingEnabled}
        />
        {import.meta.env.DEV ? (
          <>
            <Separator />
            <SettingsToggleRow
              title={t.settings.experimental.reactScan}
              hint={t.settings.experimental.reactScanHint}
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
        title={t.settings.experimental.reloadTitle}
        description={
          reactScanEnabled
            ? t.settings.experimental.reloadEnabled
            : t.settings.experimental.reloadDisabled
        }
        cancelLabel={t.common.later}
        confirmLabel={t.common.reload}
        confirmVariant="default"
        onConfirm={() => {
          setReloadPromptOpen(false);
          executeCommand({ type: "reload", args: {} });
        }}
      />
    </SettingsPage>
  );
}
