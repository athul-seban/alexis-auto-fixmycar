"use client"

import { useCallback, useEffect, useState } from "react"
import { BellRing, Download } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { useToast } from "@/components/ui/toast"
import { sendJson } from "@/hooks/use-api"
import { Panel } from "@/components/garage-portal/shared/PageHeader"

type Support = "checking" | "unsupported" | "unavailable" | "ready"

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
}

/** VAPID keys are base64url; the Push API wants raw bytes. */
function urlBase64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/")
  const raw = atob(padded)
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

/** Install the site as an app and opt this device in to push notifications. Used on the customer and garage settings pages. */
export function AppOnDeviceCard() {
  const { toast } = useToast()
  const [support, setSupport] = useState<Support>("checking")
  const [publicKey, setPublicKey] = useState<string | null>(null)
  const [subscribed, setSubscribed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [installEvent, setInstallEvent] = useState<InstallPromptEvent | null>(null)

  const refresh = useCallback(async () => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return setSupport("unsupported")
    const info = await fetch("/api/push/subscribe").then((r) => r.json()).catch(() => null)
    if (!info?.available) return setSupport("unavailable")
    setPublicKey(info.publicKey)
    const reg = await navigator.serviceWorker.getRegistration("/sw.js")
    setSubscribed(Boolean(await reg?.pushManager.getSubscription()))
    setSupport("ready")
  }, [])

  useEffect(() => {
    // Checking support needs browser APIs, so it can only run after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh()
    const onPrompt = (e: Event) => {
      e.preventDefault()
      setInstallEvent(e as InstallPromptEvent)
    }
    window.addEventListener("beforeinstallprompt", onPrompt)
    return () => window.removeEventListener("beforeinstallprompt", onPrompt)
  }, [refresh])

  async function enable() {
    setBusy(true)
    setError("")
    try {
      const permission = await Notification.requestPermission()
      if (permission !== "granted") throw new Error("Notifications are blocked for this site. Allow them in your browser settings, then try again.")
      const reg = (await navigator.serviceWorker.getRegistration("/sw.js")) ?? (await navigator.serviceWorker.register("/sw.js"))
      await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToBytes(publicKey!) })
      const res = await sendJson("/api/push/subscribe", "POST", sub.toJSON())
      if (!res.ok) {
        await sub.unsubscribe()
        throw new Error(res.error ?? "Couldn't turn on notifications")
      }
      setSubscribed(true)
      toast("Notifications on for this device")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't turn on notifications")
    } finally {
      setBusy(false)
    }
  }

  async function disable() {
    setBusy(true)
    setError("")
    try {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js")
      const sub = await reg?.pushManager.getSubscription()
      if (sub) {
        await sendJson("/api/push/subscribe", "DELETE", { endpoint: sub.endpoint })
        await sub.unsubscribe()
      }
      setSubscribed(false)
      toast("Notifications off for this device")
    } catch {
      setError("Couldn't turn off notifications")
    } finally {
      setBusy(false)
    }
  }

  async function install() {
    if (!installEvent) return
    await installEvent.prompt()
    await installEvent.userChoice
    setInstallEvent(null)
  }

  return (
    <Panel className="p-4 sm:p-6">
      <h2 className="text-lg font-bold text-slate-900 dark:text-white">App &amp; notifications</h2>
      <p className="mb-4 mt-0.5 text-sm text-slate-500 dark:text-slate-400">Add Quote My Garage to your home screen and get a notification the moment something needs you.</p>

      {installEvent && (
        <Button variant="outline" className="mb-4 gap-2" onClick={install}>
          <Download className="h-4 w-4" aria-hidden /> Install the app
        </Button>
      )}

      {support === "unsupported" && <p role="status" className="text-sm text-slate-600 dark:text-slate-300">This browser doesn&apos;t support push notifications. On iPhone, add the site to your home screen first, then open it from there.</p>}
      {support === "unavailable" && <p role="status" className="text-sm text-slate-600 dark:text-slate-300">Push notifications aren&apos;t switched on for the platform yet.</p>}
      {support === "ready" && (
        <label className="flex cursor-pointer items-start gap-3">
          <Switch checked={subscribed} disabled={busy} onCheckedChange={(on) => (on ? enable() : disable())} aria-label="Notifications on this device" />
          <span>
            <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-white">
              <BellRing className="h-4 w-4" aria-hidden /> Notifications on this device
            </span>
            <span className="block text-xs text-slate-500 dark:text-slate-400">New quotes, messages and booking changes. Each device is set up separately.</span>
          </span>
        </label>
      )}
      {error && <p role="alert" className="mt-3 text-sm text-red-700 dark:text-red-400">{error}</p>}
    </Panel>
  )
}
