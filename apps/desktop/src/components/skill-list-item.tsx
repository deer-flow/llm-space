"use client";

import { cn } from "@llm-space/ui/lib/utils";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@llm-space/ui/ui/item";
import { Switch } from "@llm-space/ui/ui/switch";
import { SparklesIcon } from "lucide-react";
import { memo } from "react";


interface SkillListItemProps {
  name: string;
  description?: string;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (checked: boolean) => void;
}

function _SkillListItem({
  name,
  description,
  checked,
  disabled,
  onCheckedChange,
}: SkillListItemProps) {
  return (
    <Item variant="muted" size="sm">
      <ItemMedia>
        <SparklesIcon className="text-muted-foreground size-4" />
      </ItemMedia>
      <ItemContent className={cn("min-w-0", !checked && "opacity-50")}>
        <ItemTitle>{name}</ItemTitle>
        {description && (
          <ItemDescription className="wrap-anywhere">
            {description}
          </ItemDescription>
        )}
      </ItemContent>
      <Switch
        size="sm"
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
        aria-label={checked ? `Disable ${name}` : `Enable ${name}`}
      />
    </Item>
  );
}

export const SkillListItem = memo(_SkillListItem);
