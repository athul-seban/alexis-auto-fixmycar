"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

interface PopoverProps {
  /** Render the trigger; call `toggle` from its onClick. */
  trigger: (state: { open: boolean; toggle: () => void }) => React.ReactNode
  children: React.ReactNode | ((close: () => void) => React.ReactNode)
  align?: "left" | "right"
  panelClassName?: string
}

// A small click-to-open panel (Radix Popover isn't installed). Closes on outside click and Escape.
export function Popover({ trigger, children, align = "left", panelClassName }: PopoverProps) {
  const [open, setOpen] = React.useState(false)
  const ref = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false)
    document.addEventListener("mousedown", onDown)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onDown)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  const close = React.useCallback(() => setOpen(false), [])

  return (
    <div ref={ref} className="relative">
      {trigger({ open, toggle: () => setOpen((o) => !o) })}
      {open && (
        <div
          className={cn(
            "absolute top-full z-40 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-gray-200 bg-white p-4 shadow-lg dark:border-white/10 dark:bg-slate-800",
            align === "right" ? "right-0" : "left-0",
            panelClassName
          )}
        >
          {typeof children === "function" ? children(close) : children}
        </div>
      )}
    </div>
  )
}
