"use client"

import { useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import type { PortalNav } from "@/components/portal-shell/nav"

const CHORD_MS = 1200

/** Typing in a field (or any editable region) must never trigger a shortcut. */
export function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName)
}

/**
 * Keyboard shortcuts for a portal: `g` then a letter jumps to a section (letters come from nav.ts), `/` focuses
 * the page's search box, `?` opens the help list. Ignored while typing and when a modifier key is held.
 */
export function useShortcuts(nav: PortalNav, onHelp: () => void) {
  const router = useRouter()
  const chordAt = useRef(0)

  useEffect(() => {
    const routes = new Map(nav.sections.flatMap((s) => s.items).filter((i) => i.shortcut).map((i) => [i.shortcut!, i.href]))

    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target)) return
      // Don't hijack keys while a dialog is open (its own controls handle them).
      if (document.querySelector("[role=dialog]")) return

      if (chordAt.current && Date.now() - chordAt.current < CHORD_MS) {
        chordAt.current = 0
        const href = routes.get(e.key.toLowerCase())
        if (href) {
          e.preventDefault()
          router.push(href)
        }
        return
      }
      if (e.key === "g" && routes.size > 0) {
        chordAt.current = Date.now()
      } else if (e.key === "/") {
        const search = document.querySelector<HTMLInputElement>("input[type=search]")
        if (search) {
          e.preventDefault()
          search.focus()
        }
      } else if (e.key === "?") {
        e.preventDefault()
        onHelp()
      }
    }

    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [nav, onHelp, router])
}
