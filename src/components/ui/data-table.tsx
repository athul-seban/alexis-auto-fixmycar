"use client"

import * as React from "react"
import { ArrowDown, ArrowUp } from "lucide-react"
import { cn } from "@/lib/utils"
import { NativeSelect } from "@/components/ui/form-controls"
import { Skeleton } from "@/components/ui/skeleton"
import { SortableHead, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

/**
 * Where a column lands in the stacked card shown below the `md` breakpoint:
 *  - title:  the card's heading (and the tap target when the row is clickable) — exactly one per table
 *  - badge:  right-aligned beside the title (status pills, prices)
 *  - detail: a "Label  value" line (the default)
 *  - actions: buttons along the card's bottom edge, kept clickable above the stretched title button; on desktop
 *    the cell swallows clicks so pressing a button doesn't also open the row
 *  - hidden: desktop only
 */
export type MobileSlot = "title" | "badge" | "detail" | "actions" | "hidden"

export interface DataColumn<T, S extends string = string> {
  id: string
  header: string
  cell: (row: T) => React.ReactNode
  sortKey?: S
  mobile?: MobileSlot
  /** Extra classes for the desktop <td>. */
  className?: string
}

interface DataTableProps<T, S extends string = string> {
  /** Visually hidden table name for screen readers. */
  caption: string
  columns: DataColumn<T, S>[]
  rows: T[]
  rowKey: (row: T) => string
  loading?: boolean
  sort?: S
  dir?: "asc" | "desc"
  /** Called with a column's sortKey; clicking the active one should flip the direction. */
  onSort?: (key: S) => void
  onRowClick?: (row: T) => void
  /** Accessible name for the clickable title, e.g. "Open booking QMG-123". */
  rowLabel?: (row: T) => string
  selectedKey?: string | null
  empty?: React.ReactNode
  skeletonRows?: number
  /** Row checkboxes (bulk actions). `selected` holds row keys. */
  selectable?: boolean
  selected?: ReadonlySet<string>
  onSelectedChange?: (next: Set<string>) => void
}

const slotOf = <T, S extends string>(c: DataColumn<T, S>): MobileSlot => c.mobile ?? "detail"

/**
 * Tables don't fit a phone, so below `md` each row becomes a card (title, badge, then label/value pairs) and
 * the sortable headers become a "Sort by" control. From `md` up it is a normal semantic table. Both are in the
 * DOM but only one is displayed (`display: none` also removes the other from the accessibility tree).
 */
export function DataTable<T, S extends string = string>({
  caption,
  columns,
  rows,
  rowKey,
  loading = false,
  sort,
  dir = "asc",
  onSort,
  onRowClick,
  rowLabel,
  selectedKey,
  empty,
  skeletonRows = 5,
  selectable = false,
  selected,
  onSelectedChange,
}: DataTableProps<T, S>) {
  const sortable = columns.filter((c): c is DataColumn<T, S> & { sortKey: S } => c.sortKey !== undefined)
  const title = columns.find((c) => slotOf(c) === "title") ?? columns[0]
  const badges = columns.filter((c) => slotOf(c) === "badge")
  const details = columns.filter((c) => slotOf(c) === "detail" && c !== title)
  const actions = columns.filter((c) => slotOf(c) === "actions")
  const showEmpty = !loading && rows.length === 0
  const pickable = selectable && selected !== undefined && onSelectedChange !== undefined
  const allKeys = rows.map(rowKey)
  const allSelected = pickable && allKeys.length > 0 && allKeys.every((k) => selected.has(k))
  const toggle = (key: string) => {
    if (!pickable) return
    const next = new Set(selected)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    onSelectedChange(next)
  }
  const toggleAll = () => pickable && onSelectedChange(allSelected ? new Set() : new Set(allKeys))
  const boxClass = "h-5 w-5 cursor-pointer accent-[#1E3A5F]"

  if (showEmpty && empty) return <>{empty}</>

  return (
    <div aria-busy={loading}>
      {/* Phones: sort control + cards */}
      <div className="md:hidden">
        {sortable.length > 0 && onSort && sort && (
          <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3 dark:border-white/10">
            <label htmlFor="data-table-sort" className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Sort by
            </label>
            <NativeSelect
              id="data-table-sort"
              value={sort}
              onChange={(e) => onSort(e.target.value as S)}
              className="h-10 min-w-0 flex-1 text-sm"
            >
              {sortable.map((c) => (
                <option key={c.id} value={c.sortKey}>
                  {c.header}
                </option>
              ))}
            </NativeSelect>
            <button
              type="button"
              onClick={() => onSort(sort)}
              aria-label={dir === "asc" ? "Ascending — switch to descending" : "Descending — switch to ascending"}
              className="flex h-10 w-10 flex-shrink-0 cursor-pointer items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
            >
              {dir === "asc" ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
            </button>
          </div>
        )}

        {pickable && rows.length > 0 && (
          <label className="flex min-h-11 cursor-pointer items-center gap-3 border-b border-slate-100 px-4 text-sm font-medium text-slate-600 dark:border-white/10 dark:text-slate-300">
            <input type="checkbox" className={boxClass} checked={allSelected} onChange={toggleAll} />
            Select all on this page
          </label>
        )}
        <p className="sr-only">{caption}</p>
        <ul className={cn("divide-y divide-slate-100 dark:divide-white/10", loading && "opacity-60 transition-opacity")}>
          {loading && rows.length === 0
            ? Array.from({ length: skeletonRows }, (_, i) => (
                <li key={i} className="space-y-2 px-4 py-4">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-3 w-1/2" />
                  <Skeleton className="h-3 w-3/4" />
                </li>
              ))
            : rows.map((row) => {
                const key = rowKey(row)
                return (
                  <li
                    key={key}
                    className={cn("relative px-4 py-3.5", onRowClick && "hover:bg-slate-50 dark:hover:bg-white/5", selectedKey === key && "bg-blue-50/60 dark:bg-white/5")}
                  >
                    <div className="flex items-start justify-between gap-3">
                      {pickable && (
                        <input type="checkbox" className={cn(boxClass, "relative z-10 mt-0.5 flex-shrink-0")} checked={selected.has(key)} onChange={() => toggle(key)} aria-label={`Select ${rowLabel?.(row) ?? "row"}`} />
                      )}
                      <div className="min-w-0 flex-1 font-semibold text-slate-900 dark:text-white">
                        {onRowClick ? (
                          // Stretched button: the whole card is the tap target without nesting interactive content.
                          <button
                            type="button"
                            onClick={() => onRowClick(row)}
                            aria-label={rowLabel?.(row)}
                            className="cursor-pointer text-left after:absolute after:inset-0 after:content-['']"
                          >
                            {title.cell(row)}
                          </button>
                        ) : (
                          title.cell(row)
                        )}
                      </div>
                      {badges.length > 0 && (
                        <div className="flex flex-shrink-0 flex-col items-end gap-1 text-sm">
                          {badges.map((c) => (
                            <div key={c.id}>{c.cell(row)}</div>
                          ))}
                        </div>
                      )}
                    </div>
                    {details.length > 0 && (
                      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                        {details.map((c) => (
                          <React.Fragment key={c.id}>
                            <dt className="text-slate-400 dark:text-slate-500">{c.header}</dt>
                            <dd className="min-w-0 break-words text-slate-700 dark:text-slate-300">{c.cell(row)}</dd>
                          </React.Fragment>
                        ))}
                      </dl>
                    )}
                    {actions.length > 0 && (
                      <div className="relative z-10 mt-3 flex flex-wrap gap-2">
                        {actions.map((c) => (
                          <React.Fragment key={c.id}>{c.cell(row)}</React.Fragment>
                        ))}
                      </div>
                    )}
                  </li>
                )
              })}
        </ul>
      </div>

      {/* Tablet / desktop: semantic table */}
      <div className="hidden md:block">
        <Table>
          <caption className="sr-only">{caption}</caption>
          <TableHeader>
            <TableRow className="border-t-0">
              {pickable && (
                <TableHead className="w-10">
                  <input type="checkbox" className={boxClass} checked={allSelected} onChange={toggleAll} aria-label="Select all on this page" />
                </TableHead>
              )}
              {columns.map((c) =>
                c.sortKey !== undefined && onSort && sort ? (
                  <SortableHead key={c.id} label={c.header} active={sort === c.sortKey} dir={dir} onSort={() => onSort(c.sortKey as S)} />
                ) : (
                  <TableHead key={c.id}>{c.header}</TableHead>
                )
              )}
            </TableRow>
          </TableHeader>
          <TableBody className={cn(loading && "opacity-60 transition-opacity")}>
            {loading && rows.length === 0
              ? Array.from({ length: skeletonRows }, (_, i) => (
                  <TableRow key={i}>
                    {pickable && <TableCell />}
                    {columns.map((c) => (
                      <TableCell key={c.id}>
                        <Skeleton className="h-4 w-20" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              : rows.map((row) => {
                  const key = rowKey(row)
                  return (
                    <TableRow
                      key={key}
                      onClick={onRowClick ? () => onRowClick(row) : undefined}
                      className={cn(
                        onRowClick && "cursor-pointer hover:bg-slate-50 dark:hover:bg-white/5",
                        selectedKey === key && "bg-blue-50/60 dark:bg-white/5"
                      )}
                    >
                      {pickable && (
                        <TableCell className="w-10">
                          <input type="checkbox" className={boxClass} checked={selected.has(key)} onClick={(e) => e.stopPropagation()} onChange={() => toggle(key)} aria-label={`Select ${rowLabel?.(row) ?? "row"}`} />
                        </TableCell>
                      )}
                      {columns.map((c) => (
                        <TableCell key={c.id} className={c.className}>
                          {slotOf(c) === "actions" ? (
                            <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                              {c.cell(row)}
                            </div>
                          ) : onRowClick && c === title ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                onRowClick(row)
                              }}
                              aria-label={rowLabel?.(row)}
                              className="cursor-pointer text-left"
                            >
                              {c.cell(row)}
                            </button>
                          ) : (
                            c.cell(row)
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  )
                })}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
