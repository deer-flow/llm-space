import { type ToolCallInput } from "@llm-space/core";
import { MoreHorizontal } from "lucide-react";
import { memo, useCallback, useState } from "react";
import { toast } from "sonner";

import { PreviewDialog } from "@/components/preview-dialog-lazy";
import { Tooltip } from "@/components/tooltip";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

function _ToolCallInputView({ input }: { input: ToolCallInput }) {
  const args = input.arguments as Record<string, unknown>;
  const entries = Object.entries(args);
  return (
    // `overflow-x-auto` so an expanded object row can scroll horizontally;
    // collapsed rows truncate within the width and never overflow.
    <div className="block w-full overflow-x-auto font-mono text-sm select-auto">
      <div>
        <span className="text-primary">{input.name}</span>
        <span className="text-muted-foreground">(</span>
        {entries.length > 0 ? (
          <span className="text-muted-foreground">{"{"}</span>
        ) : null}
      </div>
      {entries.map(([key, value], index) => (
        <ToolCallArgumentRow
          key={key}
          argumentKey={key}
          value={value}
          trailingComma={index < entries.length - 1}
        />
      ))}
      <div>
        <span className="text-muted-foreground">
          {entries.length > 0 ? "})" : ")"}
        </span>
      </div>
    </div>
  );
}
export const ToolCallInputView = memo(_ToolCallInputView);

function _ToolCallArgumentRow({
  argumentKey,
  value,
  trailingComma,
}: {
  argumentKey: string;
  value: unknown;
  trailingComma: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const valueText = formatJson(value);
  const isObject = typeof value === "object" && value !== null;
  // Only object values can expand into their full, pretty-printed form; strings
  // and primitives always stay on their single truncated line.
  const toggleExpanded = useCallback(() => {
    if (isObject) {
      setExpanded((prev) => !prev);
    }
  }, [isObject]);
  const copyText = useCallback(async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied`);
    } catch {
      toast.error(`Failed to copy ${label.toLowerCase()}`);
    }
  }, []);
  const copyTextContent = useCallback(() => {
    if (typeof value !== "string") {
      return;
    }
    void copyText(value, "Text content");
  }, [copyText, value]);
  const copyValueJson = useCallback(() => {
    void copyText(formatJson(value), "Value JSON");
  }, [copyText, value]);
  const openPreview = useCallback(() => {
    setPreviewOpen(true);
  }, []);
  const handleContextMenu = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setOpen(true);
  }, []);

  return (
    <div
      className="group/argument relative flex w-full min-w-0 items-baseline py-0.5 pl-1.5"
      onContextMenu={handleContextMenu}
    >
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            aria-label={`Open actions for ${argumentKey}`}
            className={cn(
              "text-muted-foreground invisible absolute top-0.5 left-0 size-5 group-hover/argument:visible aria-expanded:visible",
              open && "visible"
            )}
            size="icon-xs"
            variant="ghost"
            onClick={(event) => event.stopPropagation()}
          >
            <MoreHorizontal className="size-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-44">
          {isObject ? (
            <>
              <DropdownMenuItem onSelect={toggleExpanded}>
                {expanded ? "Collapse" : "Expand"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          ) : null}
          {typeof value === "string" ? (
            <DropdownMenuItem onSelect={copyTextContent}>
              Copy Text Content
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem onSelect={copyValueJson}>
            Copy Value as JSON
          </DropdownMenuItem>
          {typeof value === "string" ? (
            <>
              <DropdownMenuSeparator />

              <DropdownMenuItem onSelect={openPreview}>
                Preview Value...
              </DropdownMenuItem>
            </>
          ) : null}
          {isObject ? (
            <>
              <DropdownMenuSeparator />

              <DropdownMenuItem onSelect={openPreview}>
                View JSON...
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      <ArgumentLine
        argumentKey={argumentKey}
        valueText={valueText}
        trailingComma={trailingComma}
        expandable={isObject}
        expanded={expanded}
        onToggle={toggleExpanded}
      />
      {typeof value === "string" ? (
        <PreviewDialog
          open={previewOpen}
          title={`View value of "${argumentKey}"`}
          value={value}
          onOpenChange={setPreviewOpen}
        />
      ) : null}
      {isObject ? (
        <PreviewDialog
          open={previewOpen}
          title={`View value of "${argumentKey}"`}
          type="json"
          value={valueText}
          onOpenChange={setPreviewOpen}
        />
      ) : null}
    </div>
  );
}
const ToolCallArgumentRow = memo(_ToolCallArgumentRow);

/**
 * One `key: value` line. Non-expandable lines (strings, primitives) render a
 * single truncated line. Expandable lines (objects) are click-to-toggle with a
 * pointer cursor and tooltip, and expand into the value's full pretty-printed
 * form — a single `whitespace-pre` block so only the first line is indented by
 * the key and the JSON's continuation lines wrap flush to the left.
 */
function ArgumentLine({
  argumentKey,
  valueText,
  trailingComma,
  expandable,
  expanded,
  onToggle,
}: {
  argumentKey: string;
  valueText: string;
  trailingComma: boolean;
  expandable: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  const line =
    expandable && expanded ? (
      <div
        className="min-w-max flex-1 cursor-pointer whitespace-pre"
        onClick={onToggle}
      >
        {"  "}
        <span className="text-foreground">{argumentKey}</span>
        <span className="text-muted-foreground">: </span>
        {valueText}
        {trailingComma ? "," : ""}
      </div>
    ) : (
      <span
        className={cn(
          "flex min-w-0 flex-1 items-baseline whitespace-pre",
          expandable && "cursor-pointer"
        )}
        onClick={expandable ? onToggle : undefined}
      >
        <span className="shrink-0">{"  "}</span>
        <span className="text-foreground shrink-0">{argumentKey}</span>
        <span className="text-muted-foreground shrink-0">: </span>
        <span className="truncate">{valueText}</span>
        <span className="shrink-0">{trailingComma ? "," : ""}</span>
      </span>
    );

  if (!expandable) {
    return line;
  }
  return (
    // The click handler lives on `line` itself; the wrapping span here is only
    // the tooltip trigger. Adding another onClick would fire onToggle twice as
    // the event bubbles, cancelling the toggle out.
    <Tooltip content={`Click to ${expanded ? "collapse" : "expand"}`}>
      <span>{line}</span>
    </Tooltip>
  );
}

function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2) ?? String(value);
}
