"use client";

import type { Thread } from "@llm-space/core";
import { useI18n } from "@llm-space/ui/lib/i18n";
import { Button } from "@llm-space/ui/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@llm-space/ui/ui/dialog";
import { Input } from "@llm-space/ui/ui/input";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import {
  listThreadStorages,
  readThreadStorage,
  resolveLatestThreadStorage,
  writeThreadStorage,
} from "@/client/plugins";

export function ThreadStorageDialog({
  mode,
  open,
  onOpenChange,
  getThread,
  onImported,
}: {
  mode: "save" | "import";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  getThread: () => Promise<Thread | null>;
  onImported: (thread: Thread) => Promise<void>;
}) {
  const { t } = useI18n();
  const [storages, setStorages] = useState<
    Awaited<ReturnType<typeof listThreadStorages>>
  >([]);
  const [storageId, setStorageId] = useState("");
  const [resourceId, setResourceId] = useState("");
  const [busy, setBusy] = useState(false);
  const available = useMemo(
    () =>
      storages.filter(
        (storage) => storage.capabilities[mode === "save" ? "write" : "read"]
      ),
    [mode, storages]
  );

  useEffect(() => {
    if (!open) return;
    void listThreadStorages()
      .then((items) => {
        setStorages(items);
        const filtered = items.filter(
          (storage) => storage.capabilities[mode === "save" ? "write" : "read"]
        );
        setStorageId((current) =>
          filtered.some((item) => item.id === current)
            ? current
            : (filtered[0]?.id ?? "")
        );
      })
      .catch(_showError);
  }, [mode, open, t]);

  const submit = async () => {
    if (!storageId) return;
    setBusy(true);
    try {
      if (mode === "save") {
        const thread = await getThread();
        if (!thread) throw new Error(t.desktop.threadStorage.openLocalThreadFirst);
        const locator = await writeThreadStorage(
          storageId,
          thread,
          resourceId.trim() || undefined
        );
        setResourceId(locator.id);
        toast.success(t.desktop.threadStorage.saved, {
          description: _locatorText(locator),
        });
      } else {
        if (!resourceId.trim())
          throw new Error(t.desktop.threadStorage.resourceIdRequired);
        const locator = await resolveLatestThreadStorage(
          storageId,
          resourceId.trim()
        );
        await onImported(await readThreadStorage(storageId, locator));
        toast.success(t.desktop.threadStorage.imported, {
          description: _locatorText(locator),
        });
        onOpenChange(false);
      }
    } catch (error) {
      _showError(error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {mode === "save"
              ? t.desktop.threadStorage.saveTo
              : t.desktop.threadStorage.importFrom}
          </DialogTitle>
        </DialogHeader>
        <label className="space-y-1 text-sm">
          <span>{t.desktop.threadStorage.title}</span>
          <select
            className="bg-background h-9 w-full rounded-md border px-3"
            value={storageId}
            onChange={(event) => setStorageId(event.target.value)}
          >
            {available.map((storage) => (
              <option key={storage.id} value={storage.id}>
                {storage.displayName}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span>
            {t.desktop.threadStorage.resourceIdLabel}{" "}
            {mode === "save" ? t.desktop.threadStorage.resourceIdOptional : ""}
          </span>
          <Input
            value={resourceId}
            onChange={(event) => setResourceId(event.target.value)}
            placeholder={t.desktop.threadStorage.resourceIdAria}
          />
        </label>
        {available.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            {t.desktop.threadStorage.noStorage}
          </p>
        ) : null}
        <Button disabled={busy || !storageId} onClick={() => void submit()}>
          {busy
            ? t.desktop.threadStorage.working
            : mode === "save"
              ? t.common.save
              : t.common.import}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

function _locatorText(locator: {
  id: string;
  filename?: string;
  version?: string;
}): string {
  return [locator.id, locator.filename, locator.version]
    .filter(Boolean)
    .join(" · ");
}

function _showError(error: unknown): void {
  toast.error(error instanceof Error ? error.message : String(error));
}
