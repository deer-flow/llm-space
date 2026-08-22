import { useI18n } from "@llm-space/ui/lib/i18n";
import { Button } from "@llm-space/ui/ui/button";
import { ArrowRightIcon } from "lucide-react";

import { SiteHeader } from "@/components/site-header";

/**
 * Shown for a broken shared link (unknown connector / malformed path) and for a
 * thread that couldn't be loaded. Keeps the site header and guides the visitor
 * back to the landing page. The `eyebrow`/`title` default to the not-found
 * wording; load failures (rate limits, network) override them so the page
 * doesn't mislabel a transient error as "Not found". Requires a shared
 * `I18nProvider` ancestor (the routes that render it provide one).
 */
export function NotFound({
  eyebrow,
  title,
  message,
}: {
  eyebrow?: string;
  title?: string;
  message?: string;
}) {
  const viewer = useI18n().t.viewer;
  return (
    <div className="dark flex h-dvh flex-col bg-[#08080a] text-[#ededf0]">
      <SiteHeader />
      <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
        <div className="space-y-2">
          <div className="text-sm font-medium tracking-widest text-neutral-500 uppercase">
            {eyebrow ?? viewer.notFound}
          </div>
          <h1 className="text-2xl font-semibold">{title ?? viewer.couldNotOpen}</h1>
          <p className="max-w-md text-sm text-neutral-400">
            {message ?? viewer.linkMayBeBroken}
          </p>
        </div>
        <Button asChild size="lg">
          <a href={import.meta.env.BASE_URL}>
            {viewer.backToLlmSpace}
            <ArrowRightIcon className="size-4" />
          </a>
        </Button>
      </div>
    </div>
  );
}
