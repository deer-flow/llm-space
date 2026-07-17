import { cn } from "@/lib/utils";
import type { GithubUser } from "@/shared/auth";

/** A GitHub avatar with a monogram fallback when the image is absent. */
export function GithubAvatar({
  user,
  className,
}: {
  user: GithubUser;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "bg-muted text-muted-foreground flex size-6 shrink-0 items-center justify-center overflow-hidden rounded-full text-[10px] font-medium",
        className
      )}
    >
      {user.avatarUrl ? (
        <img
          src={user.avatarUrl}
          alt=""
          className="size-full object-cover"
          draggable={false}
        />
      ) : (
        user.login.charAt(0).toUpperCase()
      )}
    </span>
  );
}
