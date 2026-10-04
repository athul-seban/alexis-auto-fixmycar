"use client"

import { useState } from "react"
import { Star } from "lucide-react"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { Skeleton } from "@/components/ui/skeleton"
import { useApi } from "@/hooks/use-api"
import { formatDate, getServiceLabel } from "@/lib/utils"
import { PageHeader, Panel } from "@/components/garage-portal/shared/PageHeader"
import { ReviewDialog } from "@/components/owner-portal/ReviewDialog"
import type { OwnerBooking } from "@/components/owner-portal/types"

function Stars({ n }: { n: number }) {
  return (
    <span className="whitespace-nowrap text-amber-500" role="img" aria-label={`${n} out of 5`}>
      {"★".repeat(n)}
      <span className="text-slate-300 dark:text-slate-600">{"★".repeat(5 - n)}</span>
    </span>
  )
}

export function OwnerReviewsPage() {
  const { data, loading, reload } = useApi<{ bookings: OwnerBooking[] }>("/api/bookings")
  const [reviewing, setReviewing] = useState<OwnerBooking | null>(null)

  const completed = (data?.bookings ?? []).filter((b) => b.status === "COMPLETED")
  const toReview = completed.filter((b) => !b.review)
  const written = completed.filter((b) => b.review)

  return (
    <>
      <PageHeader title="Reviews" description="Help other drivers by rating the garages you've used." />
      {loading && !data ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <div className="space-y-6">
          <Panel className="p-4 sm:p-6">
            <h2 className="mb-3 text-lg font-bold text-slate-900 dark:text-white">Waiting for your review</h2>
            {toReview.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">You&apos;re all caught up.</p>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-white/10">
                {toReview.map((b) => (
                  <li key={b.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-medium text-slate-900 dark:text-white">{b.garage.name}</p>
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        {getServiceLabel(b.serviceType)} · {formatDate(b.scheduledAt)}
                      </p>
                    </div>
                    <Button size="sm" variant="outline" className="gap-1.5 self-start sm:self-auto" onClick={() => setReviewing(b)}>
                      <Star className="h-3.5 w-3.5" /> Write a review
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel className="p-4 sm:p-6">
            <h2 className="mb-3 text-lg font-bold text-slate-900 dark:text-white">Your reviews</h2>
            {written.length === 0 ? (
              <EmptyState icon={Star} title="No reviews yet" description="Reviews you write appear here, along with any reply from the garage." />
            ) : (
              <ul className="space-y-4">
                {written.map((b) => (
                  <li key={b.id} className="rounded-lg border border-slate-100 p-4 dark:border-white/10">
                    <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium text-slate-900 dark:text-white">{b.garage.name}</span>
                      <Stars n={b.review!.rating} />
                    </div>
                    <p className="whitespace-pre-wrap break-words text-sm text-slate-700 dark:text-slate-300">{b.review!.comment}</p>
                    {b.review!.reply && (
                      <p className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-600 dark:bg-slate-900 dark:text-slate-300">
                        <strong className="block text-xs text-slate-500 dark:text-slate-400">Reply from {b.garage.name}</strong>
                        {b.review!.reply}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      )}
      <ReviewDialog
        bookingId={reviewing?.id ?? null}
        garageName={reviewing?.garage.name}
        onClose={() => setReviewing(null)}
        onSubmitted={() => {
          setReviewing(null)
          reload()
        }}
      />
    </>
  )
}
