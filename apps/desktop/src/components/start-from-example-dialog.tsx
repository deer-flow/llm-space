"use client";

import {
  PROMPT_EXAMPLES,
  isPromptExample,
  type PromptExample,
} from "@/components/thread-playground/prompt/prompt-examples";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemSeparator,
  ItemTitle,
} from "@/components/ui/item";

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
      <DialogContent className="max-h-[min(34rem,calc(100vh-2rem))] max-w-xl! overflow-hidden">
        <DialogHeader>
          <DialogTitle>Start from Example</DialogTitle>
          <DialogDescription>
            Choose a prompt example to create a new thread.
          </DialogDescription>
        </DialogHeader>
        <ItemGroup className="gap-1 overflow-y-auto pr-1">
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
                    <ItemDescription>{item.description}</ItemDescription>
                  </ItemContent>
                </button>
              </Item>
            );
          })}
        </ItemGroup>
      </DialogContent>
    </Dialog>
  );
}
