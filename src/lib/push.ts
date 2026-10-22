import webpush from "web-push"
import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { absoluteUrl } from "@/lib/portal/links"
import { recipientsForLocation } from "@/lib/org/notify-access"
import type { NotificationType } from "@/lib/notifications"

// Web Push to installed/opted-in browsers. Like mail.ts and sms.ts it is optional: with no VAPID keys configured
// nothing is sent and nothing breaks. It also never throws, because a push failing must not fail the action that
// triggered it.

export interface PushPayload {
  title: string
  body: string
  /** Path or absolute URL opened when the notification is tapped. */
  link?: string | null
}

let configured: boolean | undefined

/** True when the VAPID keys exist. (Public key is also exposed to the browser as NEXT_PUBLIC_VAPID_PUBLIC_KEY.) */
export function pushConfigured(): boolean {
  if (configured !== undefined) return configured
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const priv = process.env.VAPID_PRIVATE_KEY
  if (pub && priv) {
    webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? "mailto:support@quotemygarage.com", pub, priv)
    configured = true
  } else {
    configured = false
  }
  return configured
}

/** What the service worker receives. Kept small: push services cap payloads at ~4KB. */
export function pushMessage(p: PushPayload): string {
  return JSON.stringify({
    title: p.title.slice(0, 100),
    body: p.body.slice(0, 200),
    url: p.link ? (p.link.startsWith("http") ? p.link : absoluteUrl(p.link)) : absoluteUrl("/"),
  })
}

/** Is this the push service telling us the subscription is gone for good? */
export const isGone = (err: unknown) => {
  const code = (err as { statusCode?: number } | null)?.statusCode
  return code === 404 || code === 410
}

type SubscriptionWhere = Prisma.PushSubscriptionWhereInput

async function sendTo(where: SubscriptionWhere, payload: PushPayload): Promise<number> {
  if (!pushConfigured()) return 0
  try {
    const subs = await prisma.pushSubscription.findMany({ where })
    if (subs.length === 0) return 0
    const message = pushMessage(payload)
    let sent = 0
    await Promise.all(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, message, { TTL: 60 * 60 * 24 })
          sent += 1
        } catch (err) {
          // Unsubscribed or expired: stop trying it.
          if (isGone(err)) await prisma.pushSubscription.deleteMany({ where: { id: s.id } }).catch(() => {})
          else console.error("[push] send failed:", (err as Error)?.message)
        }
      })
    )
    return sent
  } catch (err) {
    console.error("[push] failed:", err)
    return 0
  }
}

export const pushToUser = (userId: string, payload: PushPayload) => sendTo({ userId }, payload)

/**
 * Push to the people who work at a location and are allowed to see this kind of notification (see notify-access.ts).
 * Devices are keyed by the person, so a member who is removed, suspended or loses the permission stops receiving at once.
 * Subscriptions made before staff existed are keyed by the location and still get it.
 */
export async function pushToGarage(garageId: string, payload: PushPayload, type: NotificationType): Promise<number> {
  if (!pushConfigured()) return 0
  try {
    const recipients = await recipientsForLocation(garageId, type)
    return sendTo({ OR: [{ garageId }, ...(recipients.length > 0 ? [{ userId: { in: recipients } }] : [])] }, payload)
  } catch (err) {
    console.error("[push] couldn't work out who to tell:", err)
    return 0
  }
}
