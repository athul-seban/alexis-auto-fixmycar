"use client"

import { useCallback, useSyncExternalStore } from "react"

const KEY = "qmg:portal:sidebar"
const EVENT = "qmg:portal:sidebar-change"

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback)
  window.addEventListener(EVENT, callback)
  return () => {
    window.removeEventListener("storage", callback)
    window.removeEventListener(EVENT, callback)
  }
}

// localStorage can throw (private windows, blocked site data) — the sidebar must still render.
function getSnapshot(): boolean {
  try {
    return window.localStorage.getItem(KEY) === "1"
  } catch {
    return false
  }
}

const getServerSnapshot = () => false

/** Persisted sidebar collapsed flag. Server render is always "expanded"; the client corrects after hydration. */
export function useSidebarCollapsed(): [boolean, (collapsed: boolean) => void] {
  const collapsed = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  const set = useCallback((next: boolean) => {
    try {
      window.localStorage.setItem(KEY, next ? "1" : "0")
    } catch {
      /* ignore */
    }
    window.dispatchEvent(new Event(EVENT))
  }, [])
  return [collapsed, set]
}
