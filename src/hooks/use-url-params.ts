"use client"

import { useCallback } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"

/**
 * Query-string state for filter UIs: shareable, survives refresh, works with back/forward.
 * Components using this must render inside <Suspense> (Next requirement for useSearchParams).
 */
export function useUrlParams() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const setParams = useCallback(
    (patch: Record<string, string | number | null | undefined>, opts: { resetPage?: boolean } = {}) => {
      const next = new URLSearchParams(searchParams.toString())
      for (const [key, value] of Object.entries(patch)) {
        if (value === null || value === undefined || value === "") next.delete(key)
        else next.set(key, String(value))
      }
      if (opts.resetPage) next.delete("page")
      const qs = next.toString()
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    },
    [router, pathname, searchParams]
  )

  return { searchParams, setParams }
}
