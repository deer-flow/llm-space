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

import { useI18n } from "@/i18n/i18n-provider";
import { formatMessage } from "@/i18n/messages";

const FEATURED_IDS = ["blank", "general-agent", "deep-research"] as const;

const FEATURE_ART: Record<(typeof FEATURED_IDS)[number], string> = {
  blank: "/images/thread-starters/blank.jpg",
  "general-agent": "/images/thread-starters/general-agent.jpg",
  "deep-research": "/images/thread-starters/deep-research.jpg",
};

/** Message-tree key for each featured card's eyebrow badge. */
const FEATURE_EYEBROW_KEYS = {
  blank: "eyebrowBlank",
  "general-agent": "eyebrowRecommended",
  "deep-research": "eyebrowResearch",
} as const;

/**
 * Chinese display names and plain-text descriptions for the template cards,
 * keyed by example id. Presentation layer only: the `PROMPT_EXAMPLES` catalog
 * (and every system prompt, seed message, and filename it carries) stays
 * untouched — `fileStem` continues to drive new-thread filenames.
 */
export const EXAMPLE_LOCALIZATIONS_ZH: Record<
  string,
  { label: string; description: string }
> = {
  blank: {
    label: "空白 Thread",
    description: "一块干净的画布，附带可自定义的简单助手提示词。",
  },
  "general-agent": {
    label: "通用 Agent",
    description: "类似 DeerFlow 的助手，支持编程、深度研究与更多能力。",
  },
  "deep-research": {
    label: "深度研究",
    description: "结构化的调研者，围绕主题规划并深入研究。",
  },
  translation: {
    label: "翻译",
    description: "翻译提示词，专注于保留原意与文风。",
  },
  "deep-wiki": {
    label: "Deep Wiki",
    description: "带来源引用的长文知识库回答提示词。",
  },
  "compact-memory": {
    label: "记忆压缩",
    description: "记忆压缩提示词，保持有用上下文简洁。",
  },
  "short-drama-writer": {
    label: "短剧编剧",
    description: "以高冲突、快节奏的短剧结构，生成可制作的 JSON 故事。",
  },
  "meta-prompt": {
    label: "元提示词",
    description: "提示词写作助手，用于改进指令。",
  },
  "meta-image-prompt": {
    label: "图像生成元提示词",
    description: "为图像生成构建结构化简报的提示词生成器。",
  },
};

/** The localized display label for a template card (falls back to the catalog). */
function _displayLabel(example: PromptExample, zh: boolean): string {
  if (example.id === "blank") {
    // The featured blank card has always used a shorter title than the catalog.
    return zh
      ? (EXAMPLE_LOCALIZATIONS_ZH.blank?.label ?? "Blank Thread")
      : "Blank Thread";
  }
  return zh
    ? (EXAMPLE_LOCALIZATIONS_ZH[example.id]?.label ?? example.label)
    : example.label;
}

/** The localized plain-text description for a template card. */
function _displayDescription(example: PromptExample, zh: boolean): string {
  if (zh) {
    const localized = EXAMPLE_LOCALIZATIONS_ZH[example.id]?.description;
    if (localized) {
      return localized;
    }
  }
  return example.description
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1");
}

export function StartFromExampleDialog({
  open,
  onOpenChange,
  onSelectExample,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectExample: (example: PromptExample) => void;
}) {
  const { lang, t } = useI18n();
  const zh = lang === "zh";
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
        className="max-h-[82vh] max-w-[52rem]! gap-0 overflow-hidden border-border/80 bg-background/95 p-0 shadow-2xl backdrop-blur-xl [&_[data-slot=dialog-close]]:top-4 [&_[data-slot=dialog-close]]:right-4 [&_[data-slot=dialog-close]]:z-30 [&_[data-slot=dialog-close]]:size-8 [&_[data-slot=dialog-close]]:!rounded-full [&_[data-slot=dialog-close]]:bg-transparent [&_[data-slot=dialog-close]]:text-foreground/70 [&_[data-slot=dialog-close]]:shadow-none hover:[&_[data-slot=dialog-close]]:bg-accent hover:[&_[data-slot=dialog-close]]:text-foreground"
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
                {t.startFromExample.eyebrow}
              </div>
              <DialogTitle className="font-heading text-xl font-semibold tracking-tight">
                {t.startFromExample.title}
              </DialogTitle>
              <DialogDescription className="mt-1 max-w-xl text-xs leading-relaxed">
                {t.startFromExample.description}
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
                  {t.startFromExample.quickStart}
                </h3>
                <span className="text-muted-foreground text-[11px]">
                  {t.startFromExample.pickOneToCreate}
                </span>
              </div>
              <div className="grid gap-2.5 md:grid-cols-3">
                {featured.map((example) => (
                  <FeaturedExample
                    key={example.id}
                    example={example}
                    zh={zh}
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
                  {t.startFromExample.featuredTemplates}
                </h3>
                <span className="text-muted-foreground text-[11px]">
                  {formatMessage(t.startFromExample.templatesCount, {
                    count: specialists.length,
                  })}
                </span>
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                {specialists.map((example) => (
                  <SpecialistExample
                    key={example.id}
                    example={example}
                    zh={zh}
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
  zh,
  onSelect,
}: {
  example: PromptExample;
  zh: boolean;
  onSelect: () => void;
}) {
  const { t } = useI18n();
  const eyebrowKey =
    FEATURE_EYEBROW_KEYS[example.id as keyof typeof FEATURE_EYEBROW_KEYS];

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
        {t.startFromExample[eyebrowKey]}
      </span>
      <div className="relative mt-auto w-full min-w-0">
        <h4 className="font-heading text-base font-semibold tracking-tight text-white drop-shadow-[0_1px_2px_rgb(0_0_0/0.7)]">
          {_displayLabel(example, zh)}
        </h4>
        <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-white/85 drop-shadow-[0_1px_2px_rgb(0_0_0/0.8)]">
          {_displayDescription(example, zh)}
        </p>
      </div>
    </button>
  );
}

function SpecialistExample({
  example,
  zh,
  onSelect,
}: {
  example: PromptExample;
  zh: boolean;
  onSelect: () => void;
}) {
  const Icon = example.icon;

  return (
    <button
      type="button"
      className="group border-border/70 bg-card/30 hover:border-primary/25 hover:bg-accent/60 focus-visible:ring-primary/60 relative flex min-h-20 transform-gpu cursor-pointer items-center gap-3 rounded-xl border p-3 text-left transition-[transform,border-color,background-color,box-shadow] duration-100 ease-out hover:z-10 hover:scale-[1.015] hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 active:scale-[0.99]"
      onClick={onSelect}
    >
      <div className="border-border bg-background/70 text-muted-foreground group-hover:border-primary/20 group-hover:bg-primary/10 group-hover:text-primary flex size-9 shrink-0 items-center justify-center rounded-lg border transition-colors">
        <Icon className="size-4" />
      </div>
      <div className="min-w-0 grow">
        <h4 className="font-heading text-sm font-semibold">
          {_displayLabel(example, zh)}
        </h4>
        <p className="text-muted-foreground mt-1 line-clamp-2 text-xs leading-relaxed">
          {_displayDescription(example, zh)}
        </p>
      </div>
      <ArrowRightIcon className="text-muted-foreground/50 size-4 shrink-0 transition-[color,transform] group-hover:translate-x-0.5 group-hover:text-primary" />
    </button>
  );
}
