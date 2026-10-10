"use client"

import { useState } from "react"
import { MessagesSquare } from "lucide-react"
import { DataTable, type DataColumn } from "@/components/ui/data-table"
import { EmptyState } from "@/components/ui/empty-state"
import { useApi } from "@/hooks/use-api"
import { cn, formatDate, getServiceLabel } from "@/lib/utils"
import type { ThreadSummary } from "@/lib/messaging"
import { PageHeader, Panel } from "@/components/garage-portal/shared/PageHeader"
import { StatusPill } from "@/components/garage-portal/shared/StatusPill"
import { ThreadDialog, type ThreadTarget } from "@/components/owner-portal/ThreadDialog"
import type { OwnerBooking, OwnerQuote } from "@/components/owner-portal/types"

interface Conversation {
  key: string
  target: ThreadTarget
  about: string
  status: string
  at: string
}

/** Every booking and quote is a conversation with its garage; there is no separate inbox model. */
export function OwnerMessagesPage() {
  const bookings = useApi<{ bookings: OwnerBooking[] }>("/api/bookings")
  const quotes = useApi<{ quotes: OwnerQuote[] }>("/api/quotes")
  const summary = useApi<{ threads: ThreadSummary[] }>("/api/messages/summary")
  const unreadByKey = new Map((summary.data?.threads ?? []).map((t) => [t.key, t.unread]))
  const [open, setOpen] = useState<ThreadTarget | null>(null)

  const rows: Conversation[] = [
    ...(bookings.data?.bookings ?? []).map((b) => ({
      key: `b-${b.id}`,
      target: { kind: "booking" as const, id: b.id, garageName: b.garage.name },
      about: `Booking · ${getServiceLabel(b.serviceType)}`,
      status: b.status,
      at: b.scheduledAt,
    })),
    ...(quotes.data?.quotes ?? []).map((q) => ({
      key: `q-${q.id}`,
      target: { kind: "quote" as const, id: q.id, garageName: q.garage.name },
      about: `Quote · ${getServiceLabel(q.serviceType)}`,
      status: q.status,
      at: q.createdAt,
    })),
  ].sort((a, b) => b.at.localeCompare(a.at))

  const columns: DataColumn<Conversation>[] = [
    {
      id: "garage",
      header: "Garage",
      mobile: "title",
      className: "font-medium text-slate-900 dark:text-white",
      cell: (c) => {
        const unread = unreadByKey.get(`${c.target.kind === "quote" ? "q" : "b"}:${c.target.id}`) ?? 0
        return (
          <span className={cn("inline-flex items-center gap-2", unread > 0 && "font-bold")}>
            {unread > 0 && <span className="h-2.5 w-2.5 rounded-full bg-orange-500" role="img" aria-label={`${unread} unread`} />}
            {c.target.garageName}
          </span>
        )
      },
    },
    { id: "about", header: "About", cell: (c) => c.about },
    { id: "date", header: "Date", className: "text-slate-500 dark:text-slate-400", cell: (c) => formatDate(c.at) },
    { id: "status", header: "Status", mobile: "badge", cell: (c) => <StatusPill status={c.status} /> },
  ]

  return (
    <>
      <PageHeader title="Messages" description="Chat with a garage about a booking or quote — open one to see the conversation." />
      <Panel className="p-4 sm:p-6">
        <div className="-mx-4 sm:-mx-6">
          <DataTable
            caption="Conversations"
            columns={columns}
            rows={rows}
            rowKey={(c) => c.key}
            loading={bookings.loading && quotes.loading && rows.length === 0}
            onRowClick={(c) => setOpen(c.target)}
            rowLabel={(c) => `Open conversation with ${c.target.garageName}`}
            empty={<EmptyState icon={MessagesSquare} title="No conversations yet" description="Once you request a quote or book, you can message the garage here." />}
          />
        </div>
      </Panel>
      <ThreadDialog
        target={open}
        onClose={() => {
          setOpen(null)
          summary.reload() // opening a thread marks it read
        }}
      />
    </>
  )
}
