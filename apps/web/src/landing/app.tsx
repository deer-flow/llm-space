import { Fragment, useEffect, useState } from 'react';
import { motion, useScroll, useTransform } from 'motion/react';
import { ArrowDownIcon, ArrowRightIcon, GitHubIcon } from '@/landing/components/icons';
import { capture } from '@/landing/lib/analytics';
import {
  HeroColorPanelsRoot,
  HeroColorPanelsVisual,
} from '@/landing/components/ui/hero-color-panel';
import { Marquee } from '@/landing/components/ui/marquee';
import {
  ScreenshotCarousel,
  type Slide,
} from '@/landing/components/ui/screenshot-carousel';
import { BorderBeamButton } from '@/landing/components/border-beam-button';
import { LanguageSwitcher } from '@/landing/components/language-switcher';
import { RELEASES_URL, type Build } from '@/landing/lib/releases';
import { useReleases } from '@/landing/lib/use-releases';
import { PROVIDERS, type ProviderLogo } from '@/landing/lib/providers';
import { useI18n } from '@/landing/lib/i18n';
import {
  DOCS_URL,
  GITHUB_URL,
  QUICK_START_URL,
  ZH_DOCS_URL,
} from '@/landing/lib/links';
import RippleGrid from './components/ui/ripple-grid';

// The showcase screenshots, in order. Their copy (title/caption/alt) is
// translated per-locale in `t.showcase.slides` and zipped with these sources.
const SHOWCASE_IMAGES = [
  'images/screenshot-01.png',
  'images/screenshot-02.png',
  'images/screenshot-03.png',
  'images/screenshot-04.png',
  'images/screenshot-05.png',
  'images/screenshot-06.png',
  'images/screenshot-07.png',
  'images/screenshot-08.png',
];

// Native screenshot dimensions — used to keep the carousel frame stable.
const SHOWCASE_IMAGE_WIDTH = 2784;
const SHOWCASE_IMAGE_HEIGHT = 1892;

// One shared entrance: children fade up in sequence for a calm, orchestrated
// page load rather than scattered micro-animations.
const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } },
};

const item = {
  hidden: { opacity: 0, y: 16 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] as const },
  },
};

export function App() {
  const releases = useReleases();
  const primary = releases.stable;
  const { t, lang } = useI18n();

  // The landing is a long scrolling page, so restore native overscroll
  // (index.html locks it to `none` globally for the fixed-height pages). Revert
  // on unmount so navigating to the viewer gets the locked behavior again.
  useEffect(() => {
    const el = document.documentElement;
    el.style.overscrollBehavior = 'auto';
    return () => {
      el.style.overscrollBehavior = '';
    };
  }, []);

  return (
    // Near-black marketing background, scoped to the landing (the shared globals
    // dark theme is a lighter gray). `text-[#ededf0]` restores the landing's
    // default foreground without redefining the app-wide token.
    <div className="dark relative min-h-screen overflow-x-hidden bg-[#08080a] text-[#ededf0]">
      <Header />
      <HeroPlanet />
      <div className="relative z-10 mx-auto w-full max-w-6xl px-6 sm:px-10">
        {/* Spacer reserving the fixed header's height */}
        <div aria-hidden className="h-[5rem] sm:h-[6.5rem]" />

        {/* Hero — owns the first screen; wider side padding on mobile only */}
        <section className="relative flex min-h-[calc(100svh-6rem)] flex-col px-6 sm:px-0">
          {/* Decorative glow behind the shader */}
          <div className="bg-brand/12 pointer-events-none absolute top-[45%] right-[6%] h-[520px] w-[620px] -translate-y-1/2 rounded-full blur-[140px]" />

          <HeroColorPanelsRoot
            className="flex flex-1 items-center !overflow-visible pb-32 lg:pb-48"
            srTitle="Build, trace, and debug agents with LLM Space"
          >
            <motion.div
              variants={container}
              initial="hidden"
              animate="show"
              className="grid w-full items-center gap-10 md:grid-cols-[1.05fr_1fr] md:gap-8"
            >
              {/* Left: content — centered on mobile, left-aligned from md up */}
              <div className="flex flex-col items-center text-center md:items-start md:text-left">
                <motion.div variants={item}>
                  <Badge>{t.hero.badge}</Badge>
                </motion.div>

                <motion.h1
                  variants={item}
                  className={`mt-7 text-3xl leading-[1.1] font-semibold tracking-tight text-white sm:text-4xl xl:text-5xl ${
                    // zh runs longer and carries an explicit break, so give it a
                    // wider cap and skip text-balance (which would re-wrap it).
                    lang === 'zh' ? 'max-w-2xl' : 'max-w-lg text-balance'
                  }`}
                >
                  {t.hero.titleBefore}
                  <span className="wordmark-gradient">LLM Space</span>
                  {t.hero.titleAfter.split('\n').map((part, i) => (
                    <Fragment key={i}>
                      {i > 0 && <br />}
                      {part}
                    </Fragment>
                  ))}
                </motion.h1>

                <motion.p
                  variants={item}
                  className="mt-6 max-w-xl text-lg leading-relaxed text-neutral-400 sm:text-xl"
                >
                  {t.hero.subtitle}
                </motion.p>

                <motion.div
                  variants={item}
                  className="mt-10 flex w-full flex-col items-stretch gap-3 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center"
                >
                  <DownloadButton build={primary?.appleSilicon} />
                  <IntelButton build={primary?.intel} />
                </motion.div>

                <motion.p
                  variants={item}
                  className="mt-4 text-xs text-neutral-500"
                >
                  {t.hero.requirements}
                </motion.p>

                <motion.div
                  variants={item}
                  className="mt-6 hidden flex-wrap items-center gap-x-5 gap-y-2 font-mono text-xs text-neutral-500 sm:flex"
                >
                  {primary && (
                    <span className="inline-flex items-center gap-2 rounded-full border border-white/[0.07] px-3 py-1.5">
                      <Dot className="bg-teal-400" />
                      {t.hero.latest} · {primary.version}
                    </span>
                  )}
                  <a
                    href={RELEASES_URL}
                    className="font-sans text-sm text-neutral-400 underline-offset-4 transition-colors hover:text-neutral-200 hover:underline"
                  >
                    {t.hero.seeReleases}
                  </a>
                </motion.div>
              </div>

              {/* Right: the color-panels shader — desktop only (original layout) */}
              <motion.div
                variants={item}
                className="hidden md:flex md:justify-end"
              >
                <HeroColorPanelsVisual className="!block w-full" />
              </motion.div>
            </motion.div>
          </HeroColorPanelsRoot>
        </section>

        <ShowcaseSection />

        <ProvidersSection />

        <CommunitySection />

        <Footer />
      </div>
    </div>
  );
}

// A faint planet horizon echoing the app icon's blue-violet rim light. It's
// pinned to the viewport (fixed) rather than scrolling with the page: as the
// user scrolls it slowly zooms out and fades to 0, fully gone by the time the
// second section is ~25% into view (~1.25 viewport heights of scroll).
function HeroPlanet() {
  const { scrollY } = useScroll();
  const [vh, setVh] = useState(800);

  useEffect(() => {
    const update = () => setVh(window.innerHeight);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  const end = vh * 1.25;
  const opacity = useTransform(scrollY, [0, end], [1, 0]);
  const scale = useTransform(scrollY, [0, end], [1, 0.7]);

  return (
    <motion.div
      aria-hidden
      style={{ opacity }}
      className="pointer-events-none fixed inset-x-0 bottom-0 z-0 h-screen overflow-hidden"
    >
      {/* Scaled group — only the (over-wide) dome + halo zoom out, so shrinking
          never exposes the viewport edges. */}
      <motion.div style={{ scale }} className="absolute inset-0 origin-bottom">
        {/* atmospheric halo above the rim — wider & flatter on mobile so the
            narrow viewport still reads as a broad planet, not a tight bubble */}
        <div className="absolute bottom-0 left-1/2 h-[38vh] w-[260vw] -translate-x-1/2 translate-y-[44%] rounded-[50%] bg-[radial-gradient(closest-side,rgba(129,110,255,0.16),transparent_72%)] blur-2xl sm:h-[45vh] sm:w-[130vw] sm:translate-y-[48%]" />
        {/* the dome + rim light — mobile gets a much wider, shallower ellipse so
            the rim sweeps gently across the screen instead of curving tightly */}
        <div className="absolute bottom-0 left-1/2 h-[115vh] w-[440vw] -translate-x-1/2 translate-y-[90%] rounded-[50%] bg-[radial-gradient(120%_120%_at_50%_0%,rgba(12,12,26,0.65),rgba(5,5,12,0)_58%)] shadow-[inset_0_2px_1px_-1px_rgba(214,208,255,0.55),inset_0_5px_60px_-14px_rgba(140,120,255,0.6),0_-14px_120px_-40px_rgba(129,110,255,0.35)] sm:h-[130vh] sm:w-[200vw] sm:translate-y-[92%]" />
      </motion.div>
      {/* fade the base to the page background so the fold meets the next
          section cleanly — kept unscaled so it always spans full width */}
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-[#08080a]" />
    </motion.div>
  );
}

function Header() {
  const [scrolled, setScrolled] = useState(false);
  const { t, lang } = useI18n();

  // Chinese visitors get the Feishu wiki for both docs links.
  const navLinks =
    lang === 'zh'
      ? [
          { label: t.nav.quickStart, href: ZH_DOCS_URL },
          { label: t.nav.userManual, href: ZH_DOCS_URL },
        ]
      : [
          { label: t.nav.quickStart, href: QUICK_START_URL },
          { label: t.nav.userManual, href: DOCS_URL },
        ];

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 border-b transition-all duration-300 ${
        scrolled
          ? 'border-white/10 bg-black/70 shadow-lg shadow-black/40 backdrop-blur-lg'
          : 'border-transparent bg-transparent shadow-none'
      }`}
    >
      <div
        className={`mx-auto flex w-full max-w-6xl items-center justify-between px-4 transition-all duration-300 sm:px-10 ${
          scrolled ? 'py-2' : 'py-5 sm:py-7'
        }`}
      >
        <a href="#" className="flex items-center gap-2 sm:gap-3">
          <img
            src={`${import.meta.env.BASE_URL}images/icon.png`}
            alt=""
            className={`shadow-lg shadow-black/40 transition-all duration-300 ${
              scrolled ? 'h-8 w-8' : 'h-12 w-12'
            }`}
          />
          <span
            className={`text-base font-semibold tracking-tight text-white transition-opacity duration-300 ${
              scrolled ? 'opacity-0 sm:opacity-100' : 'opacity-100'
            }`}
          >
            LLM Space
          </span>
        </a>
        <div className="flex items-center gap-4 sm:gap-7">
          {/* Text links need a mobile menu we don't have yet — desktop only */}
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
          {/* Language menu — visible on every breakpoint (mobile included) */}
          <LanguageSwitcher />
          {/* Star CTA stays visible on every breakpoint. On the narrowest
              screens the label drops so the header still fits the language
              menu; the icon-only pill keeps the CTA present. */}
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

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <a
      href="https://github.com/bytedance/deer-flow"
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-2.5 rounded-full border border-white/[0.08] bg-white/[0.03] py-1.5 pr-4 pl-3 text-xs tracking-wide text-neutral-300 transition-colors hover:border-white/20 hover:text-neutral-100"
    >
      <Dot className="bg-teal-400" ping />
      {children}
    </a>
  );
}

function DownloadButton({ build }: { build?: Build }) {
  const { t } = useI18n();
  return (
    <a
      href={build?.url ?? RELEASES_URL}
      onClick={() =>
        capture('download_click', {
          channel: 'apple_silicon',
          has_build: Boolean(build?.url),
        })
      }
      className="group shadow-brand/60 relative inline-flex w-full items-center justify-center gap-2 rounded-full px-5 py-2.5 text-[13px] font-semibold text-white shadow-[0_6px_24px_-8px] transition-transform hover:-translate-y-0.5 sm:w-auto"
      style={{
        backgroundImage:
          'linear-gradient(180deg, oklch(0.7 0.16 275) 0%, oklch(0.6 0.17 268) 100%)',
      }}
    >
      <span>{t.hero.download}</span>
      <span className="text-white/70">· {t.hero.appleSilicon}</span>
      <ArrowDownIcon className="h-3.5 w-3.5 opacity-80" />
    </a>
  );
}

function IntelButton({ build }: { build?: Build }) {
  const { t } = useI18n();
  return (
    <a
      href={build?.url ?? RELEASES_URL}
      onClick={() =>
        capture('download_click', {
          channel: 'intel',
          has_build: Boolean(build?.url),
        })
      }
      className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-5 py-2.5 text-[13px] font-medium text-neutral-200 backdrop-blur-lg transition-colors hover:border-white/20 hover:bg-white/[0.06] sm:w-auto"
    >
      <span className="text-neutral-100">{t.hero.intel}</span>
    </a>
  );
}

function ProviderChip({ provider }: { provider: ProviderLogo }) {
  return (
    <div className="mx-2 flex items-center gap-2.5 rounded-full border border-white/8 bg-white/5 px-4 py-2.5 whitespace-nowrap text-neutral-300 transition-colors hover:border-white/20 hover:text-neutral-100">
      {provider.Icon ? <provider.Icon size={22} /> : null}
      <span className="text-sm font-medium">{provider.name}</span>
    </div>
  );
}

function ProvidersSection() {
  const { t } = useI18n();
  const mid = Math.ceil(PROVIDERS.length / 2);
  const rowOne = PROVIDERS.slice(0, mid);
  const rowTwo = PROVIDERS.slice(mid);

  return (
    <section className="relative flex min-h-[calc(100svh-6rem)] flex-col justify-center overflow-hidden py-24 sm:py-32">
      {/* Animated RippleGrid background */}
      <div className="absolute inset-0 translate-y-[-14%] -z-10">
        <RippleGrid enableRainbow gridRotation={45} opacity={0.35} />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-100px' }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 mx-auto max-w-4xl text-center"
      >
        <h2 className="text-3xl leading-[1.1] font-semibold tracking-tight text-balance text-white sm:text-4xl xl:text-5xl">
          {t.providers.title}
        </h2>
        <p className="mx-auto mt-4 max-w-3xl text-lg leading-relaxed text-balance text-neutral-400 sm:text-xl">
          {t.providers.subtitle}
        </p>
      </motion.div>

      <div className="relative z-10 mt-30 mask-[linear-gradient(to_right,transparent,black_8%,black_92%,transparent)]">
        <Marquee pauseOnHover className="[--duration:46s]">
          {rowOne.map((provider) => (
            <ProviderChip key={provider.name} provider={provider} />
          ))}
        </Marquee>
        <Marquee reverse pauseOnHover className="mt-4 [--duration:46s]">
          {rowTwo.map((provider) => (
            <ProviderChip key={provider.name} provider={provider} />
          ))}
        </Marquee>
      </div>
    </section>
  );
}

function ShowcaseSection() {
  const { t, lang } = useI18n();
  const docsUrl = lang === 'zh' ? ZH_DOCS_URL : QUICK_START_URL;

  const slides: Slide[] = t.showcase.slides.map((slide, i) => ({
    src: SHOWCASE_IMAGES[i]!,
    ...slide,
  }));

  return (
    <section className="relative py-24 sm:py-32">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-100px' }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        className="mx-auto max-w-4xl text-center"
      >
        <h2 className="text-3xl leading-[1.1] font-semibold tracking-tight text-balance text-white sm:text-4xl xl:text-5xl">
          {t.showcase.titleLine1}
          <br />
          {t.showcase.titleLine2}
        </h2>
        <p className="mx-auto mt-4 hidden max-w-3xl text-lg leading-relaxed text-balance text-neutral-400 sm:block sm:text-xl">
          {t.showcase.subtitle}
        </p>
        <div className="mt-7 flex justify-center">
          <a
            href={docsUrl}
            target="_blank"
            rel="noreferrer"
            className="group inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-5 py-2.5 text-[13px] font-medium text-neutral-200 transition-colors hover:border-white/20 hover:bg-white/[0.06]"
          >
            {t.showcase.learnMore}
            <ArrowRightIcon className="h-3.5 w-3.5 opacity-70 transition-transform group-hover:translate-x-0.5" />
          </a>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-80px' }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        className="relative mt-10 sm:mt-12"
      >
        <ScreenshotCarousel
          slides={slides}
          width={SHOWCASE_IMAGE_WIDTH}
          height={SHOWCASE_IMAGE_HEIGHT}
        />
      </motion.div>
    </section>
  );
}

function CommunitySection() {
  const { t } = useI18n();
  return (
    <section className="relative flex min-h-[calc(100svh-6rem)] items-center justify-center py-24 sm:py-32">
      {/* Full-bleed atmospheric base — breaks out of the content column */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-1/2 w-screen -translate-x-1/2"
        style={{
          backgroundImage: [
            'radial-gradient(circle at 50% 52%, rgba(82, 102, 255, 0.14), transparent 38%)',
            'linear-gradient(to bottom, transparent 0%, #0b0910 18%, #07070b 78%, #050507 100%)',
          ].join(', '),
        }}
      />

      {/* Broad diagonal aurora bands */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-1/2 w-screen -translate-x-1/2 overflow-hidden"
      >
        <div className="absolute top-[16%] left-[-12%] h-44 w-[76%] -rotate-6 rounded-[100%] bg-linear-to-r from-orange-500/0 via-orange-400/22 to-pink-500/0 blur-[46px]" />
        <div className="absolute top-[13%] right-[-14%] h-48 w-[74%] rotate-7 rounded-[100%] bg-linear-to-r from-fuchsia-500/0 via-fuchsia-400/20 to-violet-500/0 blur-[50px]" />
        <div className="absolute bottom-[8%] left-[5%] h-56 w-[90%] -rotate-3 rounded-[100%] bg-linear-to-r from-cyan-400/0 via-blue-500/27 to-violet-500/0 blur-[60px]" />
      </div>

      {/* Technical grid, visible only around the focal area */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-1/2 w-screen -translate-x-1/2 opacity-70"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.07) 1px, transparent 1px)',
          backgroundSize: '72px 72px',
          WebkitMaskImage:
            'radial-gradient(ellipse 56% 62% at 50% 52%, black, transparent 78%)',
          maskImage:
            'radial-gradient(ellipse 56% 62% at 50% 52%, black, transparent 78%)',
        }}
      />

      {/* Fine grain keeps the gradients from feeling overly synthetic */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-1/2 w-screen -translate-x-1/2 opacity-[0.12] mix-blend-soft-light"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 180 180' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='.55'/%3E%3C/svg%3E\")",
        }}
      />
      {/* Top blend — eases the pure-black section above into the atmospheric
          glow instead of meeting it at a hard edge. Painted last so it fades
          the tops of the aurora bands and base ramp uniformly. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 left-1/2 h-2/5 w-screen -translate-x-1/2"
        style={{
          backgroundImage:
            'linear-gradient(to bottom, #08080a 0%, rgba(8, 8, 10, 0.72) 34%, transparent 100%)',
        }}
      />

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-100px' }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 mx-auto max-w-3xl text-center"
      >
        <h2 className="text-4xl leading-[1.05] font-semibold tracking-tight text-balance text-white sm:text-5xl xl:text-6xl">
          {t.community.title}
        </h2>
        <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-balance text-neutral-400 sm:text-xl">
          {t.community.subtitle}
        </p>
        <div className="mt-9 flex justify-center">
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer"
            onClick={() => capture('github_star_click')}
            className="group inline-flex items-center gap-2.5 rounded-full border border-pink-200/25 bg-pink-300/15 px-7 py-3.5 text-sm font-semibold text-pink-50 shadow-[0_12px_44px_-12px_rgba(244,114,182,0.5)] backdrop-blur-xl transition-all hover:-translate-y-0.5 hover:border-pink-100/40 hover:bg-pink-300/22 hover:shadow-[0_16px_52px_-12px_rgba(244,114,182,0.65)]"
          >
            <GitHubIcon className="h-4 w-4" />
            {t.community.star}
          </a>
        </div>
      </motion.div>
    </section>
  );
}

function Footer() {
  const { t, lang } = useI18n();

  const footerLinks = [
    {
      label: t.footer.documents,
      href: lang === 'zh' ? ZH_DOCS_URL : QUICK_START_URL,
    },
    { label: t.footer.github, href: GITHUB_URL },
    { label: t.footer.releases, href: RELEASES_URL },
    { label: t.footer.reportIssues, href: `${GITHUB_URL}/issues` },
  ];

  return (
    <footer className="relative z-10 mt-0 flex flex-col gap-4 border-t border-white/[0.06] pt-6 pb-8 text-xs sm:flex-row sm:items-center sm:justify-between">
      <nav className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-neutral-500">
        {footerLinks.map((link) => (
          <a
            key={link.href}
            href={link.href}
            target="_blank"
            rel="noreferrer"
            className="transition-colors hover:text-neutral-300"
          >
            {link.label}
          </a>
        ))}
      </nav>
      <span className="text-neutral-700">
        © {new Date().getFullYear()} DeerFlow. {t.footer.rights}
      </span>
    </footer>
  );
}

function Dot({ className, ping }: { className?: string; ping?: boolean }) {
  return (
    <span className="relative inline-flex h-2 w-2">
      {ping && (
        <span
          className={`absolute inset-0 rounded-full ${className}`}
          style={{
            animation: 'ping-soft 2.4s cubic-bezier(0,0,0.2,1) infinite',
          }}
        />
      )}
      <span
        className={`relative inline-flex h-2 w-2 rounded-full ${className}`}
      />
    </span>
  );
}
