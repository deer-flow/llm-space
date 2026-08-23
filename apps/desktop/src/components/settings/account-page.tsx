"use client";

import { useI18n } from "@llm-space/ui/lib/i18n";
import { Button } from "@llm-space/ui/ui/button";
import {
  ArrowRightIcon,
  CheckCircle2Icon,
  ChevronDownIcon,
  FileTextIcon,
  Globe2Icon,
  HistoryIcon,
  ImportIcon,
  Link2Icon,
  Loader2Icon,
  LockKeyholeIcon,
  LogOut,
  PlayIcon,
  Share2Icon,
  ShieldCheckIcon,
  SparklesIcon,
  Undo2Icon,
} from "lucide-react";

import { useGithubAuth } from "@/components/github-auth-provider";
import { GithubAvatar } from "@/components/github-avatar";
import { GitHubIcon } from "@/components/github-icon";
import type { GithubUser } from "@/shared/auth";

import { SettingsPage } from "./settings-page";

export function AccountPage() {
  const { t } = useI18n();
  const { state, signIn, signOut } = useGithubAuth();

  return (
    <SettingsPage
      title={t.settings.account.title}
      description={t.settings.account.description}
      className="overflow-y-auto"
    >
      {state.status === "signedIn" ? (
        <_AccountOverview user={state.user} onSignOut={signOut} />
      ) : state.status === "signingIn" ? (
        <div className="flex h-full items-center justify-center">
          <div className="bg-card flex w-full max-w-md flex-col items-center gap-4 rounded-2xl border px-8 py-10 text-center shadow-sm">
            <div className="bg-primary/10 text-primary flex size-11 items-center justify-center rounded-full">
              <Loader2Icon className="size-5 animate-spin" />
            </div>
            <div className="flex flex-col gap-1.5">
              <h3 className="font-heading text-base font-medium">
                {t.settings.account.waitingForGithub}
              </h3>
              <p className="text-muted-foreground text-sm">
                {t.settings.account.finishAuthorization}
              </p>
            </div>
            <Button variant="outline" onClick={signOut}>
              {t.settings.account.cancelSignIn}
            </Button>
          </div>
        </div>
      ) : (
        <_AccountOverview onSignIn={signIn} />
      )}
    </SettingsPage>
  );
}

function _AccountOverview({
  user,
  onSignIn,
  onSignOut,
}: {
  user?: GithubUser;
  onSignIn?: () => void;
  onSignOut?: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col gap-4 pb-2">
      <section className="bg-card relative isolate overflow-hidden rounded-2xl border px-7 py-7 shadow-sm">
        <div
          className="pointer-events-none absolute inset-0 -z-10 opacity-30"
          style={{
            backgroundImage:
              "linear-gradient(to right, color-mix(in oklch, var(--border) 45%, transparent) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in oklch, var(--border) 45%, transparent) 1px, transparent 1px)",
            backgroundSize: "28px 28px",
            maskImage:
              "linear-gradient(to right, transparent, black 42%, black)",
          }}
        />
        <div className="bg-primary/15 pointer-events-none absolute -top-20 -right-16 -z-10 size-64 rounded-full blur-3xl" />

        <div className="grid items-center gap-8 md:grid-cols-[minmax(0,1fr)_15rem]">
          <div className="flex min-w-0 flex-col items-start">
            <div className="text-muted-foreground mb-4 flex items-center gap-2 text-[11px] font-medium tracking-[0.16em] uppercase">
              {user ? (
                <CheckCircle2Icon className="size-3.5 text-emerald-500" />
              ) : (
                <GitHubIcon className="size-3.5" />
              )}
              {user
                ? t.settings.account.connectedWithGithub
                : t.settings.account.publishWithGithub}
            </div>
            <h3 className="font-heading max-w-lg text-3xl leading-[1.08] font-medium tracking-tight text-balance">
              {t.settings.account.shareTheThread}
              <br />
              {t.settings.account.notAScreenshot}
            </h3>
            <p className="text-muted-foreground mt-4 max-w-lg text-sm leading-relaxed text-balance">
              {t.settings.account.webPageDescription}
            </p>
            {user ? (
              <>
                <div className="bg-background/70 mt-6 flex w-full max-w-md items-center gap-3 rounded-xl border p-2 shadow-sm backdrop-blur-sm">
                  <GithubAvatar user={user} className="size-9" />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-medium">
                      {user.name ?? user.login}
                    </span>
                    <span className="text-muted-foreground truncate text-[11px]">
                      @{user.login}
                      {user.email ? ` · ${user.email}` : ""}
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground shrink-0"
                    onClick={onSignOut}
                  >
                    <LogOut />
                    {t.common.signOut}
                  </Button>
                </div>
                <p className="text-muted-foreground mt-2.5 flex items-center gap-1.5 text-[11px]">
                  <CheckCircle2Icon className="size-3 text-emerald-500" />
                  {t.settings.account.readyToShare}
                </p>
              </>
            ) : (
              <>
                <Button
                  size="lg"
                  className="mt-6 rounded-full px-6 shadow-sm"
                  onClick={onSignIn}
                >
                  <GitHubIcon />
                  {t.settings.account.signInWithGithub}
                  <ArrowRightIcon />
                </Button>
                <p className="text-muted-foreground mt-2.5 text-[11px]">
                  {t.settings.account.secureSignIn}
                </p>
              </>
            )}
          </div>

          {user ? <_ShareActionPreview /> : <_PublishedThreadPreview />}
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-3">
        <_Benefit
          icon={Globe2Icon}
          title={t.settings.account.benefits.openAnywhere.title}
          description={t.settings.account.benefits.openAnywhere.description}
        />
        <_Benefit
          icon={ImportIcon}
          title={t.settings.account.benefits.bringItBack.title}
          description={t.settings.account.benefits.bringItBack.description}
        />
        <_Benefit
          icon={LockKeyholeIcon}
          title={t.settings.account.benefits.unlistedByDefault.title}
          description={
            t.settings.account.benefits.unlistedByDefault.description
          }
        />
      </div>

      <div className="text-muted-foreground flex items-start gap-3 rounded-xl border px-4 py-3 text-xs leading-relaxed">
        <ShieldCheckIcon className="text-foreground mt-0.5 size-4 shrink-0" />
        <p>
          <span className="text-foreground font-medium">
            {t.settings.account.youDecide}
          </span>{" "}
          {t.settings.account.youDecideHint}
        </p>
      </div>
    </div>
  );
}

function _ShareActionPreview() {
  const { t } = useI18n();
  return (
    <div className="relative mx-auto w-full max-w-60 pt-14 pb-3">
      <div className="bg-background relative rounded-xl border shadow-xl shadow-black/15">
        <div className="flex items-center justify-between gap-1 px-2 py-2">
          <div className="flex items-center gap-0.5">
            <div className="text-muted-foreground flex size-7 items-center justify-center rounded-md opacity-45">
              <Undo2Icon className="size-3.5" />
            </div>
            <div className="text-muted-foreground flex size-7 items-center justify-center rounded-md">
              <HistoryIcon className="size-3.5" />
            </div>
            <div className="bg-accent text-foreground ring-primary/40 relative flex size-9 scale-110 items-center justify-center rounded-lg shadow-md ring-1">
              <div className="bg-popover text-popover-foreground absolute bottom-full left-1/2 mb-3 -translate-x-1/2 whitespace-nowrap rounded-lg border px-3 py-2 text-xs font-medium shadow-lg">
                {t.settings.account.shareThreadChip}
                <span className="bg-popover absolute -bottom-1 left-1/2 size-2 -translate-x-1/2 rotate-45 border-r border-b" />
              </div>
              <span className="bg-primary/20 absolute inset-0 animate-pulse rounded-lg" />
              <Share2Icon className="relative size-4.5" />
            </div>
            <div className="text-muted-foreground flex size-7 items-center justify-center rounded-md">
              <SparklesIcon className="size-4" />
            </div>
          </div>
          <div className="bg-primary text-primary-foreground flex h-8 items-center gap-1 rounded-lg px-2.5 text-xs font-medium shadow-sm">
            <PlayIcon className="size-3.5 fill-current" />
            {t.settings.account.runChip}
            <ChevronDownIcon className="size-3.5" />
          </div>
        </div>
      </div>

      <p className="text-muted-foreground mt-3 text-center text-[10px]">
        {t.settings.account.lookInTopRight}
      </p>
    </div>
  );
}

function _PublishedThreadPreview() {
  return (
    <div className="relative mx-auto w-full max-w-60 py-3">
      <div className="bg-background/75 absolute inset-x-4 top-0 h-full rotate-3 rounded-xl border opacity-60" />
      <div className="bg-background relative overflow-hidden rounded-xl border shadow-xl shadow-black/15">
        <div className="border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="bg-primary/12 text-primary flex size-7 items-center justify-center rounded-md">
              <FileTextIcon className="size-3.5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-medium">Research thread</div>
              <div className="text-muted-foreground text-[10px]">
                Read-only · Web
              </div>
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-2.5 px-4 py-4">
          <div className="bg-muted h-2 w-4/5 rounded-full" />
          <div className="bg-muted h-2 w-full rounded-full" />
          <div className="bg-muted h-2 w-3/5 rounded-full" />
          <div className="border-primary/15 bg-primary/6 mt-1 rounded-lg border p-3">
            <div className="bg-primary/25 h-1.5 w-2/3 rounded-full" />
            <div className="bg-primary/15 mt-2 h-1.5 w-full rounded-full" />
          </div>
        </div>
        <div className="text-muted-foreground flex items-center gap-1.5 border-t px-4 py-2.5 text-[10px]">
          <Link2Icon className="size-3" />
          <span className="truncate">llm-space/shared/thread</span>
        </div>
      </div>
    </div>
  );
}

function _Benefit({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof Globe2Icon;
  title: string;
  description: string;
}) {
  return (
    <div className="bg-card/50 flex min-w-0 flex-col gap-3 rounded-xl border p-4">
      <div className="bg-muted text-foreground flex size-8 items-center justify-center rounded-lg">
        <Icon className="size-4" />
      </div>
      <div className="flex flex-col gap-1">
        <h4 className="text-sm font-medium">{title}</h4>
        <p className="text-muted-foreground text-xs leading-relaxed">
          {description}
        </p>
      </div>
    </div>
  );
}
