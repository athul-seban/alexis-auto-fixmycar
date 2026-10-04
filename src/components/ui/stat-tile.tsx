import Link from "next/link"
import { Info, type LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { Skeleton } from "@/components/ui/skeleton"

const TONES = {
  blue: { chip: "bg-blue-50 dark:bg-blue-500/10", icon: "text-blue-500 dark:text-blue-400" },
  purple: { chip: "bg-purple-50 dark:bg-purple-500/10", icon: "text-purple-500 dark:text-purple-400" },
  orange: { chip: "bg-orange-50 dark:bg-orange-500/10", icon: "text-orange-500 dark:text-orange-400" },
  green: { chip: "bg-green-50 dark:bg-green-500/10", icon: "text-green-600 dark:text-green-400" },
  yellow: { chip: "bg-yellow-50 dark:bg-yellow-500/10", icon: "text-yellow-500 dark:text-yellow-400" },
  red: { chip: "bg-red-50 dark:bg-red-500/10", icon: "text-red-500 dark:text-red-400" },
} as const

interface StatTileProps {
  label: string
  value: React.ReactNode
  icon?: LucideIcon
  tone?: keyof typeof TONES
  /** Explains how the figure is calculated; shown as a tooltip + to screen readers. */
  hint?: string
  href?: string
  loading?: boolean
  className?: string
}

export function StatTile({ label, value, icon: Icon, tone = "blue", hint, href, loading, className }: StatTileProps) {
  const t = TONES[tone]
  const body = (
    <>
      <div className="mb-3 flex items-start justify-between gap-2">
        {Icon ? (
          <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl", t.chip)}>
            <Icon className={cn("h-5 w-5", t.icon)} />
          </div>
        ) : (
          <span />
        )}
        {hint && (
          <span title={hint} className="text-slate-300 dark:text-slate-600" aria-label={hint}>
            <Info className="h-4 w-4" />
          </span>
        )}
      </div>
      {loading ? <Skeleton className="mb-1 h-8 w-20" /> : <div className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">{value}</div>}
      <div className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{label}</div>
    </>
  )
  const base = "block rounded-xl border border-gray-200 bg-white p-5 dark:border-white/10 dark:bg-slate-800"
  return href ? (
    <Link href={href} className={cn(base, "transition-shadow hover:shadow-md", className)}>
      {body}
    </Link>
  ) : (
    <div className={cn(base, className)}>{body}</div>
  )
}
