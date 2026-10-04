"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { signOut } from "next-auth/react"
import { LogOut, Menu, Settings } from "lucide-react"
import { cn, getInitials } from "@/lib/utils"
import { NotificationBell } from "@/components/layout/NotificationBell"
import { ThemeToggle } from "@/components/layout/ThemeToggle"
import { isNavActive, pageTitle, type PortalNav } from "@/components/portal-shell/nav"

interface TopbarProps {
  nav: PortalNav
  user: { name: string | null; email: string | null }
  onOpenMenu: () => void
}

export function Topbar({ nav, user, onOpenMenu }: TopbarProps) {
  const pathname = usePathname()
  const settingsActive = nav.settingsHref ? isNavActive(pathname, nav.settingsHref, nav.base) : false

  return (
    <header className="sticky top-0 z-30 print:hidden flex h-16 flex-shrink-0 items-center gap-2 border-b border-slate-200 bg-white/95 px-3 backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/95 sm:gap-3 sm:px-6">
      <button
        type="button"
        onClick={onOpenMenu}
        aria-label="Open navigation"
        className="-ml-1 flex h-11 w-11 cursor-pointer items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10 lg:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>

      <h2 className="min-w-0 truncate text-lg font-bold tracking-tight text-slate-900 dark:text-white">{pageTitle(pathname, nav)}</h2>

      <div className="ml-auto flex items-center gap-0.5 sm:gap-2">
        {nav.settingsHref && (
          <Link
            href={nav.settingsHref}
            aria-label="Settings"
            aria-current={settingsActive ? "page" : undefined}
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-xl text-slate-600 transition-colors hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800",
              settingsActive && "bg-slate-100 dark:bg-slate-800"
            )}
          >
            <Settings className="h-5 w-5" />
          </Link>
        )}
        <ThemeToggle />
        <NotificationBell />

        <div className="ml-1 flex items-center gap-2 border-l border-slate-200 pl-2 dark:border-white/10 sm:gap-2.5 sm:pl-3">
          <div
            aria-hidden
            className="hidden h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[#1E3A5F] text-xs font-bold text-white sm:flex"
          >
            {getInitials(user.name ?? user.email ?? "U")}
          </div>
          {user.email && <span className="hidden max-w-[200px] truncate text-sm text-slate-500 dark:text-slate-400 md:block">{user.email}</span>}
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: "/" })}
            aria-label="Sign out"
            title="Sign out"
            className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
          >
            <LogOut className="h-5 w-5" />
          </button>
        </div>
      </div>
    </header>
  )
}
