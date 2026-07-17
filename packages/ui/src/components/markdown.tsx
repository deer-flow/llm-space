import { memo, useMemo } from "react";
import ReactMarkdown, { Components, type Options } from "react-markdown";
import remarkGfm from "remark-gfm";

import { cn } from "@llm-space/ui/lib/utils";


import { Link } from "./link";

export type MarkdownVariant = "default" | "article";

export type MarkdownProps = Omit<Options, "children"> & {
  children: string;
  className?: string;
  variant?: MarkdownVariant;
};

const VARIANT_CLASSES: Record<MarkdownVariant, string> = {
  default: cn(
    "text-sm/relaxed",
    "[&_h1]:text-2xl [&_h1]:font-semibold [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:text-lg [&_h3]:font-semibold",
    "[&_hr]:border-border [&_hr]:my-4",
    "[&_p]:my-2"
  ),
  // A cleaner, document-like reading style: larger body copy, generous
  // spacing, and headings underlined by a subtle rule (see image reference).
  article: cn(
    "text-[0.9375rem]/7",
    "[&_h1]:mt-8 [&_h1]:mb-5 [&_h1]:border-b [&_h1]:border-border [&_h1]:pb-3 [&_h1]:text-3xl/tight [&_h1]:font-bold [&_h1]:tracking-tight [&_h1:first-child]:mt-0",
    "[&_h2]:mt-8 [&_h2]:mb-4 [&_h2]:border-b [&_h2]:border-border [&_h2]:pb-2 [&_h2]:text-2xl/tight [&_h2]:font-bold [&_h2]:tracking-tight",
    "[&_h3]:mt-6 [&_h3]:mb-3 [&_h3]:text-xl [&_h3]:font-semibold",
    "[&_hr]:border-border [&_hr]:my-6",
    "[&_p]:my-4",
    "[&_ul]:my-4 [&_ol]:my-4 [&_li]:my-1",
    "[&_pre]:leading-[1.15] [&_pre_code]:leading-[1.15]"
  ),
};

function _Markdown({
  children,
  className,
  variant = "default",
  ...props
}: MarkdownProps) {
  const remarkPlugins = useMemo(() => [remarkGfm], []);
  const components = useMemo(
    () =>
      ({
        a: ({
          children,
          href,
        }: {
          children: React.ReactNode;
          href: string;
        }) => (
          <Link
            href={href}
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
          >
            {children}
          </Link>
        ),
      }) as Components,
    []
  );

  return (
    <div
      className={cn(
        VARIANT_CLASSES[variant],
        "[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-3",
        "[&_blockquote]:text-muted-foreground [&_blockquote]:border-l [&_blockquote]:pl-3",
        "[&_code]:bg-muted [&_code]:rounded [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.875em]",
        "[&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5",
        "[&_pre]:bg-muted [&_pre]:my-3 [&_pre]:overflow-auto [&_pre]:rounded-md [&_pre]:p-3",
        "[&_pre_code]:bg-transparent [&_pre_code]:p-0",
        "[&_td]:border-border [&_th]:border-border [&_table]:my-3 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:px-2 [&_th]:py-1 [&_th]:text-left",
        className
      )}
    >
      <ReactMarkdown
        {...props}
        remarkPlugins={remarkPlugins}
        components={components}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

export const Markdown = memo(_Markdown);
