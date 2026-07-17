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
import { CheckIcon, CopyIcon, Loader2Icon } from "lucide-react";
import { useEffect, useState } from "react";

import { useCommands } from "@/commands";
import { useGithubAuth } from "@/components/github-auth-provider";
import { GitHubIcon } from "@/components/github-icon";

/**
 * The Device Flow dialog. Shown while signing in: it surfaces the pairing code
 * with a "copy & open GitHub" button so the user copies the code, lands on the
 * pre-signed-in GitHub page, and pastes it — then we poll and close on success.
 */
export function GithubDeviceDialog() {
  const { state, signOut } = useGithubAuth();
  const { executeCommand } = useCommands();
  const [copied, setCopied] = useState(false);
  const [opened, setOpened] = useState(false);

  const open = state.status === "signingIn";
  const userCode = state.status === "signingIn" ? state.userCode : undefined;
  const verificationUri =
    state.status === "signingIn" ? state.verificationUri : undefined;

  // Reset the local copy/open affordances each time a new flow starts.
  useEffect(() => {
    if (!open) {
      setCopied(false);
      setOpened(false);
    }
  }, [open]);

  const handleCopyAndOpen = async () => {
    if (userCode) {
      try {
        await navigator.clipboard.writeText(userCode);
        setCopied(true);
      } catch {
        // Clipboard can be unavailable; the code is still shown to copy manually.
      }
    }
    if (verificationUri) {
      executeCommand({ type: "openLink", args: { url: verificationUri } });
      setOpened(true);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : signOut())}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Sign in with GitHub</DialogTitle>
          <DialogDescription>
            Copy this code, then authorize on the GitHub page we open. Paste the
            code there and confirm.
          </DialogDescription>
        </DialogHeader>

        {userCode ? (
          <button
            type="button"
            onClick={handleCopyAndOpen}
            className="bg-muted/50 hover:bg-muted group flex items-center justify-center gap-3 rounded-lg border py-4 transition-colors"
            aria-label="Copy code"
          >
            <span className="font-mono text-2xl font-semibold tracking-[0.3em]">
              {userCode}
            </span>
            {copied ? (
              <CheckIcon className="size-4 text-emerald-500" />
            ) : (
              <CopyIcon className="text-muted-foreground group-hover:text-foreground size-4" />
            )}
          </button>
        ) : (
          <div className="text-muted-foreground flex items-center justify-center gap-2 py-6 text-sm">
            <Loader2Icon className="size-4 animate-spin" />
            Requesting a code from GitHub…
          </div>
        )}

        {opened ? (
          <p className="text-muted-foreground flex items-center justify-center gap-2 text-xs">
            <Loader2Icon className="size-3.5 animate-spin" />
            Waiting for you to authorize on GitHub…
          </p>
        ) : null}

        <DialogFooter>
          <Button variant="ghost" onClick={signOut}>
            Cancel
          </Button>
          <Button onClick={handleCopyAndOpen} disabled={!userCode}>
            <GitHubIcon />
            {opened ? "Open GitHub again" : "Copy code & open GitHub"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
