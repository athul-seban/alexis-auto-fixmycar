"use client"

import { Check, Zap } from "lucide-react"
import { cn, formatCurrency, getServiceLabel } from "@/lib/utils"

export interface QuoteTerms {
  /** How long the garage has to send a quote by hand. */
  responseHours: number
  /** Works this garage prices automatically, with the price it sends the moment a customer asks. */
  instantPrices: Record<string, number>
}

export const hoursLabel = (h: number) => (h === 1 ? "1 hour" : h < 48 ? `${h} hours` : `${Math.round(h / 24)} days`)

/** Pick one or more works from the garage's own list. Works with an automatic price are marked, and total up. */
export function WorkPicker({
  options,
  selected,
  onChange,
  terms,
  idPrefix,
}: {
  options: string[]
  selected: string[]
  onChange: (next: string[]) => void
  terms?: QuoteTerms
  idPrefix: string
}) {
  const toggle = (w: string) => onChange(selected.includes(w) ? selected.filter((x) => x !== w) : [...selected, w])
  const instant = (w: string) => terms?.instantPrices[w]
  const allInstant = selected.length > 0 && selected.every((w) => instant(w) !== undefined)
  const total = allInstant ? selected.reduce((t, w) => t + (instant(w) ?? 0), 0) : null

  return (
    <fieldset>
      <legend className="sr-only">Services you need</legend>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {options.map((w) => {
          const on = selected.includes(w)
          const price = instant(w)
          return (
            <label
              key={w}
              htmlFor={`${idPrefix}-${w}`}
              className={cn(
                "flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm transition-colors focus-within:ring-2 focus-within:ring-[#1E3A5F]",
                on
                  ? "border-[#F97316] bg-orange-50 dark:bg-orange-500/10"
                  : "border-gray-200 hover:border-slate-300 hover:bg-slate-50 dark:border-white/10 dark:hover:bg-white/5"
              )}
            >
              <input id={`${idPrefix}-${w}`} type="checkbox" className="sr-only" checked={on} onChange={() => toggle(w)} />
              <span
                aria-hidden
                className={cn("flex h-5 w-5 flex-none items-center justify-center rounded border", on ? "border-[#F97316] bg-[#F97316] text-white" : "border-slate-300 dark:border-slate-600")}
              >
                {on && <Check className="h-3.5 w-3.5" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium text-slate-800 dark:text-slate-100">{getServiceLabel(w)}</span>
                {price !== undefined && (
                  <span className="mt-0.5 flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                    <Zap className="h-3 w-3" aria-hidden /> {formatCurrency(price)} instantly
                  </span>
                )}
              </span>
            </label>
          )
        })}
      </div>
      {terms && selected.length > 0 && (
        <p role="status" className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600 dark:bg-white/5 dark:text-slate-300">
          {total !== null
            ? `You'll get ${formatCurrency(total)} straight away. No waiting for a reply.`
            : `This garage replies within ${hoursLabel(terms.responseHours)}. Anything it prices in advance shows as instant.`}
        </p>
      )}
    </fieldset>
  )
}
