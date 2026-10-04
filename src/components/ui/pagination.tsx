"use client"

import { ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { NativeSelect } from "@/components/ui/form-controls"

/** Compact page list: 1 … 4 5 [6] 7 8 … 20 */
export function pageList(page: number, totalPages: number): (number | "…")[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1)
  const pages = new Set([1, totalPages, page - 1, page, page + 1])
  const sorted = [...pages].filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b)
  const out: (number | "…")[] = []
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) out.push("…")
    out.push(p)
  })
  return out
}

interface PaginationProps {
  page: number
  pageSize: number
  total: number
  onPageChange: (page: number) => void
  onPageSizeChange?: (size: number) => void
  pageSizes?: number[]
  className?: string
}

export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  pageSizes = [10, 25, 50, 100],
  className,
}: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(total, page * pageSize)

  const btn =
    "inline-flex h-10 min-w-10 cursor-pointer items-center justify-center rounded-lg px-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40"

  return (
    <nav
      aria-label="Pagination"
      className={cn("flex flex-col items-center justify-between gap-3 text-sm text-slate-500 dark:text-slate-400 sm:flex-row", className)}
    >
      <div className="flex items-center gap-3">
        <span>
          Showing <strong className="text-slate-700 dark:text-slate-200">{from}–{to}</strong> of{" "}
          <strong className="text-slate-700 dark:text-slate-200">{total}</strong>
        </span>
        {onPageSizeChange && (
          <div className="w-32">
            <NativeSelect
              aria-label="Rows per page"
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="h-9"
            >
              {pageSizes.map((s) => (
                <option key={s} value={s}>
                  {s} / page
                </option>
              ))}
            </NativeSelect>
          </div>
        )}
      </div>

      <div className="flex items-center gap-1">
        <button
          type="button"
          className={cn(btn, "hover:bg-slate-100 dark:hover:bg-white/10")}
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          aria-label="Previous page"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        {/* Phones get "Page x of y" between prev/next; the numbered list only fits from sm up. */}
        <span className="px-2 text-slate-600 dark:text-slate-300 sm:hidden">
          Page {page} of {totalPages}
        </span>
        {pageList(page, totalPages).map((p, i) =>
          p === "…" ? (
            <span key={`gap-${i}`} className="hidden px-1 text-slate-400 sm:inline">…</span>
          ) : (
            <button
              key={p}
              type="button"
              onClick={() => onPageChange(p)}
              aria-current={p === page ? "page" : undefined}
              className={cn(
                btn,
                "hidden sm:inline-flex",
                p === page
                  ? "bg-[#1E3A5F] text-white dark:bg-blue-500"
                  : "text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10"
              )}
            >
              {p}
            </button>
          )
        )}
        <button
          type="button"
          className={cn(btn, "hover:bg-slate-100 dark:hover:bg-white/10")}
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          aria-label="Next page"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </nav>
  )
}
