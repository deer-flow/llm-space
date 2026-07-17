import { extractInitials } from "@llm-space/core";
import type { BrandIcon } from "@llm-space/ui/lib/brand-icons";
import { cn } from "@llm-space/ui/lib/utils";

/**
 * Shared avatar body for {@link ModelAvatar} and {@link ProviderAvatar}: renders
 * a resolved brand icon when one is found, else an initials placeholder backed by
 * `avatar.vercel.sh`. The two callers differ only in how they resolve `brand` and
 * in the color/shape classes they pass.
 */
export function BrandAvatar({
  brand,
  id,
  name,
  size,
  colorClassName,
  fallbackClassName,
  className,
}: {
  brand: BrandIcon | null;
  id: string;
  name: string;
  size: number;
  /** Text color applied to both the brand icon and the fallback initials. */
  colorClassName: string;
  /** Shape/typography for the initials fallback (e.g. `rounded-full text-xs`). */
  fallbackClassName: string;
  className?: string;
}) {
  if (brand) {
    const { Icon, props } = brand;
    return (
      <div
        className={cn(
          "flex shrink-0 items-center justify-center",
          colorClassName,
          className
        )}
        style={{ width: size, height: size }}
      >
        <Icon size={Math.round(size * 0.9)} {...props} />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center border-b bg-cover bg-no-repeat pt-0.5 text-shadow-2xs",
        colorClassName,
        fallbackClassName,
        className
      )}
      style={{
        width: size,
        height: size,
        backgroundImage: `url(https://avatar.vercel.sh/${encodeURIComponent(id)}?size=${size})`,
      }}
    >
      {extractInitials(name)}
    </div>
  );
}
