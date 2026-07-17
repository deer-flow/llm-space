"use client";


import { Tooltip } from "@llm-space/ui/components/tooltip";
import { cn } from "@llm-space/ui/lib/utils";
import { Button } from "@llm-space/ui/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@llm-space/ui/ui/popover";
import { Textarea } from "@llm-space/ui/ui/textarea";
import { SparklesIcon, WandSparkles } from "lucide-react";
import { type KeyboardEvent, memo, useCallback, useState } from "react";

interface GeneratePopoverButtonProps {
  className?: string;
  iconOnly?: boolean;
  placeholder?: string;
  onGenerate: (prompt: string) => void;
}

function _GeneratePopoverButton({
  className,
  iconOnly = false,
  placeholder = "Describe what your function does (or paste your code), and we'll generate a definition.",
  onGenerate,
}: GeneratePopoverButtonProps) {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState("");

  const handleGenerate = useCallback(() => {
    const trimmedPrompt = prompt.trim();

    if (!trimmedPrompt) {
      return;
    }

    onGenerate(trimmedPrompt);
    setOpen(false);
    setPrompt("");
  }, [onGenerate, prompt]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        handleGenerate();
      }
    },
    [handleGenerate]
  );

  const button = (
    <Button
      className={className}
      variant="ghost"
      size={iconOnly ? "icon" : "sm"}
      aria-label="Generate"
      aria-expanded={open}
    >
      <WandSparkles data-icon={iconOnly ? undefined : "inline-start"} />
      {iconOnly ? null : "Generate"}
    </Button>
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      {iconOnly ? (
        <Tooltip content="Generate">
          <PopoverTrigger asChild>{button}</PopoverTrigger>
        </Tooltip>
      ) : (
        <PopoverTrigger asChild>{button}</PopoverTrigger>
      )}
      <PopoverContent
        align="center"
        sideOffset={12}
        avoidCollisions={false}
        className={cn(
          "bg-background/85 h-50 w-120 gap-0 rounded-xl p-2 shadow-2xl backdrop-blur-xs"
        )}
      >
        <Textarea
          className="min-h-0 flex-1 border-0! bg-transparent! font-mono text-sm leading-relaxed shadow-none focus-visible:ring-0 md:text-base"
          value={prompt}
          placeholder={placeholder}
          autoFocus
          onChange={(event) => setPrompt(event.target.value)}
          onKeyDown={handleKeyDown}
        />
        <div className="flex justify-end">
          <Button
            className="bg-foreground/80 text-background hover:bg-foreground rounded-lg py-4 text-sm"
            variant="default"
            onClick={handleGenerate}
          >
            <SparklesIcon />
            Generate
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export const GeneratePopoverButton = memo(_GeneratePopoverButton);
