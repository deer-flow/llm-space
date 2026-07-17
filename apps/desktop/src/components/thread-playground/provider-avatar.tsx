import { PROVIDER_ICON_ALIASES, resolveProviderIcon } from "@llm-space/ui/lib/brand-icons";
import { memo, useMemo } from "react";


import { BrandAvatar } from "./brand-avatar";

function _ProviderAvatar({
  id,
  name,
  icon,
  size = 18,
  className,
}: {
  id: string;
  name: string;
  /** A `@lobehub/icons` keyword overriding the auto-resolved brand icon. */
  icon?: string;
  size?: number;
  className?: string;
}) {
  // An explicit `icon` wins; otherwise fall back to a known builtin alias, then
  // auto-resolving from the id and display name.
  const brand = useMemo(
    () => resolveProviderIcon(icon, PROVIDER_ICON_ALIASES[id], id, name),
    [icon, id, name]
  );

  return (
    <BrandAvatar
      brand={brand}
      id={id}
      name={name}
      size={size}
      colorClassName="text-foreground/80"
      fallbackClassName="rounded-md text-[9px]"
      className={className}
    />
  );
}

export const ProviderAvatar = memo(_ProviderAvatar);
