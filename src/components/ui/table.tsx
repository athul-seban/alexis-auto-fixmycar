import * as React from "react"
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react"
import { cn } from "@/lib/utils"

export const Table = React.forwardRef<HTMLTableElement, React.TableHTMLAttributes<HTMLTableElement>>(
  ({ className, ...props }, ref) => (
    <div className="relative w-full overflow-x-auto">
      <table ref={ref} className={cn("w-full border-collapse text-sm", className)} {...props} />
    </div>
  )
)
Table.displayName = "Table"

export const TableHeader = (props: React.HTMLAttributes<HTMLTableSectionElement>) => <thead {...props} />
export const TableBody = (props: React.HTMLAttributes<HTMLTableSectionElement>) => <tbody {...props} />

export const TableRow = React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(
  ({ className, ...props }, ref) => (
    <tr
      ref={ref}
      className={cn("border-t border-slate-100 transition-colors dark:border-white/10", className)}
      {...props}
    />
  )
)
TableRow.displayName = "TableRow"

export function TableHead({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      scope="col"
      className={cn("whitespace-nowrap px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400", className)}
      {...props}
    />
  )
}

export function TableCell({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("whitespace-nowrap px-4 py-3 text-slate-700 dark:text-slate-300", className)} {...props} />
}

interface SortableHeadProps {
  label: string
  active: boolean
  dir: "asc" | "desc"
  onSort: () => void
  className?: string
}

/** A column header that toggles sorting. Exposes aria-sort for assistive tech. */
export function SortableHead({ label, active, dir, onSort, className }: SortableHeadProps) {
  const Icon = !active ? ArrowUpDown : dir === "asc" ? ArrowUp : ArrowDown
  return (
    <th
      scope="col"
      aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
      className={cn("whitespace-nowrap px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400", className)}
    >
      <button
        type="button"
        onClick={onSort}
        className={cn(
          "inline-flex cursor-pointer items-center gap-1.5 rounded transition-colors hover:text-slate-900 dark:hover:text-white",
          active && "text-slate-900 dark:text-white"
        )}
      >
        {label}
        <Icon className={cn("h-3.5 w-3.5", !active && "opacity-50")} />
      </button>
    </th>
  )
}
