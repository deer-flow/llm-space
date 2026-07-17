import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/landing/lib/utils";

interface MarqueeProps extends ComponentPropsWithoutRef<"div"> {
  /** Scroll right-to-left instead of left-to-right. */
  reverse?: boolean;
  /** Pause the animation while the pointer is over the row. */
  pauseOnHover?: boolean;
  /** How many times to repeat the children so the track never shows a gap. */
  repeat?: number;
}

/**
 * A single horizontally-scrolling row. Children are duplicated `repeat` times
 * and the track translates by exactly one copy's width, so the loop is seamless.
 * Animation timing lives in CSS vars (`--duration`, `--gap`) — override per row
 * with utilities like `[--duration:32s]`. Based on the magicui Marquee.
 */
export function Marquee({
  className,
  reverse,
  pauseOnHover,
  repeat = 4,
  children,
  ...props
}: MarqueeProps) {
  return (
    <div
      {...props}
      className={cn(
        "group flex overflow-hidden [--duration:40s] [--gap:1rem] [gap:var(--gap)]",
        className
      )}
    >
      {Array.from({ length: repeat }, (_, i) => (
        <div
          key={i}
          className={cn(
            "flex shrink-0 flex-row justify-around [gap:var(--gap)]",
            "animate-marquee",
            pauseOnHover && "group-hover:[animation-play-state:paused]",
            reverse && "[animation-direction:reverse]"
          )}
        >
          {children}
        </div>
      ))}
    </div>
  );
}
