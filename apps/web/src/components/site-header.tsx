import { BorderBeamButton } from "@/landing/components/border-beam-button";
import { GitHubIcon } from "@/landing/components/icons";
import { LanguageSwitcher } from "@/landing/components/language-switcher";
import { useI18n } from "@/landing/lib/i18n";
import {
  DOCS_URL,
  GITHUB_URL,
  QUICK_START_URL,
  ZH_DOCS_URL,
} from "@/landing/lib/links";

/**
 * The site top-nav as a static bar (logo + docs links + language switcher +
 * GitHub CTA), for pages other than the landing. Mirrors the landing header's
 * content but doesn't float/animate on scroll. Requires an `I18nProvider`
 * ancestor.
 */
export function SiteHeader() {
  const { t, lang } = useI18n();

  const navLinks =
    lang === "zh"
      ? [
          { label: t.nav.quickStart, href: ZH_DOCS_URL },
          { label: t.nav.userManual, href: ZH_DOCS_URL },
        ]
      : [
          { label: t.nav.quickStart, href: QUICK_START_URL },
          { label: t.nav.userManual, href: DOCS_URL },
        ];

  return (
    <header className="shrink-0 border-b border-white/10 bg-black/40 backdrop-blur">
      <div className="mx-auto flex w-full max-w-[1400px] items-center justify-between px-4 py-3.5 sm:px-10">
        <a href={import.meta.env.BASE_URL} className="flex items-center gap-2 sm:gap-3">
          <img
            src={`${import.meta.env.BASE_URL}images/icon.png`}
            alt=""
            className="h-9 w-9 shadow-lg shadow-black/40"
          />
          <span className="text-base font-semibold tracking-tight text-white">
            LLM Space
          </span>
        </a>
        <div className="flex items-center gap-4 sm:gap-7">
          <nav className="hidden items-center gap-7 text-sm text-neutral-400 sm:flex">
            {navLinks.map((link) => (
              <a
                key={link.label}
                href={link.href}
                target="_blank"
                rel="noreferrer"
                className="transition-colors hover:text-white"
              >
                {link.label}
              </a>
            ))}
          </nav>
          <LanguageSwitcher />
          <BorderBeamButton
            asChild
            size="sm"
            duration={6}
            className="gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-white hover:border-white/30 hover:bg-white/10"
            borderBeamClassName="rounded-full"
          >
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noreferrer"
              aria-label={t.header.star}
            >
              <GitHubIcon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t.header.star}</span>
            </a>
          </BorderBeamButton>
        </div>
      </div>
    </header>
  );
}
