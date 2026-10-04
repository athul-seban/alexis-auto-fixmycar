"use client"

import { useState } from "react"
import { MessageSquareReply, Pencil, Star } from "lucide-react"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { NativeSelect } from "@/components/ui/form-controls"
import { Pagination } from "@/components/ui/pagination"
import { Skeleton } from "@/components/ui/skeleton"
import { useApi } from "@/hooks/use-api"
import { useUrlParams } from "@/hooks/use-url-params"
import { cn, getServiceLabel } from "@/lib/utils"
import { formatLondonDate } from "@/lib/portal/tz"
import { garageLinks } from "@/lib/portal/links"
import { PageHeader, Panel } from "@/components/garage-portal/shared/PageHeader"
import { ReplyForm } from "@/components/garage-portal/reviews/ReplyForm"

interface ReviewRow {
  id: string
  rating: number
  title: string | null
  comment: string
  createdAt: string
  reply: string | null
  repliedAt: string | null
  customerName: string
  serviceType: string
  bookingId: string
  bookingReference: string | null
}

interface ReviewsResponse {
  reviews: ReviewRow[]
  total: number
  page: number
  pageSize: number
  totalPages: number
  counts: { byRating: Record<number, number>; unreplied: number }
  summary: { average: number; total: number }
}

function Stars({ rating, className }: { rating: number; className?: string }) {
  return (
    <span className="inline-flex items-center gap-0.5" role="img" aria-label={`${rating} out of 5 stars`}>
      {Array.from({ length: 5 }, (_, i) => (
        <Star key={i} className={cn("h-4 w-4", i < rating ? "fill-yellow-400 text-yellow-400" : "text-slate-300 dark:text-slate-600", className)} />
      ))}
    </span>
  )
}

export function ReviewsPage() {
  const { searchParams, setParams } = useUrlParams()
  const rating = searchParams.get("rating") ?? ""
  const replied = searchParams.get("replied") ?? ""
  const page = Number(searchParams.get("page") ?? 1) || 1
  const pageSize = Number(searchParams.get("pageSize") ?? 10) || 10

  const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
  if (rating) query.set("rating", rating)
  if (replied) query.set("replied", replied)

  const { data, loading, error, reload } = useApi<ReviewsResponse>(`/api/garage/reviews?${query}`)
  const [replying, setReplying] = useState<string | null>(null)

  const rowsTotal = data ? Object.values(data.counts.byRating).reduce((a, b) => a + b, 0) : 0

  return (
    <>
      <PageHeader title="Reviews" description="What customers say about your garage. Replies are public, so keep them friendly." />

      {error && !data ? (
        <Panel className="p-6 text-center text-sm text-red-700 dark:text-red-400" role="alert">{error}</Panel>
      ) : !data ? (
        <div className="space-y-4"><Skeleton className="h-40 w-full rounded-xl" /><Skeleton className="h-32 w-full rounded-xl" /></div>
      ) : (
        <>
          {/* Summary */}
          <Panel className="mb-6 p-5 sm:p-6">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
              <div className="text-center sm:min-w-40">
                <div className="text-5xl font-bold tracking-tight text-slate-900 dark:text-white">{data.summary.total > 0 ? data.summary.average.toFixed(1) : "–"}</div>
                <Stars rating={Math.round(data.summary.average)} className="h-5 w-5" />
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{data.summary.total} review{data.summary.total === 1 ? "" : "s"}</p>
              </div>
              <div className="flex-1 space-y-1.5">
                {[5, 4, 3, 2, 1].map((stars) => {
                  const count = data.counts.byRating[stars] ?? 0
                  const pct = rowsTotal ? Math.round((count / rowsTotal) * 100) : 0
                  return (
                    <button
                      key={stars}
                      type="button"
                      onClick={() => setParams({ rating: rating === String(stars) ? null : stars }, { resetPage: true })}
                      aria-pressed={rating === String(stars)}
                      className={cn("flex w-full cursor-pointer items-center gap-2 rounded-md px-1 py-0.5 text-xs transition-colors hover:bg-slate-50 dark:hover:bg-white/5", rating === String(stars) && "bg-slate-100 dark:bg-white/10")}
                    >
                      <span className="w-3 text-slate-500 dark:text-slate-400">{stars}</span>
                      <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                      <span className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
                        <span className="block h-2 rounded-full bg-yellow-400" style={{ width: `${pct}%` }} />
                      </span>
                      <span className="w-8 text-right text-slate-500 dark:text-slate-400">{count}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          </Panel>

          {/* Filters */}
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <div className="w-44">
              <NativeSelect aria-label="Filter by rating" value={rating || "all"} onChange={(e) => setParams({ rating: e.target.value === "all" ? null : e.target.value }, { resetPage: true })}>
                <option value="all">All ratings</option>
                {[5, 4, 3, 2, 1].map((s) => (
                  <option key={s} value={s}>{s} star{s === 1 ? "" : "s"}</option>
                ))}
              </NativeSelect>
            </div>
            <div className="w-48">
              <NativeSelect aria-label="Filter by reply" value={replied || "all"} onChange={(e) => setParams({ replied: e.target.value === "all" ? null : e.target.value }, { resetPage: true })}>
                <option value="all">Replied or not</option>
                <option value="no">Needs a reply{data.counts.unreplied > 0 ? ` (${data.counts.unreplied})` : ""}</option>
                <option value="yes">Replied</option>
              </NativeSelect>
            </div>
          </div>

          {data.reviews.length === 0 ? (
            <Panel>
              <EmptyState
                icon={Star}
                title={rating || replied ? "No reviews match" : "No reviews yet"}
                description={rating || replied ? "Try removing a filter." : "After a customer's booking is completed they can leave a review, and it will appear here."}
              />
            </Panel>
          ) : (
            <div className={cn("space-y-4", loading && "opacity-60 transition-opacity")}>
              {data.reviews.map((r) => (
                <Panel key={r.id} className="p-5">
                  <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-3">
                        <Stars rating={r.rating} />
                        <span className="text-sm font-semibold text-slate-900 dark:text-white">{r.customerName}</span>
                      </div>
                      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                        {formatLondonDate(r.createdAt)} · {getServiceLabel(r.serviceType)}
                        {r.bookingReference && <> · <a href={garageLinks.booking(r.bookingId)} className="hover:underline">{r.bookingReference}</a></>}
                      </p>
                    </div>
                    {!r.reply && replying !== r.id && (
                      <Button size="sm" variant="secondary" className="gap-1.5" onClick={() => setReplying(r.id)}>
                        <MessageSquareReply className="h-3.5 w-3.5" /> Reply
                      </Button>
                    )}
                  </div>
                  {r.title && <p className="text-sm font-semibold text-slate-900 dark:text-white">{r.title}</p>}
                  <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">{r.comment}</p>

                  {replying === r.id ? (
                    <ReplyForm reviewId={r.id} initial={r.reply ?? ""} onCancel={() => setReplying(null)} onSaved={() => { setReplying(null); reload() }} />
                  ) : r.reply ? (
                    <div className="mt-4 rounded-lg border-l-4 border-[#F97316] bg-slate-50 p-3 dark:bg-white/5">
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Your reply{r.repliedAt && ` · ${formatLondonDate(r.repliedAt)}`}</p>
                        <button type="button" onClick={() => setReplying(r.id)} className="inline-flex cursor-pointer items-center gap-1 text-xs font-semibold text-[#1E3A5F] hover:underline dark:text-blue-300">
                          <Pencil className="h-3 w-3" /> Edit
                        </button>
                      </div>
                      <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">{r.reply}</p>
                    </div>
                  ) : null}
                </Panel>
              ))}
            </div>
          )}

          {data.total > pageSize && (
            <Pagination className="mt-5" page={page} pageSize={pageSize} total={data.total} pageSizes={[10, 25, 50]} onPageChange={(p) => setParams({ page: p <= 1 ? null : p })} onPageSizeChange={(s) => setParams({ pageSize: s === 10 ? null : s }, { resetPage: true })} />
          )}
        </>
      )}
    </>
  )
}
