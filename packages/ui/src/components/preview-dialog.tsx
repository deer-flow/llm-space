
import { memo } from "react";

import { CodeEditor } from "@llm-space/ui/components/code-editor";
import { Markdown } from "@llm-space/ui/components/markdown";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@llm-space/ui/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@llm-space/ui/ui/tabs";


export type PreviewType = "text" | "json";
export type PreviewMode = "code" | "markdown" | "html";

function _PreviewDialog({
  open,
  onOpenChange,
  title = "Preview",
  value,
  type = "text",
  mode = "code",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  value: string;
  type?: PreviewType;
  mode?: PreviewMode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[85vh] w-[85vw] max-w-none! flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="sr-only">
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {type === "json" ? (
          <div className="min-h-0 flex-1 p-3">
            <CodeEditor
              className="h-full opacity-100!"
              hideFocusRing
              hideBorder
              language="json"
              readonly
              value={value}
            />
          </div>
        ) : (
          <Tabs
            className="min-h-0 flex-1 gap-0"
            defaultValue={
              mode === "markdown" ? "markdown" : mode === "html" ? "html" : "raw"
            }
          >
            <div className="border-b px-4 py-2">
              <TabsList variant="line">
                <TabsTrigger value="raw">Raw</TabsTrigger>
                <TabsTrigger value="markdown">Markdown</TabsTrigger>
                <TabsTrigger value="html">HTML</TabsTrigger>
              </TabsList>
            </div>
            <TabsContent value="raw" className="min-h-0 p-3">
              <CodeEditor
                className="h-full opacity-100!"
                hideFocusRing
                hideBorder
                readonly
                value={value}
              />
            </TabsContent>
            <TabsContent value="markdown" className="min-h-0 p-3">
              <div className="size-full overflow-auto rounded-lg bg-(--textarea)">
                <Markdown
                  variant="article"
                  className="mx-auto max-w-3xl px-8 py-6"
                >
                  {value}
                </Markdown>
              </div>
            </TabsContent>
            <TabsContent value="html" className="min-h-0 p-3">
              <iframe
                className="size-full rounded-lg border bg-white"
                referrerPolicy="no-referrer"
                sandbox=""
                srcDoc={value}
                title={`${title} HTML preview`}
              />
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}

export const PreviewDialog = memo(_PreviewDialog);
