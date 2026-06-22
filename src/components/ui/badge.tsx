import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-[#1E3A5F] text-white",
        secondary: "border-transparent bg-slate-100 text-slate-700",
        destructive: "border-transparent bg-red-100 text-red-700",
        success: "border-transparent bg-green-100 text-green-700",
        warning: "border-transparent bg-yellow-100 text-yellow-700",
        accent: "border-transparent bg-orange-100 text-orange-700",
        outline: "border-slate-200 text-slate-700",
        verified: "border-transparent bg-blue-100 text-blue-700",
        pending: "border-transparent bg-yellow-100 text-yellow-800",
        approved: "border-transparent bg-green-100 text-green-800",
        rejected: "border-transparent bg-red-100 text-red-800",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
