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
import { Textarea } from "@llm-space/ui/ui/textarea";
import {
  CheckIcon,
  CopyIcon,
  ExternalLinkIcon,
  Link2Icon,
  Loader2Icon,
  MessageSquareIcon,
  MousePointer2Icon,
  SendIcon,
  ShieldCheckIcon,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { readShareThread, shareThread } from "@/client/share";
import { useCommands } from "@/commands";
import { useGithubAuth } from "@/components/github-auth-provider";
import type { RuntimeId } from "@/shared/runtime";

import {
  prepareShareThreadDialogCommit,
  ShareThreadDialogFlow,
  type ShareThreadTransaction,
} from "./share-thread-dialog-flow";

type ShareStatus = "idle" | "awaitingAuth" | "generating" | "success" | "error";

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

  // Preparing a target is deliberately pure: React may discard this render.
  // The layout phase below is the first point at which the target is committed.
  const targetCommit = useMemo(
    () => prepareShareThreadDialogCommit(open, { runtimeId, path }),
    [open, path, runtimeId]
  );

  // Reset every time the dialog (re)opens, and prefill the title from the thread
  // on disk so the shared copy is nicely named without extra typing. A layout
  // effect both commits ownership and clears target-specific UI before paint.
  useLayoutEffect(() => {
    targetCommit.commit(flow);
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
  }, [flow, open, path, targetCommit]);

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

  const handleConfirmSignInOpenChange = useCallback((next: boolean) => {
    if (!next) authTransactionRef.current = null;
    setConfirmSignInOpen(next);
  }, []);

  const busy = status === "awaitingAuth" || status === "generating";

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-3xl">
          <div className="relative overflow-hidden border-b">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] bg-[size:30px_30px] opacity-20 [mask-image:radial-gradient(circle_at_78%_50%,black,transparent_64%)]"
            />
            <div
              aria-hidden="true"
              className="bg-primary/10 pointer-events-none absolute -top-24 -right-12 size-72 rounded-full blur-3xl"
            />

            <DialogHeader className="relative grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1 px-6 pt-4 text-left sm:text-left">
              <span className="bg-background/70 row-span-2 flex size-7 items-center justify-center self-center rounded-lg border shadow-sm backdrop-blur-xl">
                <Link2Icon className="text-primary size-3.5" />
              </span>
              <DialogTitle className="col-start-2">
                Share thread
              </DialogTitle>
              <DialogDescription className="col-start-2 text-xs">
                Create a link others can open in LLM Space or view on the web.
              </DialogDescription>
            </DialogHeader>

            {status !== "success" ? (
              <div className="relative grid items-center gap-5 px-6 pt-2 pb-3 md:grid-cols-[1fr_1.05fr]">
                <div>
                  <span className="text-primary text-[0.625rem] font-semibold tracking-[0.18em] uppercase">
                    Read-only web share
                  </span>
                  <h3 className="mt-1.5 text-xl font-semibold tracking-tight">
                    Share the thread—not a screenshot.
                  </h3>
                  <p className="text-muted-foreground mt-1.5 max-w-sm text-xs/relaxed">
                    Others can open it in LLM Space or explore it read-only on
                    the web.
                  </p>
                </div>
                <SharePreview />
              </div>
            ) : null}
          </div>

          {status === "success" ? (
            <ShareSuccess
              shareUrl={shareUrl}
              copied={copied}
              onCopy={handleCopy}
              onOpen={() =>
                executeCommand({ type: "openLink", args: { url: shareUrl } })
              }
            />
          ) : (
            <div className="flex min-h-72 flex-col gap-4 p-6">
              <div className="space-y-2.5">
                <label htmlFor="share-title" className="text-xs font-medium">
                  Title
                </label>
                <Input
                  id="share-title"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Untitled thread"
                  disabled={busy}
                />
              </div>

              <div className="flex flex-1 flex-col gap-2.5">
                <label
                  htmlFor="share-description"
                  className="text-xs font-medium"
                >
                  Description
                </label>
                <Textarea
                  id="share-description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Add a short note for the people opening this link…"
                  disabled={busy}
                  rows={3}
                  className="min-h-28 flex-1 resize-none"
                />
              </div>
              {status === "error" ? (
                <p className="border-destructive/20 bg-destructive/5 text-destructive rounded-lg border px-3 py-2 text-xs">
                  {errorMessage}
                </p>
              ) : null}
            </div>
          )}

          <DialogFooter className="border-t bg-background/80 px-6 py-4 backdrop-blur-xl">
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
                  {!busy ? <SendIcon className="size-3.5" /> : null}
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

/** Theme-aware HTML illustration of the read-only page the link opens. */
function SharePreview() {
  return (
    <div className="relative mx-auto h-32 w-full max-w-64" aria-hidden="true">
      <div className="bg-background/35 absolute inset-3 -rotate-3 rounded-xl border backdrop-blur-sm" />
      <div className="bg-background/90 absolute inset-1 overflow-hidden rounded-xl border shadow-xl shadow-black/10 backdrop-blur-xl">
        <div className="flex h-7 items-center gap-1.5 border-b px-2.5">
          <span className="bg-muted-foreground/25 size-1.5 rounded-full" />
          <span className="bg-muted-foreground/25 size-1.5 rounded-full" />
          <span className="bg-muted-foreground/25 size-1.5 rounded-full" />
          <div className="bg-muted/60 text-muted-foreground ml-2 flex h-4 min-w-0 flex-1 items-center truncate rounded px-2 text-[0.4375rem]">
            deer-flow.github.io/llm-space
          </div>
        </div>
        <div className="flex flex-col gap-1.5 p-2.5">
          <div className="flex items-center gap-2">
            <span className="bg-primary/12 text-primary flex size-6 items-center justify-center rounded-lg">
              <MessageSquareIcon className="size-3" />
            </span>
            <div className="flex flex-col gap-1">
              <span className="bg-foreground/70 h-1.5 w-20 rounded-full" />
              <span className="bg-muted-foreground/25 h-1 w-12 rounded-full" />
            </div>
          </div>
          <div className="bg-muted/45 flex flex-col gap-1.5 rounded-md p-2">
            <span className="bg-muted-foreground/30 h-1 w-[82%] rounded-full" />
            <span className="bg-muted-foreground/20 h-1 w-[58%] rounded-full" />
          </div>
          <div className="border-primary/15 bg-primary/[0.06] ml-6 flex flex-col gap-1 rounded-md border p-2">
            <span className="bg-primary/30 h-1 w-[72%] rounded-full" />
            <span className="bg-primary/20 h-1 w-[90%] rounded-full" />
          </div>
        </div>
      </div>
      <div className="bg-background/90 absolute right-0 bottom-0 flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[0.625rem] font-medium shadow-lg backdrop-blur-xl">
        <MousePointer2Icon className="text-primary size-3" />
        Open in LLM Space
      </div>
    </div>
  );
}

function ShareSuccess({
  shareUrl,
  copied,
  onCopy,
  onOpen,
}: {
  shareUrl: string;
  copied: boolean;
  onCopy: () => void;
  onOpen: () => void;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-8 text-center">
      <div className="relative mb-5 flex size-20 items-center justify-center">
        <span className="border-primary/10 absolute inset-0 rounded-full border" />
        <span className="border-primary/15 absolute inset-2 rounded-full border" />
        <span className="bg-primary/10 text-primary flex size-11 items-center justify-center rounded-2xl border border-primary/20 shadow-sm">
          <Link2Icon className="size-5" />
        </span>
      </div>
      <span className="text-primary text-[0.625rem] font-semibold tracking-[0.18em] uppercase">
        Published
      </span>
      <h3 className="mt-2 text-2xl font-semibold tracking-tight">
        Your thread is ready to travel
      </h3>
      <p className="text-muted-foreground mt-2 max-w-md text-sm/relaxed">
        Send this link to anyone. They can explore the full read-only thread
        without a GitHub account.
      </p>

      <div className="mt-6 flex w-full max-w-xl items-center gap-2">
        <div className="bg-muted/25 flex min-w-0 flex-1 items-center gap-2 rounded-xl border p-1.5 pl-3 shadow-sm">
          <Link2Icon className="text-muted-foreground size-3.5 shrink-0" />
          <Input
            readOnly
            value={shareUrl}
            className="h-8 min-w-0 border-0 bg-transparent px-0 font-mono text-xs shadow-none focus-visible:ring-0"
            onFocus={(event) => event.currentTarget.select()}
          />
          <Button
            variant={copied ? "secondary" : "default"}
            size="sm"
            onClick={onCopy}
            className="shrink-0 cursor-pointer"
          >
            {copied ? (
              <CheckIcon className="text-emerald-500" />
            ) : (
              <CopyIcon />
            )}
            {copied ? "Copied" : "Copy link"}
          </Button>
        </div>
        <Button
          variant="outline"
          size="icon"
          onClick={onOpen}
          className="shrink-0 cursor-pointer"
          aria-label="Open in browser"
        >
          <ExternalLinkIcon />
        </Button>
      </div>

      <div className="text-muted-foreground mt-5 flex items-center gap-2 text-[0.6875rem]">
        <ShieldCheckIcon className="size-3.5" />
        Nothing is published again unless you choose to share.
      </div>
    </div>
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
