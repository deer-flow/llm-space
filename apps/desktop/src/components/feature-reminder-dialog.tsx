import { useModels } from "@llm-space/ui/components/model-provider";
import { Button } from "@llm-space/ui/ui/button";
import { Dialog, DialogClose, DialogContent } from "@llm-space/ui/ui/dialog";
import { ArrowUpRightIcon, XIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { useCommands } from "@/commands";
import { electrobun } from "@/lib/electrobun";
import type { FeatureReminder } from "@/shared/feature-reminders";

/** Wait this long after mount before opening, so it doesn't fight first paint. */
const SHOW_DELAY_MS = 800;

/**
 * A once-ever "what's new" modal. On launch it asks the bun side for the next
 * unseen feature reminder (`featureReminderNext`) and, if there is one, shows a
 * banner + title + description with a single "Learn more" action. At most one
 * reminder appears per launch.
 *
 * The fetch is a pure read; the reminder is recorded as seen
 * (`featureReminderMarkSeen`) only when the user actually dismisses it, so a
 * re-render / StrictMode double-invoke can't burn a reminder that never showed.
 *
 * The fetch is skipped while no models are configured so this never stacks on
 * the first-run onboarding modal (which triggers exactly in that case); unseen
 * reminders simply wait for a later launch.
 */
export function FeatureReminderDialog() {
  const models = useModels();
  const hasModels = models.length > 0;
  const { executeCommand } = useCommands();
  const [reminder, setReminder] = useState<FeatureReminder | null>(null);
  const [open, setOpen] = useState(false);
  // Providers load asynchronously, so `hasModels` flips from false→true after
  // mount. Request once on that first transition; the read is idempotent, so
  // this ref is only a belt-and-suspenders guard against needless requests.
  const requestedRef = useRef(false);

  useEffect(() => {
    const rpc = electrobun.rpc;
    if (!rpc || !hasModels || requestedRef.current) return;
    requestedRef.current = true;
    void rpc.request.featureReminderNext({}).then((next) => {
      if (next) setReminder(next);
    });
  }, [hasModels]);

  // Open shortly after we have a reminder so it doesn't fight first paint. Kept
  // in its own effect (keyed on the reminder) so a re-render of the fetch effect
  // can't cancel the pending open.
  useEffect(() => {
    if (!reminder) return;
    const timer = setTimeout(() => setOpen(true), SHOW_DELAY_MS);
    return () => clearTimeout(timer);
  }, [reminder]);

  const markSeen = useCallback(() => {
    if (reminder) {
      void electrobun.rpc?.request.featureReminderMarkSeen({ id: reminder.id });
    }
  }, [reminder]);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      setOpen(next);
      if (!next) markSeen();
    },
    [markSeen]
  );

  const handleLearnMore = useCallback(() => {
    if (reminder?.link) {
      executeCommand({ type: "openLink", args: { url: reminder.link } });
    } else {
      executeCommand({ type: "openDocument", args: {} });
    }
    markSeen();
    setOpen(false);
  }, [executeCommand, markSeen, reminder]);

  if (!reminder) return null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="w-full max-w-[520px]! gap-0 overflow-hidden p-0"
        showCloseButton={false}
      >
        <div className="relative">
          <img
            src={reminder.imageUrl}
            alt={reminder.title}
            className="bg-muted block aspect-video w-full object-cover"
          />
          <DialogClose asChild>
            <Button
              className="bg-muted/75 hover:bg-muted/85! text-foreground/80 absolute top-2 right-2 rounded-full"
              variant="ghost"
              size="icon-sm"
              aria-label="Dismiss"
            >
              <XIcon className="size-3" />
            </Button>
          </DialogClose>
        </div>
        <div className="flex flex-col gap-2 p-6">
          {reminder.eyebrow && (
            <div className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              {reminder.eyebrow}
            </div>
          )}
          <h2 className="font-heading text-lg font-semibold">
            {reminder.title}
          </h2>
          <p className="text-muted-foreground text-sm leading-relaxed">
            {reminder.description}
          </p>
          <div className="mt-3 flex justify-end">
            <Button variant="outline" size="sm" onClick={handleLearnMore}>
              Learn more
              <ArrowUpRightIcon className="size-3.5" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
