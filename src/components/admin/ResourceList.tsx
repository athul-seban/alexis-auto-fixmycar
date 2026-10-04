"use client"

import { Suspense, type ReactNode } from "react"
import { SearchX } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DataTable, type DataColumn } from "@/components/ui/data-table"
import { EmptyState } from "@/components/ui/empty-state"
import { ParamSearch, type SetParams } from "@/components/ui/param-search"
import { Pagination } from "@/components/ui/pagination"
import { FilterTab, FilterTabList, FilterTabs } from "@/components/ui/filter-tabs"
import { useApi } from "@/hooks/use-api"
import { useUrlParams } from "@/hooks/use-url-params"
import { PageHeader, Panel } from "@/components/garage-portal/shared/PageHeader"

export interface ListTab {
  value: string
  label: string
  /** Key into the response's `counts` object. */
  countKey?: string
}

interface ResourceListProps<T> {
  title: string
  description: string
  endpoint: string
  /** Property of the response that holds the rows. */
  itemsKey: string
  columns: DataColumn<T>[]
  rowKey: (row: T) => string
  /** Status-style tabs bound to a query param (omit for lists without them). */
  tabs?: { param: string; options: ListTab[]; defaultValue: string; allValue?: string }
  searchPlaceholder?: string
  /** Extra filter controls rendered beside the search box. */
  filters?: (params: URLSearchParams, setParams: SetParams) => ReactNode
  /** Query params (beyond tab/search/page) forwarded to the API. */
  extraParams?: string[]
  actions?: ReactNode
  onRowClick?: (row: T) => void
  rowLabel?: (row: T) => string
  caption: string
  emptyTitle: string
  emptyDescription?: string
  /** Rendered after the list; receives `reload` so dialogs can refresh it after a mutation. */
  children?: (ctx: { reload: () => void }) => ReactNode
}

interface ListResponse {
  total: number
  counts?: Record<string, number>
  [key: string]: unknown
}

/**
 * The shared shape of every admin list page: header, optional status tabs + search + filters, a responsive
 * table (cards on phones) and pagination, with all state in the URL so views are shareable and survive refresh.
 */
function ResourceListInner<T>({
  title,
  description,
  endpoint,
  itemsKey,
  columns,
  rowKey,
  tabs,
  searchPlaceholder,
  filters,
  extraParams = [],
  actions,
  onRowClick,
  rowLabel,
  caption,
  emptyTitle,
  emptyDescription,
  children,
}: ResourceListProps<T>) {
  const { searchParams, setParams } = useUrlParams()
  const page = Number(searchParams.get("page") ?? 1) || 1
  const pageSize = Number(searchParams.get("pageSize") ?? 10) || 10
  const tab = tabs ? (searchParams.get(tabs.param) ?? tabs.defaultValue) : null

  const api = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
  const q = searchParams.get("q")
  if (q) api.set("q", q)
  if (tabs && tab && tab !== tabs.allValue) api.set(tabs.param, tab)
  for (const key of extraParams) {
    const v = searchParams.get(key)
    if (v) api.set(key, v)
  }

  const { data, loading, error, reload } = useApi<ListResponse>(`${endpoint}?${api.toString()}`)
  const rows = (data?.[itemsKey] as T[] | undefined) ?? []
  const total = data?.total ?? 0
  const filtered = Boolean(q) || extraParams.some((k) => searchParams.get(k))

  return (
    <>
      <PageHeader title={title} description={description} actions={actions} />
      <Panel className="p-4 sm:p-6">
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          {tabs ? (
            <FilterTabs
              value={tab ?? tabs.defaultValue}
              onValueChange={(v) => setParams({ [tabs.param]: v === tabs.defaultValue ? null : v }, { resetPage: true })}
              className="min-w-0"
            >
              <FilterTabList aria-label={`${title} filter`}>
                {tabs.options.map((t) => (
                  <FilterTab key={t.value} value={t.value}>
                    {t.label}
                    {data?.counts && t.countKey && (
                      <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-white/10 dark:text-slate-300">
                        {data.counts[t.countKey] ?? 0}
                      </span>
                    )}
                  </FilterTab>
                ))}
              </FilterTabList>
            </FilterTabs>
          ) : (
            <span />
          )}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            {filters?.(searchParams, setParams)}
            {searchPlaceholder && <ParamSearch params={searchParams} setParams={setParams} placeholder={searchPlaceholder} label={`Search ${title.toLowerCase()}`} />}
          </div>
        </div>

        <p className="mb-2 text-sm text-slate-500 dark:text-slate-400" aria-live="polite">
          {data ? `${total} ${total === 1 ? "result" : "results"}` : "Loading…"}
        </p>

        <div className="-mx-4 border-t border-slate-100 dark:border-white/10 sm:-mx-6">
          {error && !data ? (
            <div className="p-6 text-center">
              <p role="alert" className="mb-3 text-sm text-red-700 dark:text-red-400">
                {error}
              </p>
              <Button size="sm" variant="secondary" onClick={reload}>
                Try again
              </Button>
            </div>
          ) : (
            <DataTable
              caption={caption}
              columns={columns}
              rows={rows}
              rowKey={rowKey}
              loading={loading}
              onRowClick={onRowClick}
              rowLabel={rowLabel}
              empty={<EmptyState icon={SearchX} title={filtered ? "Nothing matches" : emptyTitle} description={filtered ? "Try a different search or filter." : emptyDescription} />}
            />
          )}
        </div>

        {total > 0 && (
          <Pagination
            className="mt-4"
            page={page}
            pageSize={pageSize}
            total={total}
            pageSizes={[10, 25, 50]}
            onPageChange={(p) => setParams({ page: p <= 1 ? null : p })}
            onPageSizeChange={(s) => setParams({ pageSize: s === 10 ? null : s }, { resetPage: true })}
          />
        )}
      </Panel>
      {children?.({ reload })}
    </>
  )
}

// useSearchParams needs a Suspense boundary; wrapping here keeps every page file a one-liner.
export function ResourceList<T>(props: ResourceListProps<T>) {
  return (
    <Suspense fallback={null}>
      <ResourceListInner {...props} />
    </Suspense>
  )
}
