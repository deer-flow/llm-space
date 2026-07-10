"use client";

import { SearchIcon } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useState } from "react";

import type { SkillInfo } from "@/shared/skills";

import { SkillListItem } from "../../skill-list-item";
import { Button } from "../../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../ui/dialog";
import { Input } from "../../ui/input";
import { ScrollArea } from "../../ui/scroll-area";

interface SkillSelectionDialogProps {
  open: boolean;
  disabled?: boolean;
  loading: boolean;
  error: string | null;
  skills: SkillInfo[];
  selectedSkillNames: string[];
  onOpenChange: (open: boolean) => void;
  onApply: (skillNames: string[]) => void;
}

function _SkillSelectionDialog({
  open,
  disabled,
  loading,
  error,
  skills,
  selectedSkillNames,
  onOpenChange,
  onApply,
}: SkillSelectionDialogProps) {
  const [query, setQuery] = useState("");
  const [draftSkillNames, setDraftSkillNames] = useState(selectedSkillNames);

  useEffect(() => {
    if (open) {
      setDraftSkillNames(selectedSkillNames);
      setQuery("");
    }
  }, [open, selectedSkillNames]);

  const selectedSet = useMemo(() => new Set(draftSkillNames), [draftSkillNames]);
  // Empty selection means "all enabled skills", so every switch reads as on.
  const usingAllSkills = draftSkillNames.length === 0;
  const allSkillNames = useMemo(
    () => skills.map((skill) => skill.name),
    [skills]
  );
  const filteredSkills = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) {
      return skills;
    }
    return skills.filter(
      (skill) =>
        skill.name.toLowerCase().includes(trimmed) ||
        skill.description.toLowerCase().includes(trimmed)
    );
  }, [query, skills]);

  const toggleSkill = useCallback(
    (skillName: string) => {
      setDraftSkillNames((current) => {
        // Turning a switch off from the "all skills" default materializes the
        // full list minus that one skill.
        if (current.length === 0) {
          return allSkillNames.filter((name) => name !== skillName);
        }
        const next = current.includes(skillName)
          ? current.filter((name) => name !== skillName)
          : [...current, skillName];
        // Re-selecting every skill collapses back to the "all skills" default.
        if (
          allSkillNames.length > 0 &&
          next.length === allSkillNames.length &&
          allSkillNames.every((name) => next.includes(name))
        ) {
          return [];
        }
        return next;
      });
    },
    [allSkillNames]
  );

  const apply = useCallback(() => {
    onApply(draftSkillNames);
    onOpenChange(false);
  }, [draftSkillNames, onApply, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[560px] max-h-[calc(100vh-4rem)] w-[min(720px,calc(100vw-2rem))] max-w-none! flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b px-4 py-3">
          <DialogTitle>Select skills</DialogTitle>
          <DialogDescription>
            All enabled skills are included by default. Pick specific skills to
            narrow it to only those.
          </DialogDescription>
        </DialogHeader>
        <div className="flex min-h-0 grow flex-col gap-3 p-4">
          <div className="relative">
            <SearchIcon className="text-muted-foreground pointer-events-none absolute top-2 left-2 size-3.5" />
            <Input
              className="h-8 pl-7"
              value={query}
              disabled={disabled}
              placeholder="Search skills"
              onChange={(event) => setQuery(event.currentTarget.value)}
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-xs">
              {draftSkillNames.length === 0
                ? "All skills (default)"
                : `Selected ${draftSkillNames.length}`}
            </span>
            <Button
              size="xs"
              variant="ghost"
              disabled={disabled || draftSkillNames.length === 0}
              onClick={() => setDraftSkillNames([])}
            >
              Clear
            </Button>
          </div>
          <ScrollArea className="border-border/60 min-h-0 grow rounded-md border">
            <div className="flex flex-col gap-1.5 p-2">
              {loading ? (
                <div className="text-muted-foreground px-2 py-3 text-xs">
                  Loading skills...
                </div>
              ) : error ? (
                <div className="text-destructive px-2 py-3 text-xs">
                  {error}
                </div>
              ) : filteredSkills.length === 0 ? (
                <div className="text-muted-foreground px-2 py-3 text-xs">
                  No matching skills.
                </div>
              ) : (
                filteredSkills.map((skill) => (
                  <SkillListItem
                    key={skill.path}
                    name={skill.name}
                    description={skill.description}
                    checked={usingAllSkills || selectedSet.has(skill.name)}
                    disabled={disabled}
                    onCheckedChange={() => toggleSkill(skill.name)}
                  />
                ))
              )}
            </div>
          </ScrollArea>
        </div>
        <DialogFooter className="border-t px-4 py-3">
          <Button
            variant="outline"
            disabled={disabled}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button disabled={disabled} onClick={apply}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export const SkillSelectionDialog = memo(_SkillSelectionDialog);
