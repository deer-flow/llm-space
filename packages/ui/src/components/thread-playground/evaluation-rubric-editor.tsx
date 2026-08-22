import { uuid } from "@llm-space/core";
import {
  MAX_CRITERION_DESCRIPTION_LENGTH,
  MAX_CRITERION_NAME_LENGTH,
  MAX_RUBRIC_CRITERIA,
  MAX_RUBRIC_NAME_LENGTH,
  MIN_RUBRIC_CRITERIA,
  type EvaluationCriterion,
  type EvaluationRubricInput,
  type EvaluationRubricRecord,
} from "@llm-space/core/thread";
import {
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowUpIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@llm-space/ui/components/confirm-dialog";
import { Tooltip } from "@llm-space/ui/components/tooltip";
import { formatString, useI18n } from "@llm-space/ui/lib/i18n";
import { Button } from "@llm-space/ui/ui/button";
import { Input } from "@llm-space/ui/ui/input";
import { Textarea } from "@llm-space/ui/ui/textarea";

function _emptyCriterion(): EvaluationCriterion {
  return { id: uuid(), name: "" };
}

function _initialCriteria(
  rubric: EvaluationRubricRecord | null
): EvaluationCriterion[] {
  return rubric
    ? rubric.criteria.map((criterion) => ({ ...criterion }))
    : [_emptyCriterion(), _emptyCriterion()];
}

export function EvaluationRubricEditor({
  rubric,
  onBack,
  onSave,
  onRemove,
  onSaved,
}: {
  rubric: EvaluationRubricRecord | null;
  onBack: () => void;
  onSave: (input: EvaluationRubricInput) => EvaluationRubricRecord | null;
  onRemove: (id: string) => boolean;
  onSaved: (rubric: EvaluationRubricRecord) => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState(rubric?.name ?? "");
  const [criteria, setCriteria] = useState(() => _initialCriteria(rubric));
  const [removeOpen, setRemoveOpen] = useState(false);
  const normalizedNames = useMemo(
    () =>
      criteria.map((criterion) => criterion.name.trim().toLowerCase()),
    [criteria]
  );
  const duplicateNames = useMemo(() => {
    const seen = new Set<string>();
    return new Set(
      normalizedNames.filter((value) => {
        if (!value || !seen.has(value)) {
          if (value) seen.add(value);
          return false;
        }
        return true;
      })
    );
  }, [normalizedNames]);
  const valid =
    Boolean(name.trim()) &&
    criteria.length >= MIN_RUBRIC_CRITERIA &&
    criteria.length <= MAX_RUBRIC_CRITERIA &&
    normalizedNames.every(Boolean) &&
    duplicateNames.size === 0;

  const updateCriterion = (
    id: string,
    partial: Partial<EvaluationCriterion>
  ) => {
    setCriteria((current) =>
      current.map((criterion) =>
        criterion.id === id ? { ...criterion, ...partial } : criterion
      )
    );
  };

  const moveCriterion = (index: number, offset: -1 | 1) => {
    const target = index + offset;
    if (target < 0 || target >= criteria.length) {
      return;
    }
    setCriteria((current) => {
      const next = [...current];
      const [criterion] = next.splice(index, 1);
      if (!criterion) {
        return current;
      }
      next.splice(target, 0, criterion);
      return next;
    });
  };

  const handleSave = () => {
    if (!valid) {
      return;
    }
    const saved = onSave({
      ...(rubric ? { id: rubric.id } : {}),
      name: name.trim(),
      criteria: criteria.map((criterion) => ({
        id: criterion.id,
        name: criterion.name.trim(),
        ...(criterion.description?.trim()
          ? { description: criterion.description.trim() }
          : {}),
      })),
    });
    if (!saved) {
      toast.error(t.playground.evaluation.unableToSaveRubric, {
        description: t.playground.evaluation.checkRubricFields,
      });
      return;
    }
    onSaved(saved);
  };

  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <div className="mx-auto flex max-w-3xl flex-col gap-4">
          <label className="flex flex-col gap-2">
            <span className="text-xs font-medium">
              {t.playground.evaluation.rubricName}
            </span>
            <Input
              value={name}
              maxLength={MAX_RUBRIC_NAME_LENGTH}
              autoFocus
              placeholder={t.playground.evaluation.answerQualityPlaceholder}
              onChange={(event) => setName(event.currentTarget.value)}
            />
          </label>

          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs font-medium">
                {t.playground.evaluation.criteria}
              </div>
              <div className="text-muted-foreground text-[0.625rem]">
                {t.playground.evaluation.criteriaHint}
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={criteria.length >= MAX_RUBRIC_CRITERIA}
              onClick={() =>
                setCriteria((current) => [...current, _emptyCriterion()])
              }
            >
              <PlusIcon className="size-3" />
              {t.playground.evaluation.addCriterion}
            </Button>
          </div>

          <div className="flex flex-col gap-3">
            {criteria.map((criterion, index) => {
              const normalizedName = normalizedNames[index] ?? "";
              const duplicate = duplicateNames.has(normalizedName);
              return (
                <section
                  key={criterion.id}
                  className="bg-muted/20 rounded-lg border p-3"
                >
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1 space-y-2">
                      <label className="flex flex-col gap-1">
                        <span className="text-muted-foreground text-[0.625rem]">
                          {formatString(
                            t.playground.evaluation.criterionIndex,
                            { n: index + 1 }
                          )}
                        </span>
                        <Input
                          value={criterion.name}
                          maxLength={MAX_CRITERION_NAME_LENGTH}
                          aria-invalid={duplicate || !criterion.name.trim()}
                          placeholder={t.playground.evaluation.correctnessPlaceholder}
                          onChange={(event) =>
                            updateCriterion(criterion.id, {
                              name: event.currentTarget.value,
                            })
                          }
                        />
                        {duplicate && (
                          <span className="text-destructive text-[0.625rem]">
                            {t.playground.evaluation.criterionNamesUnique}
                          </span>
                        )}
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-muted-foreground text-[0.625rem]">
                          {t.playground.evaluation.descriptionOptional}
                        </span>
                        <Textarea
                          className="min-h-16 resize-y text-xs"
                          value={criterion.description ?? ""}
                          maxLength={MAX_CRITERION_DESCRIPTION_LENGTH}
                          placeholder={t.playground.evaluation.descriptionPlaceholder}
                          onChange={(event) =>
                            updateCriterion(criterion.id, {
                              description: event.currentTarget.value,
                            })
                          }
                        />
                      </label>
                    </div>
                    <div className="flex shrink-0 flex-col gap-1">
                      <Tooltip content={t.playground.evaluation.moveCriterionUp}>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          aria-label={formatString(
                            t.playground.evaluation.moveCriterionUpNamed,
                            {
                              name:
                                criterion.name ||
                                formatString(
                                  t.playground.evaluation.criterionIndex,
                                  { n: index + 1 }
                                ),
                            }
                          )}
                          disabled={index === 0}
                          onClick={() => moveCriterion(index, -1)}
                        >
                          <ArrowUpIcon className="size-3" />
                        </Button>
                      </Tooltip>
                      <Tooltip content={t.playground.evaluation.moveCriterionDown}>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          aria-label={formatString(
                            t.playground.evaluation.moveCriterionDownNamed,
                            {
                              name:
                                criterion.name ||
                                formatString(
                                  t.playground.evaluation.criterionIndex,
                                  { n: index + 1 }
                                ),
                            }
                          )}
                          disabled={index === criteria.length - 1}
                          onClick={() => moveCriterion(index, 1)}
                        >
                          <ArrowDownIcon className="size-3" />
                        </Button>
                      </Tooltip>
                      <Tooltip content={t.playground.evaluation.removeCriterion}>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          className="hover:text-destructive"
                          aria-label={formatString(
                            t.playground.evaluation.removeCriterionNamed,
                            {
                              name:
                                criterion.name ||
                                formatString(
                                  t.playground.evaluation.criterionIndex,
                                  { n: index + 1 }
                                ),
                            }
                          )}
                          disabled={criteria.length <= MIN_RUBRIC_CRITERIA}
                          onClick={() =>
                            setCriteria((current) =>
                              current.filter(
                                (value) => value.id !== criterion.id
                              )
                            )
                          }
                        >
                          <Trash2Icon className="size-3" />
                        </Button>
                      </Tooltip>
                    </div>
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 border-t px-4 py-3">
        <div>
          {rubric && (
            <Button
              variant="ghost"
              className="hover:text-destructive"
              onClick={() => setRemoveOpen(true)}
            >
              <Trash2Icon className="size-3" />
              {t.playground.evaluation.deleteRubric}
            </Button>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onBack}>
            <ArrowLeftIcon className="size-3" />
            {t.playground.evaluation.back}
          </Button>
          <Button disabled={!valid} onClick={handleSave}>
            {rubric
              ? t.playground.evaluation.saveRubric
              : t.playground.evaluation.createRubric}
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={removeOpen}
        onOpenChange={setRemoveOpen}
        title={t.playground.evaluation.deleteRubricTitle}
        description={t.playground.evaluation.deleteRubricDescription}
        confirmLabel={t.playground.evaluation.delete}
        dimBackground={false}
        onConfirm={() => {
          setRemoveOpen(false);
          if (rubric && onRemove(rubric.id)) {
            onBack();
          }
        }}
      />
    </>
  );
}
