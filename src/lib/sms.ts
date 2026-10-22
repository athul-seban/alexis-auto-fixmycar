// SMS delivery. Twilio's REST API is called directly (one POST) rather than through the SDK, to keep the
// dependency list short. Like src/lib/mail.ts it has a dev fallback: with no credentials a send is logged and
// reported as skipped, so local development and CI never need an account and never text real people.

import { logger, maskPhone } from "@/lib/log"

export interface SendSmsInput {
  /** E.164, e.g. +447700900123 */
  to: string
  body: string
}

export interface SendSmsResult {
  success: boolean
  /** True when no provider is configured (nothing was sent). */
  skipped?: boolean
  error?: string
}

export const smsConfigured = () => Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && (process.env.TWILIO_FROM || process.env.TWILIO_MESSAGING_SERVICE_SID))

export async function sendSms({ to, body }: SendSmsInput): Promise<SendSmsResult> {
  const { TWILIO_ACCOUNT_SID: sid, TWILIO_AUTH_TOKEN: token, TWILIO_FROM: from, TWILIO_MESSAGING_SERVICE_SID: service } = process.env
  if (!sid || !token || (!from && !service)) {
    // The text can hold a customer's name and a private link, so outside development only the fact it was skipped is logged.
    logger.info("sms.skipped", { reason: "no provider configured", to: maskPhone(to), ...(process.env.NODE_ENV === "production" ? {} : { body }) })
    return { success: false, skipped: true }
  }

  const form = new URLSearchParams({ To: to, Body: body })
  if (service) form.set("MessagingServiceSid", service)
  else form.set("From", from!)

  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: { Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: form,
    })
    if (!res.ok) {
      const detail = (await res.json().catch(() => null)) as { message?: string } | null
      return { success: false, error: detail?.message ?? `Twilio responded ${res.status}` }
    }
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "SMS request failed" }
  }
}
