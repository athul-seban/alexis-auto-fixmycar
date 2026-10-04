"use client"

import { useCallback, useMemo, useSyncExternalStore } from "react"
import { addView, parseViews, removeView, type SavedView } from "@/lib/portal/saved-views"

const EVENT = "qmg:saved-views-change"

const subscribe = (cb: () => void) => {
  window.addEventListener("storage", cb)
  window.addEventListener(EVENT, cb)
  return () => {
    window.removeEventListener("storage", cb)
    window.removeEventListener(EVENT, cb)
  }
}

/** localStorage-backed saved views under `key`. Works (read-only empty) when storage is blocked. */
export function useSavedViews(key: string) {
  const read = useCallback(() => {
    try {
      return window.localStorage.getItem(key)
    } catch {
      return null
    }
  }, [key])
  const raw = useSyncExternalStore(subscribe, read, () => null)
  const views = useMemo(() => parseViews(raw), [raw])

  const write = useCallback(
    (next: SavedView[]) => {
      try {
        window.localStorage.setItem(key, JSON.stringify(next))
      } catch {
        /* storage unavailable: the view just isn't remembered */
      }
      window.dispatchEvent(new Event(EVENT))
    },
    [key]
  )

  return {
    views,
    save: (name: string, query: string) => {
      const next = addView(views, name, query)
      if (next) write(next)
      return next !== null
    },
    remove: (name: string) => write(removeView(views, name)),
  }
}
