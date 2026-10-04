"use client"

import { useCallback, useEffect, useState } from "react"

interface Result<T> {
  url: string | null
  tick: number
  data: T | null
  error: string | null
}

export interface ApiState<T> {
  /** Last successfully loaded data. Kept while a new URL loads, so tables don't flash empty. */
  data: T | null
  error: string | null
  loading: boolean
  reload: () => void
}

/**
 * GET JSON from `url` (null = don't fetch). Refetches when the URL changes or `reload()` is
 * called, and aborts superseded requests. State is only set from async callbacks.
 */
export function useApi<T>(url: string | null): ApiState<T> {
  const [tick, setTick] = useState(0)
  const [result, setResult] = useState<Result<T>>({ url: null, tick: 0, data: null, error: null })

  useEffect(() => {
    if (!url) return
    const ctrl = new AbortController()
    fetch(url, { signal: ctrl.signal })
      .then(async (res) => {
        const body = await res.json().catch(() => null)
        if (!res.ok) throw new Error(body?.error ?? `Request failed (${res.status})`)
        setResult({ url, tick, data: body as T, error: null })
      })
      .catch((err) => {
        if (err?.name === "AbortError") return
        setResult((prev) => ({ url, tick, data: prev.data, error: err?.message ?? "Something went wrong" }))
      })
    return () => ctrl.abort()
  }, [url, tick])

  const reload = useCallback(() => setTick((t) => t + 1), [])
  const loading = url !== null && (result.url !== url || result.tick !== tick)
  return { data: result.data, error: loading ? null : result.error, loading, reload }
}

/** Sends JSON and returns `{ ok, data, error }` without throwing — for mutations. */
export async function sendJson<T = unknown>(
  url: string,
  method: "POST" | "PATCH" | "PUT" | "DELETE",
  body?: unknown
): Promise<{ ok: boolean; status: number; data: T | null; error: string | null }> {
  try {
    const res = await fetch(url, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const data = (await res.json().catch(() => null)) as (T & { error?: string }) | null
    return { ok: res.ok, status: res.status, data, error: res.ok ? null : (data?.error ?? `Request failed (${res.status})`) }
  } catch {
    return { ok: false, status: 0, data: null, error: "Network error — please try again" }
  }
}
