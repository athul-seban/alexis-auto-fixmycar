import * as React from "react"
import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"

// Compact form controls for dense portal UIs (filter bars, dialogs). They follow the app's
// existing hand-rolled input style: slate border, navy focus ring, dark: variants.

export const controlClass =
  "h-10 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#1E3A5F] dark:focus:ring-blue-400 disabled:cursor-not-allowed disabled:opacity-50"

export const TextInput = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type = "text", ...props }, ref) => (
    <input ref={ref} type={type} className={cn(controlClass, className)} {...props} />
  )
)
TextInput.displayName = "TextInput"

export const NativeSelect = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <div className="relative">
      <select ref={ref} className={cn(controlClass, "appearance-none pr-9 cursor-pointer", className)} {...props}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
    </div>
  )
)
NativeSelect.displayName = "NativeSelect"

export function FieldLabel({
  className,
  children,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label className={cn("mb-1 block text-xs font-semibold text-slate-500 dark:text-slate-400", className)} {...props}>
      {children}
    </label>
  )
}

export function FieldError({ children }: { children?: React.ReactNode }) {
  if (!children) return null
  return <p role="alert" className="mt-1 text-xs text-red-600 dark:text-red-400">{children}</p>
}
