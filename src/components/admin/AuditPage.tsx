"use client"

import type { DataColumn } from "@/components/ui/data-table"
import { formatLondonDateTime } from "@/lib/portal/tz"
import { ResourceList } from "@/components/admin/ResourceList"

interface AuditEntry {
  id: string
  action: string
  actor: string
  targetType: string
  targetId: string
  detail: string | null
  createdAt: string
}

/** "USER_ROLE" -> "User role" */
const label = (action: string) => {
  const t = action.toLowerCase().replace(/_/g, " ")
  return t.charAt(0).toUpperCase() + t.slice(1)
}

const COLUMNS: DataColumn<AuditEntry>[] = [
  { id: "action", header: "Action", mobile: "title", className: "font-medium text-slate-900 dark:text-white", cell: (e) => label(e.action) },
  { id: "detail", header: "Detail", className: "max-w-sm whitespace-normal break-words", cell: (e) => e.detail ?? "—" },
  { id: "actor", header: "By", className: "text-slate-500 dark:text-slate-400", cell: (e) => e.actor },
  { id: "when", header: "When", className: "text-slate-500 dark:text-slate-400", cell: (e) => formatLondonDateTime(e.createdAt) },
]

export function AdminAuditPage() {
  return (
    <ResourceList<AuditEntry>
      title="Audit log"
      description="Who approved, suspended, changed or deleted what in the admin portal."
      caption="Admin actions"
      endpoint="/api/admin/audit"
      itemsKey="entries"
      columns={COLUMNS}
      rowKey={(e) => e.id}
      tabs={{
        param: "target",
        defaultValue: "ALL",
        allValue: "ALL",
        options: [
          { value: "ALL", label: "All", countKey: "ALL" },
          { value: "GARAGE", label: "Garages", countKey: "GARAGE" },
          { value: "USER", label: "Users", countKey: "USER" },
          { value: "REVIEW", label: "Reviews", countKey: "REVIEW" },
        ],
      }}
      searchPlaceholder="Search action, detail or admin…"
      emptyTitle="Nothing recorded yet"
      emptyDescription="Admin actions appear here as they happen."
    />
  )
}
