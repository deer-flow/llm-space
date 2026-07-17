"use client";

import { Button } from "@llm-space/ui/ui/button";
import { Separator } from "@llm-space/ui/ui/separator";
import { Loader2Icon, LogOut } from "lucide-react";

import { useGithubAuth } from "@/components/github-auth-provider";
import { GithubAvatar } from "@/components/github-avatar";
import { GitHubIcon } from "@/components/github-icon";

import { SettingsPage } from "./settings-page";

export function AccountPage() {
  const { state, signIn, signOut } = useGithubAuth();

  return (
    <SettingsPage
      title="Account"
      description="Sign in with GitHub to share your threads on the web as gists."
      className="overflow-y-auto"
    >
      <div className="flex flex-col gap-6 pb-2">
        {state.status === "signedIn" ? (
          <div className="flex items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <GithubAvatar user={state.user} className="size-10" />
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-medium">
                  {state.user.name ?? state.user.login}
                </span>
                <span className="text-muted-foreground truncate text-xs">
                  @{state.user.login}
                  {state.user.email ? ` · ${state.user.email}` : ""}
                </span>
              </div>
            </div>
            <Button variant="outline" onClick={signOut}>
              <LogOut />
              Sign out
            </Button>
          </div>
        ) : state.status === "signingIn" ? (
          <div className="flex items-center justify-between gap-4">
            <span className="text-muted-foreground flex items-center gap-2 text-sm">
              <Loader2Icon className="size-4 animate-spin" />
              Waiting for GitHub authorization…
            </span>
            <Button variant="outline" onClick={signOut}>
              Cancel
            </Button>
          </div>
        ) : (
          <div className="flex items-start justify-between gap-4">
            <span className="flex flex-col gap-1">
              <span className="text-sm font-medium">Not signed in</span>
              <span className="text-muted-foreground text-xs">
                Connect your GitHub account to share threads on the web.
              </span>
            </span>
            <Button onClick={signIn}>
              <GitHubIcon />
              Sign in with GitHub
            </Button>
          </div>
        )}

        <Separator />

        <p className="text-muted-foreground text-xs leading-relaxed">
          Signing in lets you publish a thread as a secret GitHub Gist and share
          the link. Anyone with the link can view it read-only on the web and
          import it into LLM Space with one click — no GitHub account needed to
          view. A secret gist is unlisted, but anyone who has the link can open
          it, so avoid sharing sensitive threads.
        </p>
      </div>
    </SettingsPage>
  );
}
