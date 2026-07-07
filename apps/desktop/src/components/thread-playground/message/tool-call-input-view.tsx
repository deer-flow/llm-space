import { type ToolCallInput } from "@llm-space/core";
import { MoreHorizontal } from "lucide-react";
import { memo, useCallback, useState } from "react";
import { toast } from "sonner";

import { TextPreviewDialog } from "@/components/text-preview-dialog";
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
          params={args}
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
  params,
  value,
  trailingComma,
}: {
  argumentKey: string;
  params: Record<string, unknown>;
  value: unknown;
  trailingComma: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const valueText = formatJson(value);
  const displayValue = indentMultilineValue(valueText);
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

  return (
    <div className="group/argument relative min-w-max py-0.5 pl-1.5">
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
          >
            <MoreHorizontal className="size-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-44">
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
                View Value in Dialog...
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      <span className="whitespace-pre">
        {"  "}
        <span className="text-foreground">{argumentKey}</span>
        <span className="text-muted-foreground">: </span>
        {displayValue}
        {trailingComma ? "," : ""}
      </span>
      {typeof value === "string" ? (
        <TextPreviewDialog
          open={previewOpen}
          title={`View value of "${argumentKey}"`}
          value={value}
          onOpenChange={setPreviewOpen}
        />
      ) : null}
    </div>
  );
}
const ToolCallArgumentRow = memo(_ToolCallArgumentRow);

function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2) ?? String(value);
}

function indentMultilineValue(value: string): string {
  return value.split("\n").join("\n  ");
}
