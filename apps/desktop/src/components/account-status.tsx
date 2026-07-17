"use client";

import { Tooltip } from "@llm-space/ui/components/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@llm-space/ui/ui/dropdown-menu";
import { ChevronsUpDown, Loader2Icon, LogOut, XIcon } from "lucide-react";

import { useCommands } from "@/commands";
import { useGithubAuth } from "@/components/github-auth-provider";
import { GithubAvatar } from "@/components/github-avatar";
import { GitHubIcon } from "@/components/github-icon";
import type { GithubUser } from "@/shared/auth";

/** The bottom-of-sidebar GitHub account widget: sign in / signing in / signed in. */
export function AccountStatus() {
  const { state, signIn, signOut } = useGithubAuth();

  return (
    <div className="border-border/70 electrobun-webkit-app-region-no-drag flex shrink-0 border-t p-2">
      {state.status === "signedIn" ? (
        <SignedIn user={state.user} onSignOut={signOut} />
      ) : state.status === "signingIn" ? (
        <SigningIn onCancel={signOut} />
      ) : (
        <SignedOut onSignIn={signIn} />
      )}
    </div>
  );
}

function SignedOut({ onSignIn }: { onSignIn: () => void }) {
  return (
    <Tooltip content="Sign in to share your threads on the web via GitHub Gist.">
      <button
        type="button"
        onClick={onSignIn}
        className="hover:bg-accent hover:text-accent-foreground text-muted-foreground flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors"
      >
        <GitHubIcon className="size-4 shrink-0" />
        <span className="truncate">Sign in to GitHub</span>
      </button>
    </Tooltip>
  );
}

function SigningIn({ onCancel }: { onCancel: () => void }) {
  return (
    <div className="text-muted-foreground flex w-full items-center gap-2 px-2 py-1.5 text-sm">
      <Loader2Icon className="size-4 shrink-0 animate-spin" />
      <span className="truncate">Signing in…</span>
      <button
        type="button"
        aria-label="Cancel sign-in"
        onClick={onCancel}
        className="hover:bg-accent hover:text-foreground ml-auto flex size-6 shrink-0 items-center justify-center rounded-md transition-colors"
      >
        <XIcon className="size-4" />
      </button>
    </div>
  );
}

function SignedIn({
  user,
  onSignOut,
}: {
  user: GithubUser;
  onSignOut: () => void;
}) {
  const { executeCommand } = useCommands();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="hover:bg-accent hover:text-accent-foreground flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors"
        >
          <GithubAvatar user={user} />
          <span className="truncate font-medium">{user.login}</span>
          <ChevronsUpDown className="text-muted-foreground ml-auto size-3.5 shrink-0" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="w-56">
        <DropdownMenuItem
          onSelect={() =>
            executeCommand({ type: "openLink", args: { url: user.htmlUrl } })
          }
        >
          <GitHubIcon />
          Open GitHub Profile
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={onSignOut}>
          <LogOut />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
