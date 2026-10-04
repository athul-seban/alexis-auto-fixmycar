import { Skeleton } from "@/components/ui/skeleton"

/** Route-level loading UI inside a portal shell: a title block and a content card. */
export function PortalLoading() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <Skeleton className="mb-2 h-9 w-56" />
      <Skeleton className="mb-6 h-5 w-80 max-w-full" />
      <Skeleton className="h-72 w-full rounded-xl" />
    </div>
  )
}
