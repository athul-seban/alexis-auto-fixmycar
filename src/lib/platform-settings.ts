// Platform-wide credentials a super admin manages at /admin/settings. A value saved there (encrypted in the
// PlatformSetting table) wins over the environment variable of the same name, so the env vars remain a valid way to
// configure a deployment. Reads never throw: if the table is missing (schema not pushed yet) or a value can't be
// decrypted (encryption key changed), the env var is used instead.

import crypto from "crypto"
import { prisma } from "@/lib/prisma"

export const SETTING_KEYS = ["DVSA_CLIENT_ID", "DVSA_CLIENT_SECRET", "DVSA_API_KEY", "DVSA_TOKEN_URL", "VEHICLE_LOOKUP_API_KEY"] as const
export type SettingKey = (typeof SETTING_KEYS)[number]

export interface SettingMeta {
  label: string
  group: "DVSA MOT history" | "DVLA vehicle enquiry"
  /** Secrets are never shown again after saving (only the last 4 characters); the others are shown in full. */
  secret: boolean
  help: string
}

export const SETTING_META: Record<SettingKey, SettingMeta> = {
  DVSA_CLIENT_ID: { label: "Client ID", group: "DVSA MOT history", secret: false, help: "From the DVSA approval email." },
  DVSA_CLIENT_SECRET: { label: "Client secret", group: "DVSA MOT history", secret: true, help: "From the DVSA approval email." },
  DVSA_API_KEY: { label: "API key", group: "DVSA MOT history", secret: true, help: "Sent as the X-API-Key header. Copy and paste it as text; don't retype it." },
  DVSA_TOKEN_URL: { label: "Token URL", group: "DVSA MOT history", secret: false, help: "https://login.microsoftonline.com/<tenant id>/oauth2/v2.0/token" },
  VEHICLE_LOOKUP_API_KEY: { label: "API key", group: "DVLA vehicle enquiry", secret: true, help: "Fallback for vehicles with no MOT history yet. Free from the DVLA developer portal." },
}

export const isSettingKey = (k: string): k is SettingKey => (SETTING_KEYS as readonly string[]).includes(k)

// ---- encryption (AES-256-GCM) -------------------------------------------------------------------------------------

function encryptionKey(): Buffer {
  const s = process.env.SETTINGS_ENCRYPTION_KEY ?? process.env.NEXTAUTH_SECRET
  if (!s && process.env.NODE_ENV === "production") throw new Error("SETTINGS_ENCRYPTION_KEY or NEXTAUTH_SECRET must be set")
  return crypto.createHash("sha256").update(s ?? "dev-only-settings-key").digest()
}

export function encryptValue(plain: string): string {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv)
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()])
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), data.toString("base64url")].join(":")
}

/** Returns null when the value is malformed or was encrypted with a different key. */
export function decryptValue(stored: string): string | null {
  try {
    const [version, iv, tag, data] = stored.split(":")
    if (version !== "v1" || !iv || !tag || !data) return null
    const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64url"))
    decipher.setAuthTag(Buffer.from(tag, "base64url"))
    return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8")
  } catch {
    return null
  }
}

// ---- reads --------------------------------------------------------------------------------------------------------

const TTL_MS = 60_000
let cache: { at: number; values: Map<string, string> } | null = null

export function clearSettingsCache() {
  cache = null
}

async function stored(): Promise<Map<string, string>> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.values
  const values = new Map<string, string>()
  try {
    for (const row of await prisma.platformSetting.findMany()) {
      const plain = decryptValue(row.value)
      if (plain === null) console.error(`[platform-settings] can't decrypt ${row.key}; using the environment variable`)
      else values.set(row.key, plain)
    }
  } catch (err) {
    console.error("[platform-settings] read failed; using environment variables:", (err as Error).message)
  }
  cache = { at: Date.now(), values }
  return values
}

/** The saved value, else the environment variable, else undefined. Never throws. */
export async function getSetting(key: SettingKey): Promise<string | undefined> {
  return (await stored()).get(key) || process.env[key] || undefined
}

export async function getSettings<K extends SettingKey>(keys: readonly K[]): Promise<Record<K, string | undefined>> {
  const saved = await stored()
  return Object.fromEntries(keys.map((k) => [k, saved.get(k) || process.env[k] || undefined])) as Record<K, string | undefined>
}

// ---- admin screen -------------------------------------------------------------------------------------------------

export interface SettingStatus {
  key: SettingKey
  label: string
  group: SettingMeta["group"]
  secret: boolean
  help: string
  set: boolean
  /** Where the value in use comes from. */
  source: "saved" | "env" | "none"
  /** Secrets: "••••" + the last 4 characters. Everything else: the value. Never the full secret. */
  preview: string | null
  updatedAt: string | null
  updatedBy: string | null
}

const mask = (v: string) => `••••${v.slice(-4)}`

export async function settingStatuses(): Promise<SettingStatus[]> {
  const saved = await stored()
  let rows: { key: string; updatedAt: Date; updatedById: string | null }[] = []
  let names = new Map<string, string>()
  try {
    rows = await prisma.platformSetting.findMany({ select: { key: true, updatedAt: true, updatedById: true } })
    const ids = [...new Set(rows.map((r) => r.updatedById).filter((x): x is string => !!x))]
    const users = ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, email: true } }) : []
    names = new Map(users.map((u) => [u.id, u.email]))
  } catch {
    // table not there yet: report env-only status
  }
  const byKey = new Map(rows.map((r) => [r.key, r]))

  return SETTING_KEYS.map((key) => {
    const meta = SETTING_META[key]
    const savedValue = saved.get(key)
    const value = savedValue || process.env[key] || undefined
    const row = savedValue ? byKey.get(key) : undefined
    return {
      key,
      ...meta,
      set: Boolean(value),
      source: savedValue ? "saved" : value ? "env" : "none",
      preview: value ? (meta.secret ? mask(value) : value) : null,
      updatedAt: row?.updatedAt.toISOString() ?? null,
      updatedBy: row?.updatedById ? (names.get(row.updatedById) ?? null) : null,
    }
  })
}

// ---- writes -------------------------------------------------------------------------------------------------------

export async function saveSetting(key: SettingKey, value: string, userId: string | null): Promise<void> {
  const data = { value: encryptValue(value), updatedById: userId }
  await prisma.platformSetting.upsert({ where: { key }, create: { key, ...data }, update: data })
  clearSettingsCache()
}

/** Remove the saved value so the environment variable (if any) applies again. */
export async function clearSetting(key: SettingKey): Promise<void> {
  await prisma.platformSetting.deleteMany({ where: { key } })
  clearSettingsCache()
}
