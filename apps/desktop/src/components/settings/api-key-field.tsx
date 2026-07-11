"use client";

import { Eye, EyeOff } from "lucide-react";
import { useState, type ComponentProps, type ReactNode } from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import { Link } from "../link";

/**
 * A labelled secret-input row: a password input with a show/hide eye toggle, an
 * optional "Get API key" link (opens the provider's site in the browser), and an
 * optional description below. Works controlled (`value`/`onChange`) or
 * uncontrolled (`defaultValue`) — extra props flow through to the `Input`.
 */
export function ApiKeyField({
  label,
  getKeyUrl,
  description,
  className,
  "aria-label": ariaLabel,
  ...inputProps
}: {
  label: string;
  /** When set, renders a "Get API key" link to this URL. */
  getKeyUrl?: string;
  /** Helper text rendered under the input. */
  description?: ReactNode;
} & ComponentProps<typeof Input>) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{label}</span>
        {getKeyUrl ? (
          <Link
            href={getKeyUrl}
            className="text-primary text-xs underline underline-offset-2 hover:opacity-80"
          >
            Get API key
          </Link>
        ) : null}
      </div>
      <div className="relative">
        <Input
          {...inputProps}
          type={visible ? "text" : "password"}
          className={cn("pr-9", className)}
          aria-label={ariaLabel ?? label}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2 transition-colors"
          aria-label={visible ? `Hide ${label}` : `Show ${label}`}
        >
          {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
      {description}
    </div>
  );
}
