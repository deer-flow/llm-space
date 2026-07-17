import { resolveModelIcon } from "@llm-space/ui/lib/brand-icons";
import { memo, useMemo } from "react";


import { BrandAvatar } from "./brand-avatar";

function _ModelAvatar({
  id,
  name,
  icon,
  size = 24,
  className,
}: {
  id: string;
  name: string;
  /** A `@lobehub/icons` keyword overriding the auto-resolved brand icon. */
  icon?: string;
  size?: number;
  className?: string;
}) {
  // An explicit `icon` wins; otherwise fall back to auto-resolving from the id
  // and display name.
  const brand = useMemo(
    () => resolveModelIcon(icon, id, name),
    [icon, id, name]
  );

  return (
    <BrandAvatar
      brand={brand}
      id={id}
      name={name}
      size={size}
      colorClassName="text-foreground/90"
      fallbackClassName="rounded-full text-xs"
      className={className}
    />
  );
}

export const ModelAvatar = memo(_ModelAvatar);
