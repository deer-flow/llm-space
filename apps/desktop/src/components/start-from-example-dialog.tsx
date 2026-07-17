"use client";


import { Markdown } from "@llm-space/ui/components/markdown";
import {
  PROMPT_EXAMPLES,
  isPromptExample,
  type PromptExample,
} from "@llm-space/ui/components/thread-playground/examples/prompts";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@llm-space/ui/ui/dialog";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemSeparator,
  ItemTitle,
} from "@llm-space/ui/ui/item";
import { ScrollArea } from "@llm-space/ui/ui/scroll-area";
import { SparklesIcon } from "lucide-react";



export function StartFromExampleDialog({
  open,
  onOpenChange,
  onSelectExample,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectExample: (example: PromptExample) => void;
}) {
  const selectExample = (example: PromptExample) => {
    onOpenChange(false);
    onSelectExample(example);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-xl! overflow-hidden"
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <SparklesIcon className="size-3.5" /> Start from examples
          </DialogTitle>
          <DialogDescription className="pl-5.5">
            Choose a prompt example to create a new thread.
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[80vh]">
          <ItemGroup className="gap-1 pr-3">
            {PROMPT_EXAMPLES.map((item, index) => {
              if (!isPromptExample(item)) {
                return <ItemSeparator key={`sep-${index}`} className="my-1" />;
              }
              const Icon = item.icon;
              return (
                <Item
                  key={item.id}
                  asChild
                  variant="default"
                  className="hover:bg-accent hover:text-accent-foreground cursor-pointer"
                >
                  <button type="button" onClick={() => selectExample(item)}>
                    <ItemMedia variant="icon">
                      <Icon />
                    </ItemMedia>
                    <ItemContent>
                      <ItemTitle>{item.label}</ItemTitle>
                      <ItemDescription>
                        <Markdown>{item.description}</Markdown>
                      </ItemDescription>
                    </ItemContent>
                  </button>
                </Item>
              );
            })}
          </ItemGroup>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
