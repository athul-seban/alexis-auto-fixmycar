"use client"

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import type { PortalNav } from "@/components/portal-shell/nav"

const Key = ({ children }: { children: React.ReactNode }) => (
  <kbd className="inline-flex min-w-6 items-center justify-center rounded border border-slate-300 bg-slate-50 px-1.5 py-0.5 font-mono text-xs font-semibold text-slate-700 dark:border-white/20 dark:bg-slate-900 dark:text-slate-200">
    {children}
  </kbd>
)

export function ShortcutsDialog({ nav, open, onOpenChange }: { nav: PortalNav; open: boolean; onOpenChange: (open: boolean) => void }) {
  const items = nav.sections.flatMap((s) => s.items).filter((i) => i.shortcut)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>Not active while you are typing in a field.</DialogDescription>
        </DialogHeader>
        <ul className="space-y-2 text-sm text-slate-700 dark:text-slate-300">
          {items.map((i) => (
            <li key={i.href} className="flex items-center justify-between">
              <span>Go to {i.label}</span>
              <span className="flex items-center gap-1">
                <Key>g</Key>
                <span className="text-xs text-slate-400">then</span>
                <Key>{i.shortcut}</Key>
              </span>
            </li>
          ))}
          <li className="flex items-center justify-between">
            <span>Focus search</span>
            <Key>/</Key>
          </li>
          <li className="flex items-center justify-between">
            <span>Show this list</span>
            <Key>?</Key>
          </li>
        </ul>
      </DialogContent>
    </Dialog>
  )
}
