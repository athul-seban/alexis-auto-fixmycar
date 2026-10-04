"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

// Underline-style filter strip. Looks like tabs, but is a labelled group of toggle buttons: ARIA "tabs" promise a
// panel per tab (and require every child to be a tab), which these URL-driven list filters don't have.

interface FilterTabsContext {
  value: string
  onValueChange: (value: string) => void
}
const Ctx = React.createContext<FilterTabsContext | null>(null)

export function FilterTabs({ value, onValueChange, className, children }: FilterTabsContext & { className?: string; children: React.ReactNode }) {
  const ctx = React.useMemo(() => ({ value, onValueChange }), [value, onValueChange])
  return (
    <Ctx.Provider value={ctx}>
      <div className={className}>{children}</div>
    </Ctx.Provider>
  )
}

export function FilterTabList({ className, "aria-label": ariaLabel, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      role="group"
      aria-label={ariaLabel ?? "Filter"}
      className={cn(
        "flex items-center gap-1 overflow-x-auto overflow-y-hidden border-b border-slate-200 [scrollbar-width:none] dark:border-white/10 [&::-webkit-scrollbar]:hidden",
        className
      )}
      {...props}
    />
  )
}

export function FilterTab({ value, className, children, ...props }: { value: string } & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "value">) {
  const ctx = React.useContext(Ctx)
  if (!ctx) throw new Error("FilterTab must be used inside FilterTabs")
  const active = ctx.value === value
  return (
    <button
      type="button"
      aria-pressed={active}
      data-state={active ? "active" : "inactive"}
      onClick={() => ctx.onValueChange(value)}
      className={cn(
        "-mb-px inline-flex min-h-11 cursor-pointer items-center gap-1.5 whitespace-nowrap border-b-2 border-transparent px-4 py-3 text-sm font-medium text-slate-500 transition-colors",
        "hover:text-slate-900 dark:text-slate-400 dark:hover:text-white",
        "data-[state=active]:border-[#F97316] data-[state=active]:font-semibold data-[state=active]:text-slate-900 dark:data-[state=active]:text-white",
        className
      )}
      {...props}
    >
      {children}
    </button>
  )
}
