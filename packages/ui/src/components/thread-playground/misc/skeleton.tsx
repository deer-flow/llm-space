import { cn } from "@llm-space/ui/lib/utils";
import { Skeleton } from "@llm-space/ui/ui/skeleton";

export function ThreadPlaygroundSkeleton({
  className,
}: {
  className?: string;
}) {
  return (
    <div
      className={cn("flex flex-col overflow-hidden", className)}
      aria-busy
      aria-label="Loading thread playground"
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-12 w-full shrink-0 items-center border-b">
          <div className="min-w-0 grow px-3">
            <Skeleton className="h-5 w-48 max-w-full" />
          </div>
          <div className="flex items-center gap-6 px-1">
            <Skeleton className="size-4 rounded-md" />
            <Skeleton className="size-4 rounded-md" />
            <Skeleton className="size-4 rounded-md" />
          </div>
          <div className="flex items-center px-3">
            <Skeleton className="h-7 w-20 rounded-md" />
          </div>
        </header>

        <div className="flex min-h-0 grow">
          <div className="flex w-1/2 min-w-[300px] flex-col px-3 pb-3">
            <div className="flex w-full border-b py-2">
              <div className="text-muted-foreground w-20 shrink-0 text-sm">
                Models
              </div>
              <div className="flex grow items-center">
                <Skeleton className="h-6 w-44 rounded-md" />
              </div>
            </div>
            <div className="flex w-full border-b py-2">
              <div className="text-muted-foreground w-20 shrink-0 text-sm">
                Tools
              </div>
              <div className="flex grow items-center gap-2">
                <Skeleton className="h-6 w-28 rounded-md" />
                <Skeleton className="size-6 rounded-md" />
              </div>
            </div>
            <div className="flex min-h-0 w-full grow flex-col">
              <div className="text-muted-foreground shrink-0 py-2 text-sm">
                System prompt
              </div>
              <div className="flex min-h-0 grow flex-col gap-2 rounded-md border bg-(--textarea) px-3 py-3">
                <Skeleton className="h-3.5 w-full rounded" />
                <Skeleton className="h-3.5 w-[94%] rounded" />
                <Skeleton className="h-3.5 w-full rounded" />
                <Skeleton className="h-3.5 w-[88%] rounded" />
                <Skeleton className="h-3.5 w-full rounded" />
                <Skeleton className="h-3.5 w-[62%] rounded" />
              </div>
            </div>
          </div>

          <div className="bg-border w-px shrink-0 opacity-50" />

          <div className="flex min-w-[300px] flex-1 flex-col gap-3 p-3 pt-3.5">
            <MessageSkeleton contentLines={1} />
            <MessageSkeleton contentLines={2} />
            <MessageSkeleton contentLines={1} />
            <Skeleton className="mt-0.5 h-11 w-full rounded-lg" />
          </div>
        </div>
      </div>
    </div>
  );
}

function MessageSkeleton({ contentLines }: { contentLines: number }) {
  return (
    <div className="flex flex-col rounded-lg border bg-(--textarea)">
      <div className="flex items-center gap-2 px-3 pt-2">
        <Skeleton className="size-4 rounded-sm" />
        <Skeleton className="h-3.5 w-14" />
        <div className="ml-auto flex items-center gap-1">
          <Skeleton className="size-7 rounded-md" />
          <Skeleton className="size-7 rounded-md" />
        </div>
      </div>
      <div className="flex flex-col gap-2 px-3 py-3">
        {Array.from({ length: contentLines }, (_, index) => (
          <Skeleton
            key={index}
            className={cn(
              "h-4 rounded",
              index === contentLines - 1 ? "w-[72%]" : "w-full"
            )}
          />
        ))}
      </div>
    </div>
  );
}
