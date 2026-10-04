import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn("py-14 px-4 text-center", className)}>
      <Icon className="mx-auto mb-3 h-11 w-11 text-slate-300 dark:text-slate-600" />
      <h3 className="mb-1 text-base font-semibold text-slate-900 dark:text-white">{title}</h3>
      {description && <p className="mx-auto max-w-sm text-sm text-slate-500 dark:text-slate-400">{description}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  )
}
