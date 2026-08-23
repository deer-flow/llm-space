"use client";

import { useI18n } from "@llm-space/ui/lib/i18n";
import { cn } from "@llm-space/ui/lib/utils";
import { Button } from "@llm-space/ui/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@llm-space/ui/ui/empty";
import {
  ArrowUpRightIcon,
  PlusIcon,
  SettingsIcon,
  SparklesIcon,
} from "lucide-react";
import { useCallback, type MouseEvent } from "react";

import { useCommands } from "@/commands";
import { electrobun } from "@/lib/electrobun";


interface WelcomeProps {
  className?: string;
  onNewStarter?: () => void;
  onNewFile?: () => void;
  onModels?: () => void;
}

export function Welcome({
  className,
  onNewStarter,
  onNewFile,
  onModels,
}: WelcomeProps) {
  const { executeCommand } = useCommands();
  const { t } = useI18n();

  const handleHeaderDoubleClick = useCallback(() => {
    void electrobun.rpc?.request.toggleMaximized({});
  }, []);

  const handleLearnMore = useCallback(
    (event: MouseEvent<HTMLAnchorElement>) => {
      event.preventDefault();
      executeCommand({ type: "openDocument", args: {} });
    },
    [executeCommand]
  );

  return (
    <div
      className={cn(
        "bg-tabs relative flex size-full items-center justify-center",
        className
      )}
    >
      <div
        className="electrobun-webkit-app-region-drag absolute top-0 right-0 left-0 h-11.5"
        onDoubleClick={handleHeaderDoubleClick}
      ></div>
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <SparklesIcon className="size-8" />
          </EmptyMedia>
          <EmptyTitle>{t.desktop.welcome.title}</EmptyTitle>
          <EmptyDescription>
            {t.desktop.welcome.description}
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent className="flex-row justify-center gap-2">
          <Button onClick={onNewStarter}>
            <SparklesIcon />
            {t.desktop.welcome.startFromExamples}
          </Button>
          <Button variant="outline" onClick={onNewFile}>
            <PlusIcon />
            {t.desktop.welcome.blankThread}
          </Button>
          <Button variant="outline" onClick={onModels}>
            <SettingsIcon />
            {t.desktop.welcome.configureModels}
          </Button>
        </EmptyContent>
        <Button
          variant="link"
          asChild
          className="text-muted-foreground"
          size="sm"
        >
          <a href="#" onClick={handleLearnMore}>
            {t.common.learnMore} <ArrowUpRightIcon />
          </a>
        </Button>
      </Empty>
    </div>
  );
}
