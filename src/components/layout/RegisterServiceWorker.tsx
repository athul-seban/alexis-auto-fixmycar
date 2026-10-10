"use client"

import { useEffect } from "react"

/** Registers /sw.js (offline page + push) once the page has loaded. Skipped in dev so it can't serve a stale app. */
export function RegisterServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return
    const register = () => navigator.serviceWorker.register("/sw.js").catch((err) => console.error("[sw] registration failed:", err))
    if (document.readyState === "complete") register()
    else window.addEventListener("load", register, { once: true })
    return () => window.removeEventListener("load", register)
  }, [])
  return null
}
