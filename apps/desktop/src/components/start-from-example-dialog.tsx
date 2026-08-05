"use client";

import {
  PROMPT_EXAMPLES,
  isPromptExample,
  type PromptExample,
} from "@llm-space/ui/components/thread-playground/examples/prompts";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@llm-space/ui/ui/dialog";
import { ScrollArea } from "@llm-space/ui/ui/scroll-area";
import {
  ArrowRightIcon,
  BlocksIcon,
  WandSparklesIcon,
} from "lucide-react";

const FEATURED_IDS = ["blank", "general-agent", "deep-research"] as const;

const FEATURE_ART: Record<(typeof FEATURED_IDS)[number], string> = {
  blank: "/images/thread-starters/blank.jpg",
  "general-agent": "/images/thread-starters/general-agent.jpg",
  "deep-research": "/images/thread-starters/deep-research.jpg",
};

const FEATURE_META: Record<
  (typeof FEATURED_IDS)[number],
  { eyebrow: string }
> = {
  blank: { eyebrow: "Clean slate" },
  "general-agent": { eyebrow: "Recommended" },
  "deep-research": { eyebrow: "Research mode" },
};

export function StartFromExampleDialog({
  open,
  onOpenChange,
  onSelectExample,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectExample: (example: PromptExample) => void;
}) {
  const examples = PROMPT_EXAMPLES.filter(isPromptExample);
  const featured = FEATURED_IDS.map((id) =>
    examples.find((example) => example.id === id)
  ).filter((example): example is PromptExample => example !== undefined);
  const specialists = examples.filter(
    (example) =>
      !FEATURED_IDS.includes(example.id as (typeof FEATURED_IDS)[number])
  );

  const selectExample = (example: PromptExample) => {
    onOpenChange(false);
    onSelectExample(example);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[82vh] max-w-[52rem]! gap-0 overflow-hidden border-border/80 bg-background/95 p-0 shadow-2xl backdrop-blur-xl [&_[data-slot=dialog-close]]:top-4 [&_[data-slot=dialog-close]]:right-4 [&_[data-slot=dialog-close]]:z-30 [&_[data-slot=dialog-close]]:size-8 [&_[data-slot=dialog-close]]:border [&_[data-slot=dialog-close]]:border-border/70 [&_[data-slot=dialog-close]]:bg-background/75 [&_[data-slot=dialog-close]]:text-foreground/70 [&_[data-slot=dialog-close]]:shadow-sm [&_[data-slot=dialog-close]]:backdrop-blur-sm hover:[&_[data-slot=dialog-close]]:bg-accent hover:[&_[data-slot=dialog-close]]:text-foreground"
        onPointerDownOutside={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogHeader className="relative z-20 overflow-hidden border-b px-5 py-4.5 text-left">
          <div
            className="bg-primary/10 pointer-events-none absolute -top-32 right-12 size-64 rounded-full blur-3xl dark:bg-blue-500/10"
            aria-hidden
          />
          <div className="relative flex items-start gap-3">
            <div className="border-primary/20 bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-xl border shadow-sm">
              <WandSparklesIcon className="size-[18px]" />
            </div>
            <div className="min-w-0">
              <div className="text-primary mb-1 text-[9px] font-semibold tracking-[0.2em] uppercase">
                New thread
              </div>
              <DialogTitle className="font-heading text-xl font-semibold tracking-tight">
                Choose how you want to begin
              </DialogTitle>
              <DialogDescription className="mt-1 max-w-xl text-xs leading-relaxed">
                Start clean, launch a capable agent, or pick a featured template.
                Everything can be changed after creation.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div
          aria-hidden
          className="pointer-events-none absolute -right-px -bottom-px z-0 hidden h-52 w-[56%] opacity-50 md:block dark:opacity-60"
        >
          <div
            className="absolute inset-0"
            style={{
              backgroundImage:
                "linear-gradient(to right, color-mix(in oklab, var(--foreground) 5%, transparent) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in oklab, var(--foreground) 5%, transparent) 1px, transparent 1px), radial-gradient(circle at 100% 100%, color-mix(in oklab, var(--primary) 12%, transparent), transparent 68%)",
              backgroundSize: "40px 40px, 40px 40px, 100% 100%",
              maskImage:
                "radial-gradient(ellipse at 100% 100%, black 18%, transparent 80%)",
              WebkitMaskImage:
                "radial-gradient(ellipse at 100% 100%, black 18%, transparent 80%)",
            }}
          />
        </div>

        <ScrollArea className="relative z-10 max-h-[calc(82vh-104px)]">
          <div className="space-y-5 p-5">
            <section aria-labelledby="quick-start-heading">
              <div className="mb-2.5 flex items-center justify-between">
                <h3
                  id="quick-start-heading"
                  className="text-muted-foreground text-[11px] font-semibold tracking-[0.16em] uppercase"
                >
                  Quick start
                </h3>
                <span className="text-muted-foreground text-[11px]">
                  Pick one to create immediately
                </span>
              </div>
              <div className="grid gap-2.5 md:grid-cols-3">
                {featured.map((example) => (
                  <FeaturedExample
                    key={example.id}
                    example={example}
                    onSelect={() => selectExample(example)}
                  />
                ))}
              </div>
            </section>

            <section aria-labelledby="specialists-heading">
              <div className="mb-2.5 flex items-center justify-between">
                <h3
                  id="specialists-heading"
                  className="text-muted-foreground flex items-center gap-2 text-[11px] font-semibold tracking-[0.16em] uppercase"
                >
                  <BlocksIcon className="size-3.5" />
                  Featured templates
                </h3>
                <span className="text-muted-foreground text-[11px]">
                  {specialists.length} templates
                </span>
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                {specialists.map((example) => (
                  <SpecialistExample
                    key={example.id}
                    example={example}
                    onSelect={() => selectExample(example)}
                  />
                ))}
              </div>
            </section>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

function FeaturedExample({
  example,
  onSelect,
}: {
  example: PromptExample;
  onSelect: () => void;
}) {
  const meta = FEATURE_META[example.id as keyof typeof FEATURE_META];

  return (
    <button
      type="button"
      className="group relative flex h-40 transform-gpu cursor-pointer flex-col overflow-hidden rounded-xl border border-white/10 bg-zinc-950 p-4 text-left text-white transition-[transform,translate,scale,border-color,box-shadow] duration-150 ease-out will-change-transform hover:z-10 hover:-translate-y-1 hover:scale-[1.03] hover:border-primary/70 hover:shadow-[0_0_28px_rgba(91,120,255,0.38)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2"
      onClick={onSelect}
    >
      <img
        src={FEATURE_ART[example.id as keyof typeof FEATURE_ART]}
        alt=""
        className="pointer-events-none absolute inset-0 size-full object-cover brightness-[0.85] saturate-[0.92] transition-[transform,scale,filter] duration-550 ease-out group-hover:scale-[1.12] group-hover:brightness-100 group-hover:saturate-100"
        draggable={false}
      />
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/5 via-black/35 to-black/95"
        aria-hidden
      />
      <span
        className="relative self-start rounded-full border border-white/15 bg-black/25 px-2 py-0.5 text-[8px] font-semibold tracking-[0.12em] text-white/70 uppercase backdrop-blur-md"
      >
        {meta.eyebrow}
      </span>
      <div className="relative mt-auto w-full min-w-0">
        <h4 className="font-heading text-base font-semibold tracking-tight text-white drop-shadow-[0_1px_2px_rgb(0_0_0/0.7)]">
          {_shortLabel(example)}
        </h4>
        <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-white/85 drop-shadow-[0_1px_2px_rgb(0_0_0/0.8)]">
          {_plainDescription(example)}
        </p>
      </div>
    </button>
  );
}

function SpecialistExample({
  example,
  onSelect,
}: {
  example: PromptExample;
  onSelect: () => void;
}) {
  const Icon = example.icon;

  return (
    <button
      type="button"
      className="group border-border/70 bg-card/30 hover:border-primary/25 hover:bg-accent/60 focus-visible:ring-primary/60 flex min-h-20 cursor-pointer items-center gap-3 rounded-xl border p-3 text-left transition-[border-color,background-color,box-shadow] hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
      onClick={onSelect}
    >
      <div className="border-border bg-background/70 text-muted-foreground group-hover:border-primary/20 group-hover:bg-primary/10 group-hover:text-primary flex size-9 shrink-0 items-center justify-center rounded-lg border transition-colors">
        <Icon className="size-4" />
      </div>
      <div className="min-w-0 grow">
        <h4 className="font-heading text-sm font-semibold">{example.label}</h4>
        <p className="text-muted-foreground mt-1 line-clamp-2 text-xs leading-relaxed">
          {_plainDescription(example)}
        </p>
      </div>
      <ArrowRightIcon className="text-muted-foreground/50 size-4 shrink-0 transition-[color,transform] group-hover:translate-x-0.5 group-hover:text-primary" />
    </button>
  );
}

function _shortLabel(example: PromptExample): string {
  return example.id === "blank" ? "Blank Thread" : example.label;
}

function _plainDescription(example: PromptExample): string {
  if (example.id === "blank") {
    return "A clean canvas with a simple assistant prompt you can customize.";
  }
  return example.description
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1");
}
