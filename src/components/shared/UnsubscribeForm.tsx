"use client"

import { useState } from "react"
import { useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"

/** Opening the link only shows this; nothing changes until the button is pressed (mail scanners prefetch links). */
export function UnsubscribeForm() {
  const token = useSearchParams().get("t") ?? ""
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle")

  async function confirm() {
    setState("busy")
    const res = await fetch("/api/unsubscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    }).catch(() => null)
    setState(res?.ok ? "done" : "error")
  }

  return (
    <div className="mx-auto max-w-md rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm dark:border-white/10 dark:bg-slate-900">
      <h1 className="mb-3 text-2xl font-bold text-slate-900 dark:text-white">Unsubscribe</h1>
      {state === "done" ? (
        <p role="status" className="text-slate-600 dark:text-slate-300">You&apos;re unsubscribed. You won&apos;t get these emails any more. Emails about a booking you&apos;ve made will still reach you.</p>
      ) : !token ? (
        <p className="text-slate-600 dark:text-slate-300">This unsubscribe link isn&apos;t valid. Use the link at the bottom of the email.</p>
      ) : (
        <>
          <p className="mb-6 text-slate-600 dark:text-slate-300">Stop review requests, reminders and offers by email. Emails about a booking you&apos;ve made will still reach you.</p>
          {state === "error" && <p role="alert" className="mb-4 text-sm text-red-700 dark:text-red-400">That didn&apos;t work. The link may be invalid or expired.</p>}
          <Button variant="primary" className="w-full" loading={state === "busy"} onClick={confirm}>Unsubscribe me</Button>
        </>
      )}
    </div>
  )
}
