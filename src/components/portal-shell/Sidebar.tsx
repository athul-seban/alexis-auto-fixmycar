"use client"

import { DevelopedBy } from "@/components/layout/DevelopedBy"
import Link from "next/link"
import { usePathname } from "next/navigation"
import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { isNavActive, type PortalNav } from "@/components/portal-shell/nav"
import { usePortalAccess } from "@/components/portal-shell/access-context"
import { LocationSwitcher } from "@/components/portal-shell/LocationSwitcher"

/** Who the sidebar header shows: a garage, "Admin", or the signed-in customer. */
export interface PortalIdentity {
  name: string
  logo?: string | null
  /** Fallback tile when there is no logo. */
  icon: LucideIcon
}

interface SidebarContentProps {
  nav: PortalNav
  identity: PortalIdentity
  badges?: Record<string, number>
  collapsed?: boolean
  onNavigate?: () => void
}

function Badge({ count, collapsed }: { count: number; collapsed: boolean }) {
  if (count <= 0) return null
  const text = count > 99 ? "99+" : String(count)
  return (
    <span
      className={cn(
        "flex-shrink-0 rounded-full bg-[#C2410C] text-center text-[10px] font-bold leading-none text-white",
        collapsed ? "absolute right-1.5 top-1.5 min-w-[1rem] px-1 py-0.5" : "ml-auto min-w-[1.25rem] px-1.5 py-1"
      )}
    >
      {text}
      <span className="sr-only"> need attention</span>
    </span>
  )
}

/** Shared by the desktop sidebar and the mobile drawer. `collapsed` only applies on desktop. */
export function SidebarContent({ nav, identity, badges = {}, collapsed = false, onNavigate }: SidebarContentProps) {
  const pathname = usePathname()
  const Icon = identity.icon

  const { locations, organisationName } = usePortalAccess()
  // A business with several locations gets a switcher; everyone else keeps the plain header.
  const multiple = locations.length > 1

  const identityBlock = (
    <>
      {identity.logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={identity.logo} alt="" className="h-9 w-9 flex-shrink-0 rounded-lg bg-slate-100 object-cover dark:bg-slate-800" />
      ) : (
        <div
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg"
          style={{ background: "linear-gradient(135deg, #1E3A5F, #2D5A8E)" }}
        >
          <Icon className="h-5 w-5 text-white" />
        </div>
      )}
      {!collapsed && (
        <span className="min-w-0">
          <span className="block truncate text-sm font-bold text-slate-900 dark:text-white" title={identity.name}>
            {identity.name}
          </span>
          {multiple && organisationName && organisationName !== identity.name && (
            <span className="block truncate text-[11px] font-normal text-slate-500 dark:text-slate-400">{organisationName}</span>
          )}
        </span>
      )}
    </>
  )

  return (
    <div className="flex h-full flex-col">
      <div className={cn("flex h-16 flex-shrink-0 items-center gap-3 border-b border-slate-100 dark:border-white/10", multiple ? "" : "px-4", collapsed && "justify-center px-0")}>
        {multiple ? <LocationSwitcher collapsed={collapsed} onNavigate={onNavigate}>{identityBlock}</LocationSwitcher> : identityBlock}
      </div>

      <nav aria-label={nav.ariaLabel} className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
        {nav.sections.map((section, i) => (
          <div key={section.label ?? i}>
            {section.label && !collapsed && (
              <div className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                {section.label}
              </div>
            )}
            {section.label && collapsed && <div className="mx-3 mb-2 border-t border-slate-100 dark:border-white/10" />}
            <ul className="space-y-1">
              {section.items.map((item) => {
                const active = isNavActive(pathname, item.href, nav.base)
                const count = item.badge ? (badges[item.badge] ?? 0) : 0
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      title={collapsed ? item.label : undefined}
                      aria-label={collapsed ? item.label : undefined}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors",
                        collapsed && "justify-center px-0",
                        active
                          ? "bg-[#1E3A5F]/[0.08] text-[#1E3A5F] dark:bg-white/10 dark:text-white"
                          : "text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-white/5 dark:hover:text-white"
                      )}
                    >
                      {active && <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r bg-[#F97316]" />}
                      <item.icon className="h-5 w-5 flex-shrink-0" />
                      {!collapsed && <span className="truncate">{item.label}</span>}
                      <Badge count={count} collapsed={collapsed} />
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>

      {!collapsed && (
        <div className="flex-shrink-0 space-y-0.5 border-t border-slate-100 p-3 text-center text-[11px] text-slate-500 dark:border-white/10 dark:text-slate-400">
          <p>© {new Date().getFullYear()} Quote My Garage</p>
          <DevelopedBy linkClassName="text-slate-500 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white" />
        </div>
      )}
    </div>
  )
}
