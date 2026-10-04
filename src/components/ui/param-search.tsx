"use client"

import { useEffect, useState } from "react"
import { Search } from "lucide-react"
import { cn } from "@/lib/utils"
import { useDebounce } from "@/hooks/use-debounce"
import { TextInput } from "@/components/ui/form-controls"

export type SetParams = (patch: Record<string, string | number | null | undefined>, opts?: { resetPage?: boolean }) => void

/** A debounced text box bound to a URL param. */
export function DebouncedParamInput({
  param,
  params,
  setParams,
  ...inputProps
}: { param: string; params: URLSearchParams; setParams: SetParams } & React.InputHTMLAttributes<HTMLInputElement>) {
  const urlValue = params.get(param) ?? ""
  const [text, setText] = useState(urlValue)
  const debounced = useDebounce(text, 300)

  useEffect(() => {
    if (debounced !== urlValue) setParams({ [param]: debounced.trim() || null }, { resetPage: true })
    // Only react to the user's typing, not to URL changes we caused.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced])

  return <TextInput value={text} onChange={(e) => setText(e.target.value)} {...inputProps} />
}

/** Search field with a leading magnifier, bound to `?q=`. Full width on phones. */
export function ParamSearch({
  params,
  setParams,
  placeholder,
  label,
  className,
}: {
  params: URLSearchParams
  setParams: SetParams
  placeholder: string
  label: string
  className?: string
}) {
  return (
    <div className={cn("relative w-full sm:w-72", className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <DebouncedParamInput param="q" params={params} setParams={setParams} placeholder={placeholder} aria-label={label} type="search" className="pl-9" />
    </div>
  )
}
