"use client";

import { Folder } from "lucide-react";
import { memo } from "react";

import {
  Item,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

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
        <Folder className="text-muted-foreground size-4" />
      </ItemMedia>
      <ItemContent className={cn(!checked && "opacity-50")}>
        <ItemTitle>{name}</ItemTitle>
        {description && <ItemDescription>{description}</ItemDescription>}
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
