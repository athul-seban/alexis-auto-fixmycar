import * as React from "react"
import { cn } from "@/lib/utils"
import { controlClass } from "@/components/ui/form-controls"

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, rows = 3, ...props }, ref) => (
    <textarea ref={ref} rows={rows} className={cn(controlClass, "h-auto py-2 resize-none", className)} {...props} />
  )
)
Textarea.displayName = "Textarea"
