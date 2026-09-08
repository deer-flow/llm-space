"use client";

import { Button } from "@llm-space/ui/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@llm-space/ui/ui/dialog";
import {
  CheckIcon,
  CopyIcon,
  ExternalLinkIcon,
  Loader2Icon,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import {
  deployToVercel,
  getVercelStatus,
  vercelPreflight,
} from "@/client/vercel";
import { useCommands } from "@/commands";
import { useI18n } from "@/i18n/i18n-provider";
import { formatMessage } from "@/i18n/messages";
import type { RuntimeId } from "@/shared/runtime";

type DeployPhase = "idle" | "deploying" | "success" | "failed";

type Preflight =
  | { status: "checking" }
  | { status: "ok"; fileCount: number; totalBytes: number }
  | { status: "failed"; error: string };

/** Human-readable byte size for the preflight summary. */
function _formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * "Deploy to Vercel" dialog: runs a bun-side preflight when opened (so an
 * undeployable folder is caught before the user commits), warns about the
 * public URL, dispatches the deployment, and surfaces the resulting link (or
 * a friendly error). Token configuration is delegated to Settings → Account.
 */
export function DeployVercelDialog({
  open,
  onOpenChange,
  path,
  runtimeId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Workspace-relative folder to deploy. */
  path: string;
  runtimeId: RuntimeId;
}) {
  const { t } = useI18n();
  const { executeCommand } = useCommands();
  const [phase, setPhase] = useState<DeployPhase>("idle");
  const [tokenConfigured, setTokenConfigured] = useState<boolean | null>(null);
  const [preflight, setPreflight] = useState<Preflight | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }
    setPhase("idle");
    setUrl(null);
    setError(null);
    setCopied(false);
    setPreflight({ status: "checking" });
    let cancelled = false;
    void getVercelStatus()
      .then((status) => {
        if (!cancelled) setTokenConfigured(status.configured);
      })
      .catch(() => {
        if (!cancelled) setTokenConfigured(false);
      });
    void vercelPreflight(runtimeId, path)
      .then((result) => {
        if (cancelled) return;
        setPreflight(
          result.ok
            ? {
                status: "ok",
                fileCount: result.fileCount,
                totalBytes: result.totalBytes,
              }
            : { status: "failed", error: result.error }
        );
      })
      .catch((err) => {
        if (!cancelled) {
          setPreflight({
            status: "failed",
            error: err instanceof Error ? err.message : String(err),
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open, path, runtimeId]);

  const handleDeploy = useCallback(async () => {
    setPhase("deploying");
    setError(null);
    try {
      const result = await deployToVercel(runtimeId, path);
      if (result.ok) {
        setUrl(result.url);
        setPhase("success");
      } else {
        setError(result.error);
        setPhase("failed");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase("failed");
    }
  }, [path, runtimeId]);

  const handleCopy = useCallback(() => {
    if (!url) {
      return;
    }
    navigator.clipboard
      ?.writeText(url)
      .then(() => setCopied(true))
      .catch(() => {
        /* clipboard unavailable — ignore */
      });
  }, [url]);

  useEffect(() => {
    if (!copied) {
      return;
    }
    const id = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(id);
  }, [copied]);

  const openAccountSettings = useCallback(() => {
    onOpenChange(false);
    executeCommand({ type: "openSettings", args: { tab: "account" } });
  }, [executeCommand, onOpenChange]);

  const folderName = path.split("/").filter(Boolean).at(-1) ?? path;
  const preflightOk = preflight?.status === "ok";
  const preflightFailed = preflight?.status === "failed";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t.vercel.dialogTitle}</DialogTitle>
          <DialogDescription className="flex items-center gap-1.5">
            <span className="text-muted-foreground">
              {t.vercel.folderLabel}:
            </span>
            <span className="text-foreground truncate font-mono">
              {folderName}
            </span>
          </DialogDescription>
        </DialogHeader>

        {phase === "success" && url ? (
          <div className="flex flex-col gap-3">
            <p className="text-foreground flex items-center gap-2 text-sm font-medium">
              <CheckIcon className="size-4 text-emerald-500" />
              {t.vercel.successTitle}
            </p>
            <div className="border-border/60 bg-background/60 flex items-center gap-2 rounded-lg border px-3 py-2">
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                className="text-primary min-w-0 flex-1 truncate font-mono text-xs underline underline-offset-2"
              >
                {url}
              </a>
              <Button
                size="icon-xs"
                variant="ghost"
                aria-label={t.vercel.copyUrl}
                onClick={handleCopy}
              >
                {copied ? (
                  <CheckIcon className="size-3.5 text-emerald-500" />
                ) : (
                  <CopyIcon className="size-3.5" />
                )}
              </Button>
            </div>
          </div>
        ) : phase === "failed" ? (
          <div className="flex flex-col gap-2">
            <p className="text-destructive text-sm font-medium">
              {t.vercel.failedTitle}
            </p>
            <p className="text-muted-foreground text-xs break-words">{error}</p>
          </div>
        ) : phase === "deploying" ? (
          <div className="text-muted-foreground flex items-center gap-2 text-sm">
            <Loader2Icon className="size-4 animate-spin" />
            {t.vercel.deploying}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-muted-foreground text-xs/relaxed">
              {t.vercel.publicWarning}
            </p>
            {preflight?.status === "checking" ? (
              <p className="text-muted-foreground flex items-center gap-2 text-xs">
                <Loader2Icon className="size-3.5 animate-spin" />
                {t.vercel.checking}
              </p>
            ) : preflightFailed ? (
              <div className="flex flex-col gap-1 rounded-lg border border-amber-400/30 bg-amber-400/5 px-3 py-2">
                <p className="text-foreground/80 text-xs font-medium">
                  {t.vercel.preflightFailed}
                </p>
                <p className="text-muted-foreground text-xs break-words">
                  {preflight.error}
                </p>
              </div>
            ) : preflightOk ? (
              <p className="text-muted-foreground text-xs">
                {formatMessage(t.vercel.filesSummary, {
                  count: preflight.fileCount,
                  size: _formatBytes(preflight.totalBytes),
                })}
              </p>
            ) : null}
            {tokenConfigured === false ? (
              <div className="flex flex-col gap-2 rounded-lg border border-amber-400/30 bg-amber-400/5 px-3 py-2">
                <p className="text-foreground/80 text-xs">
                  {t.vercel.tokenMissingHint}
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={openAccountSettings}
                >
                  {t.vercel.configureToken}
                </Button>
              </div>
            ) : null}
          </div>
        )}

        <DialogFooter>
          {phase === "success" && url ? (
            <>
              <Button variant="ghost" onClick={handleCopy}>
                {copied ? t.vercel.copied : t.vercel.copyUrl}
              </Button>
              <Button
                onClick={() => {
                  executeCommand({ type: "openLink", args: { url } });
                  onOpenChange(false);
                }}
              >
                <ExternalLinkIcon className="size-4" />
                {t.vercel.openInBrowser}
              </Button>
            </>
          ) : phase === "failed" ? (
            <Button onClick={() => void handleDeploy()}>
              {t.vercel.retry}
            </Button>
          ) : phase === "deploying" ? null : (
            <Button
              disabled={tokenConfigured !== true || !preflightOk}
              onClick={() => void handleDeploy()}
            >
              {t.vercel.deploy}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
