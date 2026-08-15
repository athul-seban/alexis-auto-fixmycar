"use client"

import { useEffect, useState } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import Link from "next/link"
import { GitCompareArrows, AlertCircle, Info } from "lucide-react"
import { Button } from "@/components/ui/button"
import { CompareTable } from "@/components/compare/CompareTable"
import { buildGarageCompareRows, GarageCompareColumnHeader } from "@/components/compare/garageCompareRows"
import { useCompare } from "@/context/CompareContext"
import { MAX_COMPARE_GARAGES } from "@/lib/constants"
import type { GarageProfile } from "@/types"

export function CompareView() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { items, removeGarage: removeFromContext } = useCompare()

  const idsParam = searchParams.get("ids")
  const requestedIds = Array.from(
    new Set((idsParam ? idsParam.split(",") : items.map((i) => i.id)).map((s) => s.trim()).filter(Boolean))
  ).slice(0, MAX_COMPARE_GARAGES)

  const [garages, setGarages] = useState<GarageProfile[]>([])
  const [loading, setLoading] = useState(requestedIds.length > 0)
  const [error, setError] = useState("")
  const [missingCount, setMissingCount] = useState(0)

  useEffect(() => {
    if (requestedIds.length === 0) {
      setGarages([])
      setLoading(false)
      return
    }

    const controller = new AbortController()
    async function fetchGarages() {
      setLoading(true)
      setError("")
      try {
        const res = await fetch(`/api/garages?ids=${requestedIds.join(",")}`, { signal: controller.signal })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? "Failed to load garages")

        const returned: GarageProfile[] = data.garages
        const missing = requestedIds.filter((id) => !returned.some((g) => g.id === id))
        missing.forEach((id) => removeFromContext(id))
        setMissingCount(missing.length)
        setGarages(returned)
      } catch (err: any) {
        if (err.name !== "AbortError") setError(err.message ?? "Failed to load garages")
      } finally {
        setLoading(false)
      }
    }
    fetchGarages()
    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsParam])

  const handleRemove = (id: string) => {
    removeFromContext(id)
    const remaining = garages.filter((g) => g.id !== id).map((g) => g.id)
    router.replace(remaining.length > 0 ? `/compare?ids=${remaining.join(",")}` : "/compare")
  }

  if (requestedIds.length === 0) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-20 text-center">
        <GitCompareArrows className="h-12 w-12 text-slate-300 mx-auto mb-4" />
        <h1 className="text-xl font-bold text-slate-900 mb-2">You haven&apos;t added any garages to compare yet</h1>
        <p className="text-slate-500 text-sm mb-6">Browse garages and tap &quot;Compare&quot; to add them here.</p>
        <Link href="/search">
          <Button size="lg">Browse Garages</Button>
        </Link>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="h-96 bg-white rounded-xl border border-gray-200 animate-pulse" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-20 text-center">
        <AlertCircle className="h-12 w-12 text-slate-300 mx-auto mb-4" />
        <h1 className="text-xl font-bold text-slate-900 mb-2">Something went wrong</h1>
        <p className="text-slate-500 text-sm mb-6">{error}</p>
        <Button variant="outline" onClick={() => router.refresh()}>Retry</Button>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-bold text-slate-900 mb-1">Compare Garages</h1>
      <p className="text-slate-500 text-sm mb-6">Comparing {garages.length} garage{garages.length === 1 ? "" : "s"} side-by-side.</p>

      {missingCount > 0 && (
        <div className="flex items-center gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg mb-5 text-sm text-yellow-800">
          <Info className="h-4 w-4 flex-shrink-0" />
          {missingCount} garage{missingCount === 1 ? " is" : "s are"} no longer available and {missingCount === 1 ? "was" : "were"} removed from this comparison.
        </div>
      )}

      {garages.length === 1 && (
        <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg mb-5 text-sm text-blue-800">
          <Info className="h-4 w-4 flex-shrink-0" />
          Add at least one more garage to see a side-by-side comparison.{" "}
          <Link href="/search" className="font-semibold underline">Browse more garages</Link>
        </div>
      )}

      <CompareTable
        columns={garages.map((g) => ({ id: g.id, data: g }))}
        header={(g) => <GarageCompareColumnHeader garage={g} onRemove={() => handleRemove(g.id)} />}
        rows={buildGarageCompareRows(garages)}
      />
    </div>
  )
}
