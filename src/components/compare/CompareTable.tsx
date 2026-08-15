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
    <div className={cn("overflow-x-auto rounded-xl border border-gray-200 bg-white", className)}>
      <table className="w-full min-w-[720px] border-collapse">
        <thead>
          <tr>
            <th className="sticky left-0 bg-white z-10 w-40 border-b border-gray-100" />
            {columns.map((col) => (
              <th key={col.id} className="p-4 border-b border-gray-100 align-top text-left min-w-[200px]">
                {header(col.data, col.id)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            if (row.type === "section") {
              return (
                <tr key={row.key} className="bg-slate-50">
                  <td
                    colSpan={columns.length + 1}
                    className="sticky left-0 px-4 py-2 text-xs font-bold uppercase tracking-wider text-slate-500 bg-slate-50 border-b border-gray-100"
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
              <tr key={row.key} className="even:bg-slate-50">
                <td className="sticky left-0 bg-inherit px-4 py-3 text-sm font-semibold text-slate-600 border-b border-gray-50 flex items-center gap-1.5">
                  {row.icon && <row.icon className="h-3.5 w-3.5 text-slate-400" />}
                  {row.label}
                </td>
                {columns.map((col, i) => {
                  const isMin = minValue !== null && values[i] === minValue
                  return (
                    <td
                      key={col.id}
                      className={cn(
                        "px-4 py-3 text-sm text-slate-700 border-b border-gray-50",
                        isMin && "bg-green-50 font-bold text-green-700"
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
