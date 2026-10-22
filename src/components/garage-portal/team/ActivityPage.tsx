"use client"

import { useState } from "react"
import { History } from "lucide-react"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { Skeleton } from "@/components/ui/skeleton"
import { useApi } from "@/hooks/use-api"
import { formatDate } from "@/lib/utils"
import { PageHeader, Panel } from "@/components/garage-portal/shared/PageHeader"

interface Entry {
  id: string
  at: string
  label: string
  by: string | null
  detail: string | null
}

const when = (iso: string) => `${formatDate(iso)} ${new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`

export function ActivityPage() {
  const [page, setPage] = useState(1)
  const { data, error, loading } = useApi<{ entries: Entry[]; total: number; page: number; totalPages: number }>(`/api/garage/audit?page=${page}`)

  return (
    <>
      <PageHeader title="Activity" description="Who changed what in your business: team, roles, locations and details." />
      {error && !data ? (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">{error}</p>
      ) : !data ? (
        <Skeleton className="h-64 w-full rounded-xl" />
      ) : data.entries.length === 0 ? (
        <EmptyState icon={History} title="Nothing yet" description="Changes to your team, roles and locations will be listed here." />
      ) : (
        <>
          <Panel>
            <ul className="divide-y divide-slate-100 dark:divide-white/10" aria-label="Activity">
              {data.entries.map((e) => (
                <li key={e.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-4 py-3 text-sm">
                  <span className="font-semibold text-slate-900 dark:text-white">{e.label}</span>
                  {e.detail && <span className="min-w-0 truncate text-slate-600 dark:text-slate-300">{e.detail}</span>}
                  <span className="ml-auto whitespace-nowrap text-xs text-slate-500 dark:text-slate-400">
                    {e.by ?? "System"} · {when(e.at)}
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
          {data.totalPages > 1 && (
            <nav aria-label="Pages" className="mt-4 flex items-center justify-between text-sm text-slate-600 dark:text-slate-300">
              <Button size="sm" variant="secondary" disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)}>Newer</Button>
              <span>Page {data.page} of {data.totalPages}</span>
              <Button size="sm" variant="secondary" disabled={page >= data.totalPages || loading} onClick={() => setPage((p) => p + 1)}>Older</Button>
            </nav>
          )}
        </>
      )}
    </>
  )
}
