"use client"

import { useEffect } from "react"
import { AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"

/** Shared error-boundary body for the portals: keeps the sidebar (the layout) and offers a retry. */
export function PortalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div role="alert" className="mx-auto max-w-md py-16 text-center">
      <AlertTriangle className="mx-auto mb-3 h-10 w-10 text-amber-500" />
      <h1 className="mb-1 text-xl font-bold text-slate-900 dark:text-white">Something went wrong</h1>
      <p className="mb-5 text-sm text-slate-500 dark:text-slate-400">
        This page failed to load. Your data is safe — try again, and if it keeps happening let support know{error.digest ? ` (ref ${error.digest})` : ""}.
      </p>
      <Button variant="primary" onClick={reset}>
        Try again
      </Button>
    </div>
  )
}
