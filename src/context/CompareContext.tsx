"use client"

import { createContext, useContext, useEffect, useState, useCallback } from "react"
import { MAX_COMPARE_GARAGES, COMPARE_STORAGE_KEY } from "@/lib/constants"

export interface CompareGarageStub {
  id: string
  name: string
  slug: string
  logo: string | null
  city: string
}

type ToggleResult = { ok: true } | { ok: false; reason: "MAX_REACHED" }

interface CompareContextValue {
  items: CompareGarageStub[]
  count: number
  maxReached: boolean
  isSelected: (id: string) => boolean
  toggleGarage: (garage: CompareGarageStub) => ToggleResult
  removeGarage: (id: string) => void
  clearAll: () => void
}

const CompareContext = createContext<CompareContextValue | null>(null)

function readStoredItems(): CompareGarageStub[] {
  try {
    const raw = sessionStorage.getItem(COMPARE_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function CompareProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CompareGarageStub[]>([])
  const [hydrated, setHydrated] = useState(false)

  // Hydrate from sessionStorage after mount only, to avoid SSR/hydration mismatch.
  useEffect(() => {
    setItems(readStoredItems())
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (!hydrated) return
    try {
      sessionStorage.setItem(COMPARE_STORAGE_KEY, JSON.stringify(items))
    } catch {
      // storage unavailable (private browsing etc.) — degrade to in-memory only
    }
  }, [items, hydrated])

  const isSelected = useCallback((id: string) => items.some((i) => i.id === id), [items])

  const toggleGarage = useCallback(
    (garage: CompareGarageStub): ToggleResult => {
      let result: ToggleResult = { ok: true }
      setItems((prev) => {
        if (prev.some((i) => i.id === garage.id)) {
          return prev.filter((i) => i.id !== garage.id)
        }
        if (prev.length >= MAX_COMPARE_GARAGES) {
          result = { ok: false, reason: "MAX_REACHED" }
          return prev
        }
        return [...prev, garage]
      })
      return result
    },
    []
  )

  const removeGarage = useCallback((id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id))
  }, [])

  const clearAll = useCallback(() => setItems([]), [])

  return (
    <CompareContext.Provider
      value={{
        items,
        count: items.length,
        maxReached: items.length >= MAX_COMPARE_GARAGES,
        isSelected,
        toggleGarage,
        removeGarage,
        clearAll,
      }}
    >
      {children}
    </CompareContext.Provider>
  )
}

export function useCompare(): CompareContextValue {
  const ctx = useContext(CompareContext)
  if (!ctx) throw new Error("useCompare must be used within a CompareProvider")
  return ctx
}
