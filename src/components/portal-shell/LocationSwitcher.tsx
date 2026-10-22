"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import * as DropdownMenu from "@radix-ui/react-dropdown-menu"
import { Check, ChevronsUpDown, Building2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { useToast } from "@/components/ui/toast"
import { sendJson } from "@/hooks/use-api"
import { setActiveLocationId } from "@/lib/org/active-location-client"
import { usePortalAccess } from "@/components/portal-shell/access-context"

const STATUS_LABEL: Record<string, string> = { PENDING: "Awaiting approval", SUSPENDED: "Suspended", ARCHIVED: "Archived" }

/**
 * The sidebar header of a business with several locations: shows where you are and lets you move. The choice is
 * remembered by the server (a cookie) and sent with every request; the page then reloads its data for the new location.
 */
export function LocationSwitcher({ collapsed, onNavigate, children }: { collapsed: boolean; onNavigate?: () => void; children: React.ReactNode }) {
  const { locations, activeLocationId, organisationName, can } = usePortalAccess()
  const router = useRouter()
  const { toast } = useToast()
  const [busy, setBusy] = useState(false)

  const choose = async (id: string) => {
    if (id === activeLocationId || busy) return
    setBusy(true)
    const res = await sendJson("/api/garage/location", "POST", { locationId: id })
    if (!res.ok) {
      setBusy(false)
      return toast(res.error ?? "Couldn't switch location", "error")
    }
    setActiveLocationId(id)
    router.refresh()
    // The server renders the new location and passes it down; give that a moment before enabling the menu again.
    setTimeout(() => setBusy(false), 600)
  }

  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger
        aria-label={`Location: ${locations.find((l) => l.id === activeLocationId)?.name ?? "choose"}. Switch location`}
        className={cn(
          "flex h-full w-full min-w-0 cursor-pointer items-center gap-3 text-left outline-none hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#1E3A5F] data-[state=open]:bg-slate-50 dark:hover:bg-white/5 dark:data-[state=open]:bg-white/5",
          collapsed ? "justify-center px-0" : "px-4"
        )}
      >
        {children}
        {!collapsed && <ChevronsUpDown aria-hidden className="ml-auto h-4 w-4 flex-shrink-0 text-slate-400" />}
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="start" sideOffset={6} className="z-[200] max-h-[70vh] w-72 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg dark:border-white/10 dark:bg-slate-900">
          {organisationName && <p className="truncate px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{organisationName}</p>}
          {locations.map((l) => {
            const active = l.id === activeLocationId
            return (
              <DropdownMenu.Item
                key={l.id}
                onSelect={() => choose(l.id)}
                className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-slate-700 outline-none data-[highlighted]:bg-slate-100 dark:text-slate-200 dark:data-[highlighted]:bg-slate-800"
              >
                <Check aria-hidden className={cn("h-4 w-4 flex-shrink-0", active ? "text-[#1E3A5F] dark:text-white" : "invisible")} />
                <span className="min-w-0 flex-1">
                  <span className={cn("block truncate", active && "font-semibold text-slate-900 dark:text-white")}>{l.name}</span>
                  <span className="block truncate text-xs text-slate-500 dark:text-slate-400">
                    {l.city}
                    {STATUS_LABEL[l.status] ? ` · ${STATUS_LABEL[l.status]}` : ""}
                  </span>
                </span>
                {active && <span className="sr-only">(current)</span>}
              </DropdownMenu.Item>
            )
          })}
          {can("locations.manage") && (
            <>
              <DropdownMenu.Separator className="my-1 h-px bg-slate-200 dark:bg-white/10" />
              <DropdownMenu.Item asChild>
                <Link
                  href="/garage-dashboard/locations"
                  onClick={onNavigate}
                  className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-slate-700 outline-none data-[highlighted]:bg-slate-100 dark:text-slate-200 dark:data-[highlighted]:bg-slate-800"
                >
                  <Building2 aria-hidden className="h-4 w-4" /> Manage locations
                </Link>
              </DropdownMenu.Item>
            </>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
