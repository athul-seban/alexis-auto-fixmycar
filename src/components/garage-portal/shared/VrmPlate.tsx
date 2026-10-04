import { cn } from "@/lib/utils"
import { formatVrm } from "@/lib/portal/vrm"

/** UK number-plate style registration (reuses the global .plate-number look, scaled for tables). */
export function VrmPlate({ vrm, className }: { vrm: string | null | undefined; className?: string }) {
  if (!vrm) return <span className="text-slate-500 dark:text-slate-400">—</span>
  return <span className={cn("plate-number !px-2 !py-0.5 text-xs", className)}>{formatVrm(vrm)}</span>
}
