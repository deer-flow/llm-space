import { cn } from "@llm-space/ui/lib/utils";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@llm-space/ui/ui/empty";
import type { LucideIcon } from "lucide-react";
import { useLayoutEffect, useRef, type ReactNode } from "react";

const ICON_WALL_ROTATIONS = [-14, 8, -5, 13, -9, 4, 16, -11, 7, -3, 12, -16];

interface SettingsEmptyCapability {
  icon: LucideIcon;
  title: string;
  description: string;
}

export function SettingsEmptyState({
  icon: Icon,
  wallIcons,
  label,
  title,
  description,
  actions,
  capabilities,
}: {
  icon: LucideIcon;
  wallIcons: readonly LucideIcon[];
  label?: string;
  title: string;
  description: ReactNode;
  actions: ReactNode;
  capabilities: readonly SettingsEmptyCapability[];
}) {
  return (
    <div className="relative isolate flex h-full min-h-0 flex-col gap-4">
      <SettingsEmptyIconWall icons={wallIcons} />
      <Empty className="relative z-10 min-h-80 flex-1 border-0 p-8">
        <div className="relative z-10 flex w-full max-w-lg flex-col items-center gap-5 px-8 py-7">
          <EmptyHeader className="max-w-md gap-2.5">
            <EmptyMedia
              variant="icon"
              className="bg-background/45 text-primary ring-primary/20 dark:bg-background/35 size-11 rounded-xl shadow-sm ring-1 backdrop-blur-md"
            >
              <Icon className="size-5" />
            </EmptyMedia>
            {label ? (
              <span className="text-muted-foreground text-[10px] font-medium tracking-[0.16em] uppercase">
                {label}
              </span>
            ) : null}
            <EmptyTitle className="text-2xl">{title}</EmptyTitle>
            <EmptyDescription className="max-w-md">
              {description}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent className="max-w-lg gap-3">{actions}</EmptyContent>
        </div>
      </Empty>

      <div className="relative z-10 grid shrink-0 gap-3 sm:grid-cols-3">
        {capabilities.map((capability) => (
          <SettingsEmptyCapabilityCard
            key={capability.title}
            {...capability}
          />
        ))}
      </div>
    </div>
  );
}

function SettingsEmptyIconWall({ icons }: { icons: readonly LucideIcon[] }) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 -top-6 -bottom-6 overflow-hidden"
    >
      <div className="bg-primary/12 dark:bg-primary/8 absolute top-1/2 left-1/2 size-[30rem] -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl" />
      <SettingsEmptyIconWallLayer icons={icons} />
      <SettingsEmptyIconWallLayer icons={icons} blurred />
    </div>
  );
}

function SettingsEmptyIconWallLayer({
  icons,
  blurred = false,
}: {
  icons: readonly LucideIcon[];
  blurred?: boolean;
}) {
  const maskImage = blurred
    ? "radial-gradient(ellipse 72% 68% at 50% 50%, transparent 24%, rgba(0,0,0,0.45) 58%, black 100%)"
    : "radial-gradient(ellipse 58% 54% at 50% 50%, black 8%, rgba(0,0,0,0.9) 44%, transparent 82%)";
  const layerRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const layer = layerRef.current;
    if (!layer || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    const layerBounds = layer.getBoundingClientRect();
    const centerX = layerBounds.left + layerBounds.width / 2;
    const centerY = layerBounds.top + layerBounds.height / 2;
    const animations = Array.from(
      layer.querySelectorAll<HTMLElement>("[data-icon-wall-item]")
    ).map((item, index) => {
      const itemBounds = item.getBoundingClientRect();
      const offsetX = centerX - (itemBounds.left + itemBounds.width / 2);
      const offsetY = centerY - (itemBounds.top + itemBounds.height / 2);
      const timingSeed = _randomUnit(index * 19 + (blurred ? 41 : 7));

      return item.animate(
        [
          {
            opacity: 0,
            transform: `translate(${offsetX}px, ${offsetY}px) scale(0.16)`,
          },
          { opacity: 0.82, offset: 0.18 },
          { opacity: 1, transform: "translate(0, 0) scale(1)" },
        ],
        {
          duration: 850 + timingSeed * 380,
          delay: timingSeed * 180 + (blurred ? 70 : 0),
          easing: "cubic-bezier(0.16, 1, 0.3, 1)",
          fill: "both",
        }
      );
    });

    return () => animations.forEach((animation) => animation.cancel());
  }, [blurred]);

  return (
    <div
      ref={layerRef}
      className={cn(
        "absolute -inset-10",
        blurred
          ? "text-primary dark:text-foreground/80 opacity-[0.06] blur-[3px] dark:opacity-[0.04]"
          : "text-primary dark:text-foreground opacity-[0.18] dark:opacity-[0.12]"
      )}
      style={{ maskImage, WebkitMaskImage: maskImage }}
    >
      <div className="relative size-full">
        {Array.from({ length: 63 }, (_, index) => {
          const column = index % 9;
          const row = Math.floor(index / 9);
          const WallIcon =
            icons[Math.floor(_randomUnit(index * 13 + 3) * icons.length)];
          const opacity = 0.48 + _randomUnit(index * 17 + 5) * 0.18;
          const rotation =
            ICON_WALL_ROTATIONS[index % ICON_WALL_ROTATIONS.length];
          const scale = 0.82 + _randomUnit(index * 23 + 11) * 0.32;
          const left = _clamp(
            ((column + 0.5) / 9) * 100 +
              (_randomUnit(index * 29 + 17) - 0.5) * 7,
            2,
            98
          );
          const top = _clamp(
            ((row + 0.5) / 7) * 100 +
              (_randomUnit(index * 31 + 23) - 0.5) * 8,
            2,
            98
          );

          return (
            <span
              // This is a fixed decorative field; its position is its identity.
              key={index}
              data-icon-wall-item
              className="absolute -mt-3.5 -ml-3.5 block size-7 will-change-transform"
              style={{ left: `${left}%`, top: `${top}%` }}
            >
              <WallIcon
                className="size-7"
                strokeWidth={1.45}
                style={{
                  opacity,
                  transform: `rotate(${rotation}deg) scale(${scale})`,
                }}
              />
            </span>
          );
        })}
      </div>
    </div>
  );
}

function _randomUnit(seed: number) {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

function _clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function SettingsEmptyCapabilityCard({
  icon: Icon,
  title,
  description,
}: SettingsEmptyCapability) {
  return (
    <div className="bg-card/80 dark:bg-card/50 flex min-w-0 items-start gap-3 rounded-xl border p-4 shadow-sm dark:shadow-none">
      <div className="bg-muted text-foreground flex size-8 shrink-0 items-center justify-center rounded-lg">
        <Icon className="size-4" />
      </div>
      <div className="flex min-w-0 flex-col gap-1">
        <h3 className="text-sm font-medium">{title}</h3>
        <p className="text-muted-foreground text-xs leading-relaxed">
          {description}
        </p>
      </div>
    </div>
  );
}
