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


import { localFs } from "@/client/local-file-system";
import { shareThread } from "@/client/share";
import { useCommands } from "@/commands";
import { useGithubAuth } from "@/components/github-auth-provider";
import { GitHubIcon } from "@/components/github-icon";

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
  onOpenChange,
}: {
  open: boolean;
  path: string;
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

  // Guards a result / late sign-in landing after the user closed the dialog —
  // the in-flight RPC request itself can't be aborted.
  const cancelledRef = useRef(false);
  // Distinguishes the brief "signedOut" right after clicking Generate from a
  // real Device-Flow cancel: only a signedOut *after* "signingIn" is a cancel.
  const sawSigningInRef = useRef(false);

  // Reset every time the dialog (re)opens, and prefill the title from the thread
  // on disk so the shared copy is nicely named without extra typing.
  useEffect(() => {
    if (!open) return;
    cancelledRef.current = false;
    sawSigningInRef.current = false;
    setStatus("idle");
    setShareUrl("");
    setErrorMessage("");
    setCopied(false);
    setConfirmSignInOpen(false);
    setDescription("");
    setTitle(threadTitleFromPath(path));
    let stale = false;
    void localFs
      .read(path)
      .then((thread) => {
        if (!stale && thread.title) setTitle(thread.title);
      })
      .catch(() => {
        // Non-fatal: keep the path-derived title.
      });
    return () => {
      stale = true;
    };
  }, [open, path]);

  const generate = useCallback(async () => {
    cancelledRef.current = false;
    setStatus("generating");
    setErrorMessage("");
    try {
      const trimmedTitle = title.trim();
      const result = await shareThread(path, {
        title: trimmedTitle || undefined,
        description: description.trim(),
      });
      if (cancelledRef.current) return;
      setShareUrl(result.shareUrl);
      setStatus("success");
    } catch (error) {
      if (cancelledRef.current) return;
      setErrorMessage(_friendlyError(error));
      setStatus("error");
    }
  }, [path, title, description]);

  const handleGenerate = useCallback(() => {
    if (authState.status === "signedIn") {
      void generate();
      return;
    }
    // Not signed in: confirm before springing the GitHub sign-in on the user.
    setConfirmSignInOpen(true);
  }, [authState.status, generate]);

  // Confirmed the sign-in prompt: drive the Device Flow; the effect below
  // resumes the share automatically once the user is signed in.
  const handleConfirmSignIn = useCallback(() => {
    setConfirmSignInOpen(false);
    sawSigningInRef.current = false;
    setStatus("awaitingAuth");
    signIn();
  }, [signIn]);

  // Resume (or abort) once the Device Flow settles while we're waiting on auth.
  useEffect(() => {
    if (status !== "awaitingAuth") return;
    if (authState.status === "signingIn") {
      sawSigningInRef.current = true;
    } else if (authState.status === "signedIn") {
      void generate();
    } else if (authState.status === "signedOut" && sawSigningInRef.current) {
      // The user cancelled the sign-in / it failed — back to the start.
      sawSigningInRef.current = false;
      setStatus("idle");
    }
  }, [status, authState.status, generate]);

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
      // Closing mid-flight: mark cancelled so a pending result / sign-in is
      // discarded, then let the reopen effect reset the rest.
      if (!next) cancelledRef.current = true;
      onOpenChange(next);
    },
    [onOpenChange]
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
        onOpenChange={setConfirmSignInOpen}
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
