"use client";

import { ConfirmDialog } from "@llm-space/ui/components/confirm-dialog";
import { threadTitleFromPath } from "@llm-space/ui/lib/thread-file";
import { Button } from "@llm-space/ui/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import {
  CheckIcon,
  CopyIcon,
  ExternalLinkIcon,
  Loader2Icon,
  TriangleAlertIcon,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { readShareThread, shareThread } from "@/client/share";
import { useCommands } from "@/commands";
import { useGithubAuth } from "@/components/github-auth-provider";
import { GitHubIcon } from "@/components/github-icon";
import type { RuntimeId } from "@/shared/runtime";

import {
  ShareThreadDialogFlow,
  type ShareThreadTransaction,
} from "./share-thread-dialog-flow";

type ShareStatus = "idle" | "awaitingAuth" | "generating" | "success" | "error";

/** The only connector today; the dropdown is shown for future connectors. */
const GIST_CONNECTOR = "gist";

/**
 * The Share thread dialog. Publishes the thread at `path` as a secret GitHub
 * Gist and hands back a browser link. Signing in is folded into the flow: if the
 * user isn't authenticated, "Generate link" first drives the Device Flow (whose
 * own dialog stacks on top) and resumes automatically once they're signed in.
 */
export function ShareThreadDialog({
  open,
  path,
  runtimeId,
  onOpenChange,
}: {
  open: boolean;
  path: string;
  runtimeId: RuntimeId;
  onOpenChange: (open: boolean) => void;
}) {
  const { state: authState, signIn } = useGithubAuth();
  const { executeCommand } = useCommands();

  const [connector, setConnector] = useState(GIST_CONNECTOR);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<ShareStatus>("idle");
  const [shareUrl, setShareUrl] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [copied, setCopied] = useState(false);
  // Shown when a signed-out user clicks Generate, before we start the GitHub
  // Device Flow, so the sign-in isn't sprung on them unexpectedly.
  const [confirmSignInOpen, setConfirmSignInOpen] = useState(false);
  const [flow] = useState(() => new ShareThreadDialogFlow());
  const authTransactionRef = useRef<ShareThreadTransaction | null>(null);

  // Synchronize during render so a target change invalidates old async work
  // before a passive effect or promise callback can observe the new dialog.
  flow.sync(open, { runtimeId, path });

  // Reset every time the dialog (re)opens, and prefill the title from the thread
  // on disk so the shared copy is nicely named without extra typing.
  useEffect(() => {
    if (!open) return;
    authTransactionRef.current = null;
    setStatus("idle");
    setShareUrl("");
    setErrorMessage("");
    setCopied(false);
    setConfirmSignInOpen(false);
    setDescription("");
    setTitle(threadTitleFromPath(path));
    void flow.prefillTitle(
      (target) => readShareThread(target.runtimeId, target.path),
      setTitle
    );
  }, [flow, open, path, runtimeId]);

  const publishTransaction = useCallback(
    (transaction: ShareThreadTransaction) => {
      void flow.publish(
        transaction,
        (snapshot) =>
          shareThread(snapshot.runtimeId, snapshot.path, {
            title: snapshot.title,
            description: snapshot.description,
          }),
        {
          onStart: () => {
            setStatus("generating");
            setErrorMessage("");
          },
          onSuccess: (result) => {
            setShareUrl(result.shareUrl);
            setStatus("success");
          },
          onError: (error) => {
            setErrorMessage(_friendlyError(error));
            setStatus("error");
          },
        }
      );
    },
    [flow]
  );

  const handleGenerate = useCallback(() => {
    const transaction = flow.createTransaction({ title, description });
    if (!transaction) return;
    if (authState.status === "signedIn") {
      publishTransaction(transaction);
      return;
    }
    // Not signed in: confirm before springing the GitHub sign-in on the user.
    authTransactionRef.current = transaction;
    setConfirmSignInOpen(true);
  }, [authState.status, description, flow, publishTransaction, title]);

  // Confirmed the sign-in prompt: drive the Device Flow; the effect below
  // resumes the share automatically once the user is signed in.
  const handleConfirmSignIn = useCallback(() => {
    const transaction = authTransactionRef.current;
    authTransactionRef.current = null;
    setConfirmSignInOpen(false);
    if (!transaction) return;
    if (authState.status === "signedIn") {
      publishTransaction(transaction);
      return;
    }
    if (!flow.beginAuth(transaction)) return;
    setStatus("awaitingAuth");
    signIn();
  }, [authState.status, flow, publishTransaction, signIn]);

  // Resume (or abort) once the Device Flow settles while we're waiting on auth.
  useEffect(() => {
    if (status !== "awaitingAuth") return;
    const observation = flow.observeAuth(authState.status);
    if (observation.type === "resume") {
      publishTransaction(observation.transaction);
    } else if (observation.type === "cancelled") {
      setStatus("idle");
    }
  }, [authState.status, flow, publishTransaction, status]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
    } catch {
      // Clipboard can be unavailable; the link stays visible for manual copy.
    }
  }, [shareUrl]);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      // Invalidate the current epoch immediately; the RPC itself cannot abort.
      if (!next) {
        flow.invalidate();
        authTransactionRef.current = null;
        setConfirmSignInOpen(false);
      }
      onOpenChange(next);
    },
    [flow, onOpenChange]
  );

  const handleConfirmSignInOpenChange = useCallback(
    (next: boolean) => {
      if (!next) authTransactionRef.current = null;
      setConfirmSignInOpen(next);
    },
    []
  );

  const busy = status === "awaitingAuth" || status === "generating";

  return (
    <>
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Share thread</DialogTitle>
          <DialogDescription>
            Publish this thread to a link anyone can open in their browser.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/25 bg-amber-500/10 p-3 text-xs text-amber-200/90">
          <TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-amber-400" />
          <p>
            Anyone with the link can view the full thread — its prompts,
            messages, and tool calls. It&rsquo;s published as a secret GitHub
            Gist under your account; delete the gist to revoke access.
          </p>
        </div>

        {status === "success" ? (
          <div className="space-y-2">
            <span className="text-muted-foreground text-xs font-medium">
              Share link
            </span>
            <div className="flex items-center gap-2">
              <Input
                readOnly
                value={shareUrl}
                className="font-mono"
                onFocus={(event) => event.currentTarget.select()}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopy}
                className="shrink-0"
              >
                {copied ? (
                  <CheckIcon className="text-emerald-500" />
                ) : (
                  <CopyIcon />
                )}
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
            <button
              type="button"
              onClick={() =>
                executeCommand({ type: "openLink", args: { url: shareUrl } })
              }
              className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs transition-colors"
            >
              <ExternalLinkIcon className="size-3.5" />
              Open in browser
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <span className="text-muted-foreground text-xs font-medium">
                Share via
              </span>
              <Select
                value={connector}
                onValueChange={setConnector}
                disabled={busy}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={GIST_CONNECTOR}>
                    <GitHubIcon className="size-3.5" />
                    GitHub Gist
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <span className="text-muted-foreground text-xs font-medium">
                Title
              </span>
              <Input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Untitled thread"
                disabled={busy}
              />
            </div>
            <div className="space-y-1.5">
              <span className="text-muted-foreground text-xs font-medium">
                Description{" "}
                <span className="text-muted-foreground/60">(optional)</span>
              </span>
              <Textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="What is this thread about?"
                disabled={busy}
                rows={2}
              />
            </div>
            {status === "error" ? (
              <p className="text-destructive text-xs">{errorMessage}</p>
            ) : null}
          </div>
        )}

        <DialogFooter>
          {status === "success" ? (
            <Button onClick={() => handleOpenChange(false)}>Done</Button>
          ) : (
            <>
              <Button variant="ghost" onClick={() => handleOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={handleGenerate} disabled={busy}>
                {busy ? <Loader2Icon className="animate-spin" /> : null}
                {status === "awaitingAuth"
                  ? "Waiting for GitHub sign-in…"
                  : status === "generating"
                    ? "Creating link…"
                    : status === "error"
                      ? "Try again"
                      : "Generate link"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>

      <ConfirmDialog
        open={confirmSignInOpen}
        onOpenChange={handleConfirmSignInOpenChange}
        dimBackground={false}
        title="Sign in to GitHub?"
        description="Sharing publishes this thread as a secret GitHub Gist, so you need to sign in to GitHub first. Continue?"
        confirmLabel="Sign in and continue"
        confirmVariant="default"
        onConfirm={handleConfirmSignIn}
      />
    </>
  );
}

/** Map a share failure to a short, human message for the dialog. */
function _friendlyError(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (/sign-in required/i.test(message)) {
    return "GitHub sign-in is required to share. Please sign in and try again.";
  }
  if (/rate limit/i.test(message)) {
    return "GitHub rate limit reached. Please wait a moment and try again.";
  }
  return message || "Couldn't create the share link. Please try again.";
}
