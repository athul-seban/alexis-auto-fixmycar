"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { AlertTriangle, Clock, ShieldCheck, Store, UserRound } from "lucide-react"
import { cn } from "@/lib/utils"
import { Dialog, DialogTitle, SheetContent } from "@/components/ui/dialog"
import { ToastProvider } from "@/components/ui/toast"
import { SidebarContent, type PortalIdentity } from "@/components/portal-shell/Sidebar"
import { Topbar } from "@/components/portal-shell/Topbar"
import { useSidebarCollapsed } from "@/components/portal-shell/use-sidebar-collapsed"
import { ShortcutsDialog } from "@/components/portal-shell/ShortcutsDialog"
import { useShortcuts } from "@/components/portal-shell/use-shortcuts"
import { PORTAL_NAVS, type PortalId } from "@/components/portal-shell/nav"
import { filterNav, isPageAllowed, type PortalAccess } from "@/components/portal-shell/nav-filter"
import { PortalAccessProvider, type PortalLocation } from "@/components/portal-shell/access-context"
import { setActiveLocationId } from "@/lib/org/active-location-client"

export interface PortalGarage {
  id: string
  name: string
  slug: string
  logo: string | null
  status: string
}

interface PortalShellProps {
  portal: PortalId
  user: { name: string | null; email: string | null; image?: string | null }
  /** Sidebar header. For the garage portal this is the garage; admin/owner use the user. */
  identity: { name: string; logo?: string | null }
  /** Counts shown on sidebar items (see `badge` in nav.ts). */
  badges?: Record<string, number>
  /** Garage portal only: drives the pending/suspended banner. */
  garageStatus?: string
  /** Garage portal only: what the person can do at the active location, to hide what they can't use. */
  access?: PortalAccess
  /** Garage portal only: every location they can open (a business with more than one gets a switcher). */
  locations?: PortalLocation[]
  activeLocationId?: string | null
  organisationName?: string | null
  children: React.ReactNode
}

const ICONS = { garage: Store, admin: ShieldCheck, superAdmin: ShieldCheck, owner: UserRound } as const

function StatusBanner({ status }: { status: string }) {
  if (status === "PENDING") {
    return (
      <div role="status" className="mb-6 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
        <Clock className="mt-0.5 h-4 w-4 flex-shrink-0" />
        <p>
          <strong>Awaiting approval.</strong> Your garage isn&apos;t visible to customers yet and your booking widget is switched off.
          You can set everything up in the meantime.
        </p>
      </div>
    )
  }
  if (status === "ARCHIVED") {
    return (
      <div role="status" className="mb-6 flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-800 dark:border-white/15 dark:bg-white/5 dark:text-slate-200">
        <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
        <p>
          <strong>This location is archived.</strong> It is read-only and no longer on the marketplace. Your history is kept. An owner can restore it from the Locations page.
        </p>
      </div>
    )
  }
  if (status === "SUSPENDED") {
    return (
      <div role="alert" className="mb-6 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
        <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
        <p>
          <strong>Your garage is suspended.</strong> The portal is read-only — you can view and export your data but not make changes.
          Contact support to resolve this.
        </p>
      </div>
    )
  }
  return null
}

export function PortalShell({ portal, user, identity, badges, garageStatus, access, locations = [], activeLocationId = null, organisationName = null, children }: PortalShellProps) {
  const fullNav = PORTAL_NAVS[portal]
  // The sidebar, shortcuts and page titles only know the pages this person can open.
  const nav = useMemo(() => filterNav(fullNav, access), [fullNav, access])
  const [collapsed, setCollapsed] = useSidebarCollapsed()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const openHelp = useCallback(() => setHelpOpen(true), [])
  useShortcuts(nav, openHelp)
  const who: PortalIdentity = { name: identity.name, logo: identity.logo, icon: ICONS[portal] }

  // Tell the fetch helpers which location this tab is on (set while rendering so the first requests already carry it).
  setActiveLocationId(activeLocationId)

  // A page the person can't use (typed address, a bookmark, or a location where their role is different) goes home.
  const pathname = usePathname()
  const router = useRouter()
  const allowed = isPageAllowed(pathname, fullNav, access)
  useEffect(() => {
    if (!allowed) router.replace(fullNav.base)
  }, [allowed, router, fullNav.base])

  return (
    <PortalAccessProvider access={access} locations={locations} activeLocationId={activeLocationId} organisationName={organisationName}>
    <ToastProvider>
      <a
        href="#portal-main"
        className="sr-only focus:not-sr-only print:hidden focus:fixed focus:left-3 focus:top-3 focus:z-[300] focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:shadow-lg dark:focus:bg-slate-800"
      >
        Skip to content
      </a>
      <div className="flex h-dvh bg-[#F8FAFC] dark:bg-slate-950 print:block print:h-auto print:bg-white">
        <aside
          className={cn(
            "hidden flex-shrink-0 border-r print:!hidden border-slate-200 bg-white transition-[width] duration-200 dark:border-white/10 dark:bg-slate-900 lg:block",
            collapsed ? "w-[72px]" : "w-64"
          )}
        >
          <SidebarContent nav={nav} identity={who} badges={badges} collapsed={collapsed} />
        </aside>

        <Dialog open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent side="left" className="max-w-[17rem] lg:hidden" hideClose aria-describedby={undefined}>
            <DialogTitle className="sr-only">Navigation</DialogTitle>
            <SidebarContent nav={nav} identity={who} badges={badges} onNavigate={() => setMobileOpen(false)} />
          </SheetContent>
        </Dialog>

        <ShortcutsDialog nav={nav} open={helpOpen} onOpenChange={setHelpOpen} />

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Keyed by location: switching remounts the bell and the page, so nothing shows the previous location's data. */}
          <Topbar key={`top-${activeLocationId}`} nav={nav} user={user} onOpenMenu={() => setMobileOpen(true)} sidebarCollapsed={collapsed} onToggleSidebar={() => setCollapsed(!collapsed)} />
          <main id="portal-main" tabIndex={-1} className="flex-1 overflow-y-auto focus:outline-none print:overflow-visible">
            <div key={`page-${activeLocationId}`} className="w-full px-4 py-6 sm:px-6 lg:px-8">
              {garageStatus && <StatusBanner status={garageStatus} />}
              {allowed ? children : null}
            </div>
          </main>
        </div>
      </div>
    </ToastProvider>
    </PortalAccessProvider>
  )
}
