"use client"

import { useState } from "react"
import { Bookmark, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { TextInput } from "@/components/ui/form-controls"
import { Popover } from "@/components/ui/popover"
import type { SetParams } from "@/components/ui/param-search"
import { useSavedViews } from "@/hooks/use-saved-views"
import { viewQuery } from "@/lib/portal/saved-views"

interface SavedViewsProps {
  params: URLSearchParams
  setParams: SetParams
  /** URL params that make up a view (tab + every filter). */
  keys: readonly string[]
}

/** Name the current tab + filters and jump back to them later. Stored in this browser only. */
export function SavedViews({ params, setParams, keys }: SavedViewsProps) {
  const { views, save, remove } = useSavedViews("qmg:garage:bookings-views")
  const [name, setName] = useState("")
  const query = viewQuery(params, keys)

  function apply(q: string, close: () => void) {
    const saved = new URLSearchParams(q)
    setParams(Object.fromEntries(keys.map((k) => [k, saved.get(k)])), { resetPage: true })
    close()
  }

  return (
    <Popover
      align="right"
      trigger={({ open, toggle }) => (
        <Button variant="white" className="gap-2 border border-slate-200 dark:border-white/10" onClick={toggle} aria-expanded={open}>
          <Bookmark className="h-4 w-4" /> Saved views{views.length > 0 && ` (${views.length})`}
        </Button>
      )}
    >
      {(close) => (
        <div className="space-y-3">
          {views.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">No saved views yet. Set up the tab and filters you use most, then save them here.</p>
          ) : (
            <ul className="space-y-1">
              {views.map((v) => (
                <li key={v.name} className="flex items-center gap-1">
                  <button type="button" onClick={() => apply(v.query, close)} className="min-h-10 flex-1 cursor-pointer truncate rounded-lg px-2 text-left text-sm font-medium text-slate-800 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-white/5">
                    {v.name}
                  </button>
                  <button type="button" onClick={() => remove(v.name)} aria-label={`Delete saved view ${v.name}`} className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-lg text-slate-400 hover:bg-slate-50 hover:text-red-600 dark:hover:bg-white/5">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <form
            className="flex gap-2 border-t border-slate-100 pt-3 dark:border-white/10"
            onSubmit={(e) => {
              e.preventDefault()
              if (save(name, query)) setName("")
            }}
          >
            <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder={query ? "Name this view" : "Apply a filter first"} aria-label="Name for the new saved view" maxLength={40} disabled={!query} />
            <Button type="submit" variant="primary" disabled={!query || !name.trim()}>
              Save
            </Button>
          </form>
        </div>
      )}
    </Popover>
  )
}
