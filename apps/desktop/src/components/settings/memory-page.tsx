"use client";

import { ConfirmDialog } from "@llm-space/ui/components/confirm-dialog";
import { Button } from "@llm-space/ui/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@llm-space/ui/ui/dialog";
import { Input } from "@llm-space/ui/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@llm-space/ui/ui/select";
import { Textarea } from "@llm-space/ui/ui/textarea";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  Download,
  Eye,
  EyeOff,
  Loader2,
  Pencil,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { fsReveal } from "@/client/built-in-tools";
import {
  clearMemoryArchive,
  deleteMemory,
  exportMemories,
  listMemories,
  updateMemory,
} from "@/client/memory";
import { useI18n } from "@/i18n/i18n-provider";
import { formatMessage } from "@/i18n/messages";
import type { MemoryListResult, MemoryRecordView } from "@/shared/memory";

import { SettingsPage } from "./settings-page";

/** Rows are variable height; this only seeds the virtualizer's estimate. */
const ROW_ESTIMATE = 96;

function _projectLabel(origin: string | null): string {
  if (!origin) {
    return "—";
  }
  const normalized = origin.replace(/\/+$/, "");
  const parts = normalized.split("/");
  return parts[parts.length - 1] || normalized;
}

function _formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
}

export function MemoryPage() {
  const { t } = useI18n();
  const [data, setData] = useState<MemoryListResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [project, setProject] = useState("");
  // Privacy: contents stay masked until the reader opts in.
  const [revealAll, setRevealAll] = useState(false);
  const [revealedIds, setRevealedIds] = useState<string[]>([]);
  const [editing, setEditing] = useState<MemoryRecordView | null>(null);
  const [draftContent, setDraftContent] = useState("");
  const [draftTags, setDraftTags] = useState("");
  const [pendingDelete, setPendingDelete] = useState<MemoryRecordView | null>(
    null
  );
  const [confirmExport, setConfirmExport] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query), 200);
    return () => clearTimeout(timer);
  }, [query]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await listMemories({ query: debounced, project }));
    } catch {
      toast.error(t.memory.loadFailed);
    } finally {
      setLoading(false);
    }
  }, [debounced, project, t.memory.loadFailed]);

  useEffect(() => {
    void load();
  }, [load]);

  const memories = useMemo(() => data?.memories ?? [], [data]);

  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: memories.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_ESTIMATE,
    overscan: 8,
  });

  const isRevealed = useCallback(
    (id: string) => revealAll || revealedIds.includes(id),
    [revealAll, revealedIds]
  );

  async function _confirmDelete() {
    if (!pendingDelete) {
      return;
    }
    setBusy(true);
    try {
      const result = await deleteMemory(pendingDelete.id);
      if (!result.ok) {
        toast.error(t.memory.loadFailed);
        return;
      }
      toast.success(t.memory.deleted);
      setPendingDelete(null);
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function _saveEdit() {
    if (!editing) {
      return;
    }
    setBusy(true);
    try {
      const result = await updateMemory({
        id: editing.id,
        content: draftContent,
        tags: draftTags
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
      });
      if (!result.ok) {
        toast.error(t.memory.loadFailed);
        return;
      }
      toast.success(t.memory.updated);
      setEditing(null);
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function _runExport() {
    setConfirmExport(false);
    try {
      const { path, count } = await exportMemories();
      toast.success(formatMessage(t.memory.exported, { count: String(count) }));
      await fsReveal(path);
    } catch {
      toast.error(t.memory.loadFailed);
    }
  }

  async function _runClearArchive() {
    setConfirmArchive(false);
    try {
      const { removed } = await clearMemoryArchive();
      toast.success(
        formatMessage(t.memory.archiveCleared, { count: String(removed) })
      );
      await load();
    } catch {
      toast.error(t.memory.loadFailed);
    }
  }

  const usage = data
    ? formatMessage(t.memory.usage, {
        used: String(data.total),
        max: String(data.max),
      })
    : "";
  const archived = data
    ? formatMessage(t.memory.archived, { count: String(data.archiveCount) })
    : "";

  return (
    <SettingsPage title={t.memory.title} description={t.memory.description}>
      <div className="flex h-full min-h-0 flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            className="h-8 w-64"
            value={query}
            placeholder={t.memory.searchPlaceholder}
            onChange={(event) => setQuery(event.target.value)}
          />
          <Select
            value={project || "__all__"}
            onValueChange={(value) =>
              setProject(value === "__all__" ? "" : value)
            }
          >
            <SelectTrigger className="h-8 w-56">
              <SelectValue placeholder={t.memory.project} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">{t.memory.allProjects}</SelectItem>
              {(data?.projects ?? []).map((item) => (
                <SelectItem key={item} value={item}>
                  {_projectLabel(item)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex-1" />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setRevealAll((previous) => !previous);
              setRevealedIds([]);
            }}
          >
            {revealAll ? (
              <EyeOff className="size-4" />
            ) : (
              <Eye className="size-4" />
            )}
            {revealAll ? t.memory.hideContent : t.memory.showContent}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setConfirmExport(true)}
          >
            <Download className="size-4" />
            {t.memory.exportAction}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!data || data.archiveCount === 0}
            onClick={() => setConfirmArchive(true)}
          >
            <Trash2 className="size-4" />
            {t.memory.clearArchive}
          </Button>
        </div>

        <div className="text-muted-foreground flex items-center gap-3 text-xs">
          {loading ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <>
              <span>{usage}</span>
              <span>·</span>
              <span>{archived}</span>
            </>
          )}
        </div>

        <div
          ref={scrollRef}
          className="min-h-0 flex-1 overflow-y-auto rounded-md border"
        >
          {!loading && memories.length === 0 ? (
            <div className="text-muted-foreground p-6 text-sm">
              {data && data.total > 0 ? t.memory.noMatch : t.memory.empty}
            </div>
          ) : (
            <div
              className="relative w-full"
              style={{ height: virtualizer.getTotalSize() }}
            >
              {virtualizer.getVirtualItems().map((row) => {
                const memory = memories[row.index];
                if (!memory) {
                  return null;
                }
                const revealed = isRevealed(memory.id);
                return (
                  <div
                    key={memory.id}
                    className="absolute left-0 top-0 w-full border-b px-3 py-2"
                    style={{
                      height: row.size,
                      transform: "translateY(" + row.start + "px)",
                    }}
                  >
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <p
                          dir="auto"
                          className="text-sm break-words whitespace-pre-wrap"
                        >
                          {revealed ? memory.content : "• ".repeat(24).trim()}
                        </p>
                        <div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                          <span>{_projectLabel(memory.origin)}</span>
                          <span>{_formatDate(memory.createdAt)}</span>
                          {memory.tags.length > 0 ? (
                            <span>#{memory.tags.join(" #")}</span>
                          ) : null}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7"
                          title={revealed ? t.memory.hideContent : t.memory.showContent}
                          onClick={() =>
                            setRevealedIds((previous) =>
                              previous.includes(memory.id)
                                ? previous.filter((id) => id !== memory.id)
                                : [...previous, memory.id]
                            )
                          }
                        >
                          {revealed ? (
                            <EyeOff className="size-3.5" />
                          ) : (
                            <Eye className="size-3.5" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7"
                          title={t.memory.edit}
                          onClick={() => {
                            setEditing(memory);
                            setDraftContent(memory.content);
                            setDraftTags(memory.tags.join(", "));
                          }}
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7"
                          title={t.memory.delete}
                          onClick={() => setPendingDelete(memory)}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <Dialog
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t.memory.editTitle}</DialogTitle>
          </DialogHeader>
          <Textarea
            dir="auto"
            className="min-h-32"
            value={draftContent}
            onChange={(event) => setDraftContent(event.target.value)}
          />
          <Input
            value={draftTags}
            placeholder={t.memory.project}
            onChange={(event) => setDraftTags(event.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              {t.confirm.cancel}
            </Button>
            <Button disabled={busy} onClick={() => void _saveEdit()}>
              {t.memory.save}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title={t.memory.deleteTitle}
        description={t.memory.deleteDescription}
        confirmLabel={t.confirm.delete}
        cancelLabel={t.confirm.cancel}
        onConfirm={() => void _confirmDelete()}
      />

      <ConfirmDialog
        open={confirmExport}
        onOpenChange={setConfirmExport}
        title={t.memory.exportTitle}
        description={t.memory.exportDescription}
        confirmLabel={t.memory.exportAction}
        cancelLabel={t.confirm.cancel}
        confirmVariant="default"
        onConfirm={() => void _runExport()}
      />

      <ConfirmDialog
        open={confirmArchive}
        onOpenChange={setConfirmArchive}
        title={t.memory.clearArchiveTitle}
        description={t.memory.clearArchiveDescription}
        confirmLabel={t.memory.clearArchive}
        cancelLabel={t.confirm.cancel}
        onConfirm={() => void _runClearArchive()}
      />
    </SettingsPage>
  );
}
