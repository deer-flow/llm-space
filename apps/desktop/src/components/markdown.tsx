import { memo, useMemo } from "react";
import ReactMarkdown, { Components, type Options } from "react-markdown";
import remarkGfm from "remark-gfm";

import { cn } from "@/lib/utils";

import { Link } from "./link";

export type MarkdownProps = Omit<Options, "children"> & {
  children: string;
  className?: string;
};

function _Markdown({ children, className, ...props }: MarkdownProps) {
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
        "text-sm/relaxed",
        "[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-3",
        "[&_blockquote]:text-muted-foreground [&_blockquote]:border-l [&_blockquote]:pl-3",
        "[&_code]:bg-muted [&_code]:rounded [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.875em]",
        "[&_h1]:text-2xl [&_h1]:font-semibold [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:text-lg [&_h3]:font-semibold",
        "[&_hr]:border-border [&_hr]:my-4",
        "[&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5",
        "[&_pre]:bg-muted [&_p]:my-2 [&_pre]:my-3 [&_pre]:overflow-auto [&_pre]:rounded-md [&_pre]:p-3",
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
