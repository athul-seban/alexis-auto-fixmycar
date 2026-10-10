"use client"

import Link from "next/link"
import { MessagesSquare } from "lucide-react"
import { EmptyState } from "@/components/ui/empty-state"
import { Skeleton } from "@/components/ui/skeleton"
import { useApi } from "@/hooks/use-api"
import { cn, formatDate } from "@/lib/utils"
import { PageHeader, Panel } from "@/components/garage-portal/shared/PageHeader"
import type { ThreadSummary } from "@/lib/messaging"

/** Every conversation with a customer, unread first-class. Opening one goes to the booking or enquiry where the thread lives. */
export function GarageMessagesPage() {
  const { data, error } = useApi<{ threads: ThreadSummary[]; unread: number }>("/api/messages/summary")

  return (
    <>
      <PageHeader
        title="Messages"
        description={data && data.unread > 0 ? `${data.unread} unread` : "Conversations with your customers about quotes and bookings."}
      />
      {error && !data ? (
        <Panel className="p-6 text-center text-sm text-red-700 dark:text-red-400" role="alert">{error}</Panel>
      ) : !data ? (
        <Skeleton className="h-48 w-full rounded-xl" />
      ) : data.threads.length === 0 ? (
        <Panel>
          <EmptyState icon={MessagesSquare} title="No messages yet" description="When a customer messages you about a quote or booking, it shows up here." />
        </Panel>
      ) : (
        <Panel>
          <ul className="divide-y divide-slate-100 dark:divide-white/10" aria-label="Conversations">
            {data.threads.map((t) => (
              <li key={t.key}>
                <Link href={t.link} className="flex items-start gap-3 px-4 py-3 hover:bg-slate-50 focus-visible:bg-slate-50 dark:hover:bg-slate-900/40 sm:px-6">
                  <span
                    className={cn("mt-2 h-2.5 w-2.5 flex-shrink-0 rounded-full", t.unread > 0 ? "bg-orange-500" : "bg-transparent")}
                    aria-label={t.unread > 0 ? `${t.unread} unread` : undefined}
                    role={t.unread > 0 ? "img" : undefined}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-3">
                      <span className={cn("truncate text-slate-900 dark:text-white", t.unread > 0 ? "font-bold" : "font-medium")}>{t.with}</span>
                      <span className="flex-shrink-0 text-xs text-slate-500 dark:text-slate-400">{formatDate(t.lastAt)}</span>
                    </span>
                    <span className="block text-xs text-slate-500 dark:text-slate-400">{t.about}</span>
                    <span className={cn("mt-0.5 block truncate text-sm", t.unread > 0 ? "text-slate-800 dark:text-slate-100" : "text-slate-500 dark:text-slate-400")}>{t.lastBody}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </>
  )
}
