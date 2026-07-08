"use client";

import { CheckIcon, SearchIcon, XIcon } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useState } from "react";

import { cn } from "@/lib/utils";
import type { SkillInfo } from "@/shared/skills";

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

  const skillsByName = useMemo(
    () => new Map(skills.map((skill) => [skill.name, skill])),
    [skills]
  );
  const selectedSet = useMemo(
    () => new Set(draftSkillNames),
    [draftSkillNames]
  );
  const unavailableSkillNames = draftSkillNames.filter(
    (skillName) => !skillsByName.has(skillName)
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

  const toggleSkill = useCallback((skillName: string) => {
    setDraftSkillNames((current) =>
      current.includes(skillName)
        ? current.filter((name) => name !== skillName)
        : [...current, skillName]
    );
  }, []);

  const removeSkill = useCallback((skillName: string) => {
    setDraftSkillNames((current) =>
      current.filter((name) => name !== skillName)
    );
  }, []);

  const apply = useCallback(() => {
    onApply(draftSkillNames);
    onOpenChange(false);
  }, [draftSkillNames, onApply, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[560px] max-h-[calc(100vh-4rem)] w-[min(720px,calc(100vw-2rem))] max-w-none! flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b px-4 py-3">
          <DialogTitle>Add skills</DialogTitle>
          <DialogDescription>
            Choose enabled skills for this variable.
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
          <div className="grid min-h-0 grow grid-cols-[minmax(0,1fr)_minmax(12rem,16rem)] gap-3">
            <ScrollArea className="border-border/60 min-h-0 rounded-md border">
              <div className="grid gap-1 p-1">
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
                  filteredSkills.map((skill) => {
                    const selected = selectedSet.has(skill.name);
                    return (
                      <button
                        key={skill.path}
                        type="button"
                        className={cn(
                          "hover:bg-accent hover:text-accent-foreground flex min-w-0 items-start gap-2 rounded-md px-2 py-2 text-left transition-colors",
                          selected && "bg-primary/10 text-foreground"
                        )}
                        disabled={disabled}
                        aria-pressed={selected}
                        onClick={() => toggleSkill(skill.name)}
                      >
                        <span
                          className={cn(
                            "border-border mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-sm border",
                            selected && "border-primary bg-primary text-primary-foreground"
                          )}
                        >
                          {selected ? <CheckIcon className="size-3" /> : null}
                        </span>
                        <span className="min-w-0 grow">
                          <span className="block truncate text-xs font-medium">
                            {skill.name}
                          </span>
                          <span className="text-muted-foreground line-clamp-2 text-xs">
                            {skill.description}
                          </span>
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </ScrollArea>
            <div className="border-border/60 grid min-h-0 grid-rows-[auto_minmax(0,1fr)] rounded-md border">
              <div className="border-border/60 flex items-center justify-between border-b px-2 py-2">
                <span className="text-muted-foreground text-xs">
                  Selected {draftSkillNames.length}
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
              <ScrollArea className="min-h-0">
                <div className="flex flex-col gap-1 p-2">
                  {draftSkillNames.length === 0 ? (
                    <div className="text-muted-foreground py-2 text-xs">
                      No skills selected.
                    </div>
                  ) : (
                    draftSkillNames.map((skillName) => (
                      <button
                        key={skillName}
                        type="button"
                        className={cn(
                          "bg-muted text-foreground hover:bg-accent flex min-w-0 items-center gap-1 rounded px-2 py-1 text-left text-xs",
                          unavailableSkillNames.includes(skillName) &&
                            "text-destructive"
                        )}
                        disabled={disabled}
                        onClick={() => removeSkill(skillName)}
                      >
                        <span className="min-w-0 grow truncate">
                          {skillName}
                        </span>
                        <XIcon className="size-3 shrink-0" />
                      </button>
                    ))
                  )}
                </div>
              </ScrollArea>
            </div>
          </div>
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
