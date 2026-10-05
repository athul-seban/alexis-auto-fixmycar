"use client"

import { useState } from "react"
import { Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { FieldLabel, TextInput } from "@/components/ui/form-controls"
import { useToast } from "@/components/ui/toast"
import { sendJson, useApi } from "@/hooks/use-api"
import { useDebounce } from "@/hooks/use-debounce"
import { formatPhone } from "@/lib/portal/phone"
import type { CustomerRow } from "@/components/garage-portal/customers/types"

const keyLabel = (key: string) => key.slice(2).replace(/^(\d{5})(\d+)$/, "$1 $2")

interface MergeSectionProps {
  customer: CustomerRow
  /** Called after a merge or split so the list and this drawer reload. */
  onChanged: () => void
}

/** "Same person?": fold a duplicate record into this customer, and split earlier merges back out. */
export function MergeSection({ customer, onChanged }: MergeSectionProps) {
  const { toast } = useToast()
  const [text, setText] = useState("")
  const q = useDebounce(text.trim(), 300)
  const [picked, setPicked] = useState<CustomerRow | null>(null)
  const [busy, setBusy] = useState(false)

  const { data } = useApi<{ customers: CustomerRow[] }>(q.length >= 2 ? `/api/garage/customers?q=${encodeURIComponent(q)}&pageSize=10&sort=name` : null)
  const matches = (data?.customers ?? []).filter((c) => c.key !== customer.key)

  async function merge() {
    if (!picked) return
    setBusy(true)
    const res = await sendJson("/api/garage/customers/merge", "POST", { from: picked.key, to: customer.key })
    setBusy(false)
    if (!res.ok) return toast(res.error ?? "Couldn't merge", "error")
    toast(`${picked.name} merged into ${customer.name}`)
    setPicked(null)
    setText("")
    onChanged()
  }

  async function split(key: string) {
    setBusy(true)
    const res = await sendJson(`/api/garage/customers/merge?from=${encodeURIComponent(key)}`, "DELETE")
    setBusy(false)
    if (!res.ok) return toast(res.error ?? "Couldn't split", "error")
    toast("Records split apart")
    onChanged()
  }

  return (
    <section className="border-t border-slate-100 px-6 py-5 dark:border-white/10">
      <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Same person?</h3>

      {customer.mergedFrom.length > 0 && (
        <ul className="mb-4 space-y-1.5">
          {customer.mergedFrom.map((k) => (
            <li key={k} className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800">
              <span className="min-w-0 truncate text-slate-700 dark:text-slate-300">Merged: {keyLabel(k)}</span>
              <Button size="sm" variant="secondary" disabled={busy} onClick={() => split(k)} aria-label={`Split ${keyLabel(k)} back out`}>
                Split
              </Button>
            </li>
          ))}
        </ul>
      )}

      <FieldLabel htmlFor="merge-search">Find a duplicate to merge into {customer.name}</FieldLabel>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <TextInput id="merge-search" type="search" className="pl-9" value={text} onChange={(e) => setText(e.target.value)} placeholder="Name, email, phone or reg…" />
      </div>
      {q.length >= 2 && (
        <ul className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200 dark:divide-white/10 dark:border-white/10" aria-live="polite">
          {matches.length === 0 ? (
            <li className="px-3 py-2.5 text-sm text-slate-500 dark:text-slate-400">{data ? "No other customers match." : "Searching…"}</li>
          ) : (
            matches.map((c) => (
              <li key={c.key}>
                <button type="button" onClick={() => setPicked(c)} className="flex min-h-11 w-full cursor-pointer items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-white/5">
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-slate-900 dark:text-white">{c.name}</span>
                    <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{c.email ?? (c.phone ? formatPhone(c.phone) : "No contact details")}</span>
                  </span>
                  <span className="flex-shrink-0 text-xs font-semibold text-slate-600 dark:text-slate-300">Merge…</span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}

      <ConfirmDialog
        open={picked !== null}
        onOpenChange={(o) => !o && !busy && setPicked(null)}
        title="Merge these customers?"
        description={picked ? `${picked.name}'s bookings, vehicles and note will be added to ${customer.name}. You can split them apart again later.` : ""}
        confirmLabel="Merge"
        loading={busy}
        onConfirm={merge}
      />
    </section>
  )
}
