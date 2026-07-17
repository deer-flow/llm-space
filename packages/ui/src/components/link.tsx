"use client";

import type { AnchorHTMLAttributes, MouseEvent } from "react";

import { useHostServices } from "@llm-space/ui/host";

/**
 * An `<a>` that opens its `href` via the host's `openLink` action (the desktop
 * opens it in the user's default browser) rather than navigating the webview.
 * Accepts every native anchor prop; only the click behaviour is overridden.
 */
export function Link({
  href,
  onClick,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement>) {
  const { actions } = useHostServices();

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (event.defaultPrevented) return;
    // The OS opens the URL; the webview must not navigate to it.
    event.preventDefault();
    if (!href) return;
    actions.openLink(href);
  };

  return <a href={href ?? "#"} onClick={handleClick} {...props} />;
}
