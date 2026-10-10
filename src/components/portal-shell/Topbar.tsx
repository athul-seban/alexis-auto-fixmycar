"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { signOut } from "next-auth/react"
import * as DropdownMenu from "@radix-ui/react-dropdown-menu"
import { ChevronDown, LogOut, Menu, Settings, UserRound } from "lucide-react"
import { cn, getInitials } from "@/lib/utils"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { NotificationBell } from "@/components/layout/NotificationBell"
import { ThemeToggle } from "@/components/layout/ThemeToggle"
import { isNavActive, pageTitle, type PortalNav } from "@/components/portal-shell/nav"

interface TopbarProps {
  nav: PortalNav
  user: { name: string | null; email: string | null; image?: string | null }
  onOpenMenu: () => void
}

const MENU_ITEM =
  "flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-slate-700 outline-none data-[highlighted]:bg-slate-100 dark:text-slate-200 dark:data-[highlighted]:bg-slate-800"

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

        <div className="ml-1 border-l border-slate-200 pl-2 dark:border-white/10 sm:pl-3">
          <DropdownMenu.Root>
            <DropdownMenu.Trigger
              aria-label="Account menu"
              className="flex h-10 cursor-pointer items-center gap-2 rounded-xl px-1.5 text-slate-600 transition-colors hover:bg-slate-50 data-[state=open]:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 dark:data-[state=open]:bg-slate-800"
            >
              <Avatar className="h-8 w-8">
                {user.image && <AvatarImage src={user.image} alt="" />}
                <AvatarFallback className="text-xs font-bold">{getInitials(user.name ?? user.email ?? "U")}</AvatarFallback>
              </Avatar>
              <ChevronDown aria-hidden className="hidden h-4 w-4 sm:block" />
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                align="end"
                sideOffset={8}
                className="z-[200] w-64 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg dark:border-white/10 dark:bg-slate-900"
              >
                <div className="px-3 py-2">
                  <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">{user.name ?? "Signed in"}</p>
                  {user.email && <p className="truncate text-xs text-slate-500 dark:text-slate-400">{user.email}</p>}
                </div>
                <DropdownMenu.Separator className="my-1 h-px bg-slate-200 dark:bg-white/10" />
                <DropdownMenu.Item asChild>
                  <Link href={nav.accountHref} className={MENU_ITEM}>
                    <UserRound className="h-4 w-4" /> My account
                  </Link>
                </DropdownMenu.Item>
                {nav.settingsHref && nav.settingsHref !== nav.accountHref && (
                  <DropdownMenu.Item asChild>
                    <Link href={nav.settingsHref} className={MENU_ITEM}>
                      <Settings className="h-4 w-4" /> Settings
                    </Link>
                  </DropdownMenu.Item>
                )}
                <DropdownMenu.Separator className="my-1 h-px bg-slate-200 dark:bg-white/10" />
                <DropdownMenu.Item onSelect={() => signOut({ callbackUrl: "/" })} className={cn(MENU_ITEM, "cursor-pointer")}>
                  <LogOut className="h-4 w-4" /> Sign out
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
      </div>
    </header>
  )
}
