"use client";

import { ConfirmDialog } from "@llm-space/ui/components/confirm-dialog";
import { Separator } from "@llm-space/ui/ui/separator";
import { useState } from "react";

import { useCommands } from "@/commands";
import { useExperimental } from "@/components/experimental-provider";
import { useI18n } from "@/i18n/i18n-provider";
import { formatMessage } from "@/i18n/messages";

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
      title={t.experimental.title}
      description={t.experimental.description}
      className="overflow-y-auto"
    >
      <div className="flex flex-col gap-6 pb-2">
        <SettingsToggleRow
          title={t.experimental.tracing}
          hint={t.experimental.tracingHint}
          checked={tracingEnabled}
          onCheckedChange={setTracingEnabled}
        />
        {import.meta.env.DEV ? (
          <>
            <Separator />
            <SettingsToggleRow
              title={t.experimental.reactScan}
              hint={t.experimental.reactScanHint}
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
        title={t.experimental.reloadToApply}
        description={formatMessage(t.experimental.reloadDescription, {
          state: reactScanEnabled
            ? t.experimental.reactScanEnabled
            : t.experimental.reactScanDisabled,
        })}
        cancelLabel={t.experimental.later}
        confirmLabel={t.experimental.reload}
        confirmVariant="default"
        onConfirm={() => {
          setReloadPromptOpen(false);
          executeCommand({ type: "reload", args: {} });
        }}
      />
    </SettingsPage>
  );
}
