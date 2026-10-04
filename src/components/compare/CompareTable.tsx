import type { ReactNode } from "react"
import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

export interface CompareColumn<T> {
  id: string
  data: T
}

export type CompareRowConfig<T> =
  | { type: "section"; key: string; label: string }
  | {
      type: "data"
      key: string
      label: string
      icon?: LucideIcon
      highlightMin?: boolean
      render: (data: T) => ReactNode
      rawValue?: (data: T) => number | null | undefined
    }

interface CompareTableProps<T> {
  columns: CompareColumn<T>[]
  header: (data: T, columnId: string) => ReactNode
  rows: CompareRowConfig<T>[]
  className?: string
}

export function CompareTable<T>({ columns, header, rows, className }: CompareTableProps<T>) {
  return (
    <div className={cn("overflow-x-auto rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-slate-900", className)}>
      <table className="w-full min-w-[560px] border-collapse">
        <caption className="sr-only">Side-by-side garage comparison</caption>
        <thead>
          <tr>
            <th className="sticky left-0 bg-white dark:bg-slate-900 z-10 w-28 sm:w-40 border-b border-gray-100 dark:border-white/10" />
            {columns.map((col) => (
              <th key={col.id} className="p-4 border-b border-gray-100 dark:border-white/10 align-top text-left min-w-[170px] sm:min-w-[200px]">
                {header(col.data, col.id)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            if (row.type === "section") {
              return (
                <tr key={row.key} className="bg-slate-50 dark:bg-slate-800">
                  <td
                    colSpan={columns.length + 1}
                    className="sticky left-0 px-4 py-2 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 border-b border-gray-100 dark:border-white/10"
                  >
                    {row.label}
                  </td>
                </tr>
              )
            }

            const values = row.rawValue ? columns.map((c) => row.rawValue!(c.data)) : []
            const numericValues = values.filter((v): v is number => typeof v === "number")
            const minValue = row.highlightMin && numericValues.length > 1 ? Math.min(...numericValues) : null

            return (
              <tr key={row.key} className="even:bg-slate-50 dark:even:bg-slate-800/50">
                <th scope="row" className="sticky left-0 bg-inherit px-3 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 border-b border-gray-50 dark:border-white/10 sm:px-4 sm:text-sm">
                  <span className="flex items-center gap-1.5">
                    {row.icon && <row.icon className="h-3.5 w-3.5 flex-shrink-0 text-slate-400 dark:text-slate-500" />}
                    {row.label}
                  </span>
                </th>
                {columns.map((col, i) => {
                  const isMin = minValue !== null && values[i] === minValue
                  return (
                    <td
                      key={col.id}
                      className={cn(
                        "px-4 py-3 text-sm text-slate-700 dark:text-slate-300 border-b border-gray-50 dark:border-white/10",
                        isMin && "bg-green-50 dark:bg-green-500/20 font-bold text-green-700 dark:text-green-400"
                      )}
                    >
                      {row.render(col.data)}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
