import { useEffect, useRef, useState } from 'react';
import { CheckIcon, GlobeIcon } from '@/landing/components/icons';
import { capture } from '@/landing/lib/analytics';
import { LANGUAGES, useI18n, type Lang } from '@/landing/lib/i18n';
import { cn } from '@/landing/lib/utils';

// A compact language menu that works on every breakpoint (it's just a button
// that toggles an absolutely-positioned panel — no viewport assumptions). The
// trigger shows a globe plus the active language's native label; the panel
// lists each language with a check on the current one.
export function LanguageSwitcher() {
  const { lang, setLang, t } = useI18n();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Close on outside click or Escape so the panel behaves like a real menu.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const active = LANGUAGES.find((l) => l.code === lang) ?? LANGUAGES[0];

  const choose = (code: Lang) => {
    if (code !== lang) {
      setLang(code);
      capture('language_change', { lang: code });
    }
    setOpen(false);
  };

  return (
    <div ref={rootRef} className="relative flex items-center">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t.header.language}
        className="inline-flex cursor-pointer items-center gap-1.5 text-sm leading-none text-neutral-400 transition-colors hover:text-white"
      >
        <GlobeIcon className="h-4 w-4 shrink-0" />
        <span className="leading-none">{active.label}</span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-2 min-w-[9rem] overflow-hidden rounded-xl border border-white/10 bg-neutral-900/95 p-1 shadow-xl shadow-black/50 backdrop-blur-lg"
        >
          {LANGUAGES.map((l) => (
            <button
              key={l.code}
              type="button"
              role="menuitemradio"
              aria-checked={l.code === lang}
              onClick={() => choose(l.code)}
              className={cn(
                'flex w-full cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors',
                l.code === lang
                  ? 'text-white'
                  : 'text-neutral-300 hover:bg-white/10 hover:text-white'
              )}
            >
              <span>{l.label}</span>
              {l.code === lang && <CheckIcon className="h-4 w-4 text-brand" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
