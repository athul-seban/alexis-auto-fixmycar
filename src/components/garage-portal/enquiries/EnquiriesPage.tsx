"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Search } from "lucide-react"
import { NativeSelect, TextInput } from "@/components/ui/form-controls"
import { FilterTab, FilterTabList, FilterTabs } from "@/components/ui/filter-tabs"
import { useApi } from "@/hooks/use-api"
import { useDebounce } from "@/hooks/use-debounce"
import { useUrlParams } from "@/hooks/use-url-params"
import { garageLinks } from "@/lib/portal/links"
import type { EnquiriesResult, EnquiryKind, EnquiryStage } from "@/lib/portal/enquiries"
import { PageHeader } from "@/components/garage-portal/shared/PageHeader"
import { EnquiryList } from "@/components/garage-portal/enquiries/EnquiryList"
import type { TechnicianOption } from "@/components/garage-portal/bookings/types"

const STAGES: { value: EnquiryStage; label: string; empty: [string, string] }[] = [
  { value: "new", label: "New", empty: ["No new enquiries", "New quote requests and job leads that match your services and area will appear here."] },
  { value: "estimates", label: "Quotes sent", empty: ["No quotes awaiting a reply", "Once you've priced an enquiry it waits here until the customer books."] },
  { value: "closed", label: "Closed", empty: ["Nothing closed yet", "Accepted, declined and ignored enquiries end up here."] },
  { value: "all", label: "All", empty: ["No enquiries yet", "Customer requests will show up here."] },
]

export function EnquiriesPage() {
  const router = useRouter()
  const { searchParams, setParams } = useUrlParams()

  // A deep link (?quote=ID from a notification) searches every stage so the target is always visible.
  const quoteParam = searchParams.get("quote")
  const stage = (searchParams.get("stage") ?? (quoteParam ? "all" : "new")) as EnquiryStage
  const kind = (searchParams.get("kind") as EnquiryKind | null) ?? undefined
  const page = Number(searchParams.get("page") ?? 1) || 1
  const pageSize = Number(searchParams.get("pageSize") ?? 25) || 25

  const [search, setSearch] = useState(searchParams.get("q") ?? "")
  const q = useDebounce(search, 300).trim()

  // Counts for every stage (an unfiltered request, so badges don't shrink as you search).
  const [counts, setCounts] = useState<EnquiriesResult["counts"] | null>(null)
  const { data: techData } = useApi<{ technicians: TechnicianOption[] }>("/api/garage/technicians")

  return (
    <>
      <PageHeader title="Enquiries" description="Quote requests and job leads from customers looking for a garage like yours." />

      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <FilterTabs value={stage} onValueChange={(v) => setParams({ stage: v === "new" ? null : v, quote: null }, { resetPage: true })} className="min-w-0">
          <FilterTabList>
            {STAGES.map((s) => (
              <FilterTab key={s.value} value={s.value}>
                {s.label}
                {counts && counts[s.value] > 0 && (
                  <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${s.value === "new" ? "bg-[#C2410C] text-white" : "bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300"}`}>
                    {counts[s.value]}
                  </span>
                )}
              </FilterTab>
            ))}
          </FilterTabList>
        </FilterTabs>

        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="sm:w-44">
            <NativeSelect aria-label="Enquiry type" value={kind ?? "all"} onChange={(e) => setParams({ kind: e.target.value === "all" ? null : e.target.value }, { resetPage: true })}>
              <option value="all">All types</option>
              <option value="QUOTE">Quote requests</option>
              <option value="JOB">Job leads</option>
            </NativeSelect>
          </div>
          <div className="relative sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <TextInput aria-label="Search enquiries" className="pl-9" placeholder="Search name, reg, description…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>
      </div>

      <EnquiryList
        stage={stage}
        kind={kind}
        q={q || undefined}
        page={page}
        pageSize={pageSize}
        onPageChange={(p) => setParams({ page: p <= 1 ? null : p })}
        onPageSizeChange={(s) => setParams({ pageSize: s === 25 ? null : s }, { resetPage: true })}
        technicians={techData?.technicians ?? []}
        highlightKey={quoteParam ? `QUOTE:${quoteParam}` : null}
        onData={(r) => setCounts(r.counts)}
        onBooked={(id) => router.push(garageLinks.booking(id))}
        emptyTitle={STAGES.find((s) => s.value === stage)?.empty[0]}
        emptyDescription={STAGES.find((s) => s.value === stage)?.empty[1]}
      />
    </>
  )
}
