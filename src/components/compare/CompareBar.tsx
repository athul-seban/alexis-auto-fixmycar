"use client"

import { usePathname, useRouter } from "next/navigation"
import { GitCompareArrows, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { getInitials } from "@/lib/utils"
import { useCompare } from "@/context/CompareContext"

export function CompareBar() {
  const { items, count, clearAll } = useCompare()
  const pathname = usePathname()
  const router = useRouter()

  if (count === 0 || pathname === "/compare") return null

  return (
    <div className="fixed bottom-0 inset-x-0 z-40 bg-[#1E3A5F] text-white shadow-2xl animate-fade-in">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="hidden sm:flex -space-x-2">
            {items.map((garage) => (
              <Avatar key={garage.id} className="h-8 w-8 border-2 border-[#1E3A5F]">
                <AvatarImage src={garage.logo ?? ""} alt={garage.name} />
                <AvatarFallback className="text-[10px]">{getInitials(garage.name)}</AvatarFallback>
              </Avatar>
            ))}
          </div>
          <div className="flex items-center gap-1.5 text-sm font-medium min-w-0">
            <GitCompareArrows className="h-4 w-4 flex-shrink-0 text-[#F97316]" />
            <span className="truncate">
              {count} garage{count === 1 ? "" : "s"} selected
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={clearAll}
            className="hidden sm:flex items-center gap-1 text-xs text-blue-200 hover:text-white transition-colors cursor-pointer"
          >
            <X className="h-3.5 w-3.5" />
            Clear all
          </button>
          <Button
            size="sm"
            onClick={() => router.push(`/compare?ids=${items.map((i) => i.id).join(",")}`)}
          >
            {count === 1 ? "Add 1 more to compare" : "Compare now"}
          </Button>
        </div>
      </div>
    </div>
  )
}
