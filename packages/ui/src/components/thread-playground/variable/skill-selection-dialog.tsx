"use client";

import type { SkillInfo } from "@llm-space/core";
import { SearchIcon, Settings2Icon } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useState } from "react";

import { SkillListItem } from "@llm-space/ui/components/skill-list-item";
import { useHostServices } from "@llm-space/ui/host";
import { formatString, useI18n } from "@llm-space/ui/lib/i18n";
import { Button } from "@llm-space/ui/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@llm-space/ui/ui/dialog";
import { Input } from "@llm-space/ui/ui/input";
import { ScrollArea } from "@llm-space/ui/ui/scroll-area";

interface SkillSelectionDialogProps {
  open: boolean;
  disabled?: boolean;
  loading: boolean;
  error: string | null;
  skills: SkillInfo[];
  selectedSkillNames: string[];
  includeAllSkills: boolean;
  onOpenChange: (open: boolean) => void;
  onApply: (skillNames: string[], includeAll: boolean) => void;
}

function _SkillSelectionDialog({
  open,
  disabled,
  loading,
  error,
  skills,
  selectedSkillNames,
  includeAllSkills,
  onOpenChange,
  onApply,
}: SkillSelectionDialogProps) {
  const { actions } = useHostServices();
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [draftSkillNames, setDraftSkillNames] = useState(selectedSkillNames);
  const [draftIncludesAll, setDraftIncludesAll] = useState(includeAllSkills);

  useEffect(() => {
    if (open) {
      setDraftSkillNames(selectedSkillNames);
      setDraftIncludesAll(includeAllSkills);
      setQuery("");
    }
  }, [includeAllSkills, open, selectedSkillNames]);

  const selectedSet = useMemo(
    () => new Set(draftSkillNames),
    [draftSkillNames]
  );
  // Empty selection means "all enabled skills", so every switch reads as on.
  const usingAllSkills = draftIncludesAll;
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
      // Turning a switch off from the "all skills" default materializes the
      // full list minus that one skill.
      if (draftIncludesAll) {
        setDraftIncludesAll(false);
        setDraftSkillNames(allSkillNames.filter((name) => name !== skillName));
        return;
      }
      const next = draftSkillNames.includes(skillName)
        ? draftSkillNames.filter((name) => name !== skillName)
        : [...draftSkillNames, skillName];
      // Re-selecting every skill collapses back to the dynamic all-skills mode.
      if (
        allSkillNames.length > 0 &&
        next.length === allSkillNames.length &&
        allSkillNames.every((name) => next.includes(name))
      ) {
        setDraftIncludesAll(true);
        setDraftSkillNames([]);
        return;
      }
      setDraftSkillNames(next);
    },
    [allSkillNames, draftIncludesAll, draftSkillNames]
  );

  const apply = useCallback(() => {
    onApply(draftSkillNames, draftIncludesAll);
    onOpenChange(false);
  }, [draftIncludesAll, draftSkillNames, onApply, onOpenChange]);

  const manageSkills = useCallback(() => {
    onOpenChange(false);
    actions.openSettings("skills");
  }, [actions, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[560px] max-h-[calc(100vh-4rem)] w-[min(720px,calc(100vw-2rem))] max-w-none! flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b px-4 py-3">
          <DialogTitle>{t.playground.variable.selectSkillsTitle}</DialogTitle>
          <DialogDescription>
            {t.playground.variable.skillSelectionDescription}
          </DialogDescription>
        </DialogHeader>
        <div className="flex min-h-0 grow flex-col gap-3 p-4">
          <div className="relative">
            <SearchIcon className="text-muted-foreground pointer-events-none absolute top-2 left-2 size-3.5" />
            <Input
              className="h-8 pl-7"
              value={query}
              disabled={disabled}
              placeholder={t.playground.variable.searchSkills}
              onChange={(event) => setQuery(event.currentTarget.value)}
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-xs">
              {draftIncludesAll
                ? t.playground.variable.allSkillsDefault
                : formatString(t.playground.variable.selectedN, {
                    n: draftSkillNames.length,
                  })}
            </span>
            <div className="flex items-center gap-1">
              <Button
                size="xs"
                variant="ghost"
                disabled={disabled || draftIncludesAll}
                onClick={() => {
                  setDraftSkillNames([]);
                  setDraftIncludesAll(true);
                }}
              >
                {t.playground.variable.selectAll}
              </Button>
              <Button
                size="xs"
                variant="ghost"
                disabled={
                  disabled ||
                  (!draftIncludesAll && draftSkillNames.length === 0)
                }
                onClick={() => {
                  setDraftSkillNames([]);
                  setDraftIncludesAll(false);
                }}
              >
                {t.playground.variable.selectNone}
              </Button>
            </div>
          </div>
          <ScrollArea className="border-border/60 min-h-0 grow rounded-md border">
            <div className="flex flex-col gap-1.5 p-2">
              {loading ? (
                <div className="text-muted-foreground px-2 py-3 text-xs">
                  {t.playground.variable.loadingSkills}
                </div>
              ) : error ? (
                <div className="text-destructive px-2 py-3 text-xs">
                  {error}
                </div>
              ) : filteredSkills.length === 0 ? (
                <div className="text-muted-foreground px-2 py-3 text-xs">
                  {t.playground.variable.noMatchingSkills}
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
            className="text-muted-foreground hover:text-foreground mr-auto"
            variant="ghost"
            disabled={disabled}
            onClick={manageSkills}
          >
            <Settings2Icon className="size-3.5" />
            {t.playground.variable.manageSkillFolders}
          </Button>
          <Button
            variant="outline"
            disabled={disabled}
            onClick={() => onOpenChange(false)}
          >
            {t.playground.variable.cancel}
          </Button>
          <Button disabled={disabled} onClick={apply}>
            {t.playground.variable.done}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export const SkillSelectionDialog = memo(_SkillSelectionDialog);
