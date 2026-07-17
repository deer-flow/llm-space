import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ArrowRightIcon } from '@/landing/components/icons';
import { cn } from '@/landing/lib/utils';

export interface Slide {
  /** Public-path image, e.g. `images/screenshot-01.png`. */
  src: string;
  /** Short marketing headline shown under the frame. */
  title: string;
  /** One-sentence caption expanding on the headline. */
  caption: string;
  /** Descriptive alt text for the screenshot. */
  alt: string;
}

interface ScreenshotCarouselProps {
  slides: Slide[];
  /** Native pixel size of the screenshots, for layout stability. */
  width: number;
  height: number;
  /** Advance interval in ms; set 0 to disable autoplay. */
  interval?: number;
  className?: string;
}

/**
 * A screenshot gallery built on native CSS scroll-snap: swipe on touch,
 * scroll/drag on desktop, plus arrows and dot indicators. A caption strip below
 * the frame swaps with the active slide. Autoplays on an interval, pausing on
 * any pointer interaction, and honors reduced-motion.
 */
export function ScreenshotCarousel({
  slides,
  width,
  height,
  interval = 5500,
  className,
}: ScreenshotCarouselProps) {
  const reduceMotion = useReducedMotion();
  const trackRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const count = slides.length;

  // Scroll a given slide into view. Programmatic scrolls still fire `scroll`,
  // so `active` stays in sync via the scroll handler below.
  const scrollTo = useCallback(
    (index: number, smooth = true) => {
      const track = trackRef.current;
      if (!track) return;
      const next = ((index % count) + count) % count;
      track.scrollTo({
        left: next * track.clientWidth,
        behavior: smooth && !reduceMotion ? 'smooth' : 'auto',
      });
    },
    [count, reduceMotion]
  );

  // Derive the active slide from scroll position — this is the single source of
  // truth, so manual swipes, arrows, dots, and autoplay all agree.
  const handleScroll = useCallback(() => {
    const track = trackRef.current;
    if (!track || track.clientWidth === 0) return;
    const index = Math.round(track.scrollLeft / track.clientWidth);
    setActive((prev) => (prev === index ? prev : index));
  }, []);

  // Autoplay — skipped when paused, when a single slide, or when the user
  // prefers reduced motion.
  useEffect(() => {
    if (paused || reduceMotion || interval <= 0 || count <= 1) return;
    const id = window.setTimeout(() => scrollTo(active + 1), interval);
    return () => window.clearTimeout(id);
  }, [active, paused, reduceMotion, interval, count, scrollTo]);

  const slide = slides[active];
  if (!slide) return null;

  return (
    <div
      className={cn('relative', className)}
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onPointerDown={() => setPaused(true)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      role="group"
      aria-roledescription="carousel"
      aria-label="LLM Space product screenshots"
    >
      {/* Soft brand halo behind the frame */}
      <div className="bg-brand/10 pointer-events-none absolute -inset-x-8 -top-10 bottom-6 rounded-[48px] blur-[120px]" />

      <div className="group relative overflow-hidden rounded-xl">
        {/* Snap track — one screenshot per viewport, swipe/scroll to advance.
            Scrollbar is visually hidden; the dots serve as the indicator. */}
        <div
          ref={trackRef}
          onScroll={handleScroll}
          className={cn(
            'flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain',
            '[-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
          )}
        >
          {slides.map((s, i) => (
            <div
              key={s.src}
              className="w-full shrink-0 snap-center"
              style={{ aspectRatio: `${width} / ${height}` }}
            >
              <img
                src={`${import.meta.env.BASE_URL}${s.src}`}
                alt={s.alt}
                width={width}
                height={height}
                loading={i === 0 ? 'eager' : 'lazy'}
                draggable={false}
                className="block h-full w-full object-cover"
              />
            </div>
          ))}
        </div>

        {/* Prev / next controls — shown from `sm` up (touch users swipe). */}
        <CarouselArrow
          direction="prev"
          onClick={() => scrollTo(active - 1)}
          disabled={count <= 1}
        />
        <CarouselArrow
          direction="next"
          onClick={() => scrollTo(active + 1)}
          disabled={count <= 1}
        />
      </div>

      {/* Caption + dots below the frame */}
      <div className="mt-1 flex flex-col items-center gap-5">
        <AnimatePresence mode="wait">
          <motion.div
            key={slide.src}
            initial={{ opacity: 0, y: reduceMotion ? 0 : 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: reduceMotion ? 0 : -8 }}
            transition={{ duration: reduceMotion ? 0 : 0.35 }}
            className="mx-auto max-w-2xl text-center"
          >
            <h3 className="text-lg font-semibold tracking-tight text-white sm:text-xl">
              {slide.title}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-balance text-neutral-400 sm:text-base">
              {slide.caption}
            </p>
          </motion.div>
        </AnimatePresence>

        <div className="flex items-center gap-2.5">
          {slides.map((s, i) => (
            <button
              key={s.src}
              type="button"
              onClick={() => scrollTo(i)}
              aria-label={`Show slide ${i + 1}: ${s.title}`}
              aria-current={i === active}
              className={cn(
                'h-1.5 cursor-pointer rounded-full transition-all duration-300',
                i === active
                  ? 'bg-brand w-7'
                  : 'w-1.5 bg-white/20 hover:bg-white/40'
              )}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function CarouselArrow({
  direction,
  onClick,
  disabled,
}: {
  direction: 'prev' | 'next';
  onClick: () => void;
  disabled?: boolean;
}) {
  const isPrev = direction === 'prev';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={isPrev ? 'Previous screenshot' : 'Next screenshot'}
      className={cn(
        'absolute top-1/2 z-10 hidden h-10 w-10 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full sm:flex',
        'border border-white/10 bg-black/50 text-white/80 backdrop-blur-md',
        'opacity-0 transition-all duration-200 group-hover:opacity-100',
        'hover:border-white/25 hover:bg-black/70 hover:text-white',
        'focus-visible:opacity-100 disabled:pointer-events-none disabled:opacity-0',
        isPrev ? 'left-3' : 'right-3'
      )}
    >
      <ArrowRightIcon className={cn('h-4 w-4', isPrev && 'rotate-180')} />
    </button>
  );
}
