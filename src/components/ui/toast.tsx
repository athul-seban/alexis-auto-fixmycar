"use client"

import * as React from "react"
import { CheckCircle2, AlertCircle, X } from "lucide-react"
import { cn } from "@/lib/utils"

// A deliberately small toast system (no Radix Toast): a context + a fixed live region.

type ToastType = "success" | "error"
interface ToastItem {
  id: number
  message: string
  type: ToastType
}

interface ToastApi {
  toast: (message: string, type?: ToastType) => void
}

// Outside a provider (e.g. in isolated component tests) toasts are silently dropped.
const ToastContext = React.createContext<ToastApi>({ toast: () => {} })

export const useToast = () => React.useContext(ToastContext)

const DURATION_MS = 4500

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<ToastItem[]>([])
  const nextId = React.useRef(1)

  const dismiss = React.useCallback((id: number) => setItems((prev) => prev.filter((t) => t.id !== id)), [])

  const toast = React.useCallback(
    (message: string, type: ToastType = "success") => {
      const id = nextId.current++
      setItems((prev) => [...prev, { id, message, type }])
      window.setTimeout(() => dismiss(id), DURATION_MS)
    },
    [dismiss]
  )

  const api = React.useMemo(() => ({ toast }), [toast])

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed bottom-4 right-4 z-[200] flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2">
        {items.map((t) => (
          <div
            key={t.id}
            role={t.type === "error" ? "alert" : "status"}
            className={cn(
              "pointer-events-auto flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm font-medium shadow-lg animate-fade-in",
              t.type === "success"
                ? "border-green-200 bg-green-50 text-green-800 dark:border-green-500/30 dark:bg-green-950 dark:text-green-300"
                : "border-red-200 bg-red-50 text-red-800 dark:border-red-500/30 dark:bg-red-950 dark:text-red-300"
            )}
          >
            {t.type === "success" ? <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0" /> : <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />}
            <span className="flex-1">{t.message}</span>
            <button type="button" onClick={() => dismiss(t.id)} aria-label="Dismiss" className="cursor-pointer opacity-60 hover:opacity-100">
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
