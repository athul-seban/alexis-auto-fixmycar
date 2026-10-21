// DVSA MOT history lookup (https://documentation.history.mot.api.gov.uk). Needs credentials DVSA issues to the
// platform: DVSA_CLIENT_ID, DVSA_CLIENT_SECRET, DVSA_TOKEN_URL (contains the tenant id) and DVSA_API_KEY. They come
// from the super admin's Settings screen (encrypted in the database) or, failing that, the environment
// (see platform-settings.ts). With none set, `motHistoryConfigured()` is false and lookups are simply unavailable;
// typing a vehicle in by hand still works.
//
// NOTE: DVSA's response shape and lookup path were written from its published docs without a live key. The parser
// below is deliberately tolerant (missing fields, several date formats) but confirm against a real response before launch.

import { normaliseVrm } from "@/lib/portal/vrm"
import { getSettings } from "@/lib/platform-settings"

const SCOPE = "https://tapi.dvsa.gov.uk/.default"
const DEFAULT_BASE = "https://history.mot.api.gov.uk/v1/trade/vehicles/registration"

const DVSA_KEYS = ["DVSA_CLIENT_ID", "DVSA_CLIENT_SECRET", "DVSA_TOKEN_URL", "DVSA_API_KEY"] as const
interface DvsaConfig {
  clientId: string
  clientSecret: string
  tokenUrl: string
  apiKey: string
}

/** The four credentials, or null unless all are set. */
async function dvsaConfig(): Promise<DvsaConfig | null> {
  const c = await getSettings(DVSA_KEYS)
  if (!c.DVSA_CLIENT_ID || !c.DVSA_CLIENT_SECRET || !c.DVSA_TOKEN_URL || !c.DVSA_API_KEY) return null
  return { clientId: c.DVSA_CLIENT_ID, clientSecret: c.DVSA_CLIENT_SECRET, tokenUrl: c.DVSA_TOKEN_URL, apiKey: c.DVSA_API_KEY }
}

export const motHistoryConfigured = async (): Promise<boolean> => (await dvsaConfig()) !== null

export interface MotTest {
  /** ISO date (yyyy-mm-dd) the test was completed. */
  date: string | null
  result: "PASSED" | "FAILED" | "UNKNOWN"
  expiry: string | null
  mileage: number | null
  mileageUnit: "mi" | "km" | null
  advisories: string[]
  failures: string[]
}

export interface MotVehicle {
  registration: string
  make: string | null
  model: string | null
  fuel: string | null
  colour: string | null
  /** Year the vehicle was first registered/used, when known. */
  year: number | null
  /** Expiry date (yyyy-mm-dd) of the most recent PASSED test. */
  motExpiry: string | null
  latestMileage: number | null
  tests: MotTest[]
}

type Json = Record<string, unknown>
const asObj = (v: unknown): Json => (v && typeof v === "object" ? (v as Json) : {})
const asStr = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null)
const asNum = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v) : v
  return typeof n === "number" && Number.isFinite(n) ? n : null
}

/** DVSA sends "2023-11-03", "2023-11-03T10:12:00.000Z", "2023-11-03 10:12:00" or "2023.11.03"; return yyyy-mm-dd or null. */
export function toIsoDate(v: unknown): string | null {
  const s = asStr(v)
  if (!s) return null
  const m = s.match(/^(\d{4})[-./](\d{2})[-./](\d{2})/)
  if (!m) return null
  const [, y, mo, d] = m
  const date = new Date(`${y}-${mo}-${d}T00:00:00Z`)
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== `${y}-${mo}-${d}` ? null : `${y}-${mo}-${d}`
}

const titleCase = (s: string | null) => (s ? s.toLowerCase().replace(/(^|[\s-])\w/g, (c) => c.toUpperCase()) : null)

/** Turn DVSA's JSON into the small, stable shape the rest of the app uses. Never throws on odd input. */
export function normaliseMotHistory(raw: unknown, fallbackReg = ""): MotVehicle {
  const v = asObj(raw)
  const tests: MotTest[] = (Array.isArray(v.motTests) ? v.motTests : []).map((t) => {
    const o = asObj(t)
    const defects = (Array.isArray(o.defects) ? o.defects : []).map(asObj)
    const textOf = (types: string[]) => defects.filter((d) => types.includes(String(d.type ?? "").toUpperCase())).map((d) => asStr(d.text)).filter((x): x is string => x !== null)
    const result = String(o.testResult ?? "").toUpperCase()
    const unit = String(o.odometerUnit ?? "").toUpperCase()
    return {
      date: toIsoDate(o.completedDate),
      result: result === "PASSED" || result === "FAILED" ? result : "UNKNOWN",
      expiry: toIsoDate(o.expiryDate),
      mileage: asNum(o.odometerValue),
      mileageUnit: unit === "MI" ? "mi" : unit === "KM" ? "km" : null,
      advisories: textOf(["ADVISORY"]),
      failures: textOf(["FAIL", "MAJOR", "DANGEROUS"]),
    }
  })
  // Newest first, whatever order DVSA used.
  tests.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))

  const firstUsed = toIsoDate(v.firstUsedDate) ?? toIsoDate(v.registrationDate) ?? toIsoDate(v.manufactureDate)
  const lastPass = tests.find((t) => t.result === "PASSED" && t.expiry)
  const withMiles = tests.find((t) => t.mileage !== null)
  const reg = asStr(v.registration) ?? fallbackReg
  return {
    registration: normaliseVrm(reg),
    make: titleCase(asStr(v.make)),
    model: titleCase(asStr(v.model)),
    fuel: titleCase(asStr(v.fuelType)),
    colour: titleCase(asStr(v.primaryColour)),
    year: firstUsed ? Number(firstUsed.slice(0, 4)) : (asNum(v.manufactureYear) ?? null),
    motExpiry: lastPass?.expiry ?? null,
    latestMileage: withMiles?.mileage ?? null,
    tests,
  }
}

// Cached per credential set, so saving new credentials never reuses a token issued for the old ones.
let token: { forCredentials: string; value: string; expiresAt: number } | null = null

async function accessToken(cfg: DvsaConfig): Promise<string> {
  const forCredentials = `${cfg.tokenUrl}|${cfg.clientId}|${cfg.clientSecret}`
  if (token && token.forCredentials === forCredentials && token.expiresAt > Date.now() + 60_000) return token.value
  const res = await fetch(cfg.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      scope: SCOPE,
    }),
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) throw new Error(`DVSA token request failed (${res.status})`)
  const body = (await res.json()) as { access_token: string; expires_in?: number }
  // Tokens last 60 minutes; cache for the lifetime DVSA states.
  token = { forCredentials, value: body.access_token, expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000 }
  return token.value
}

export type LookupResult = { ok: true; vehicle: MotVehicle } | { ok: false; reason: "UNAVAILABLE" | "NOT_FOUND" | "ERROR" }

/** Look a registration up at DVSA. Never throws: callers get a reason they can show. */
export async function lookupMotHistory(registration: string): Promise<LookupResult> {
  const cfg = await dvsaConfig()
  if (!cfg) return { ok: false, reason: "UNAVAILABLE" }
  const reg = normaliseVrm(registration)
  if (!reg) return { ok: false, reason: "NOT_FOUND" }
  try {
    const base = (process.env.DVSA_MOT_BASE_URL ?? DEFAULT_BASE).replace(/\/$/, "")
    const res = await fetch(`${base}/${encodeURIComponent(reg)}`, {
      headers: { Authorization: `Bearer ${await accessToken(cfg)}`, "X-API-Key": cfg.apiKey, Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    })
    if (res.status === 404) return { ok: false, reason: "NOT_FOUND" }
    if (res.status === 401) token = null // expired or revoked: fetch a fresh one next time
    if (!res.ok) throw new Error(`DVSA lookup failed (${res.status})`)
    return { ok: true, vehicle: normaliseMotHistory(await res.json(), reg) }
  } catch (err) {
    console.error("[mot-history] lookup failed:", (err as Error).message)
    return { ok: false, reason: "ERROR" }
  }
}

/**
 * "Test connection" for the Settings screen: gets a fresh token, then makes one lookup. DVSA answering 200 or 404
 * ("no such vehicle") both prove the credentials work. Reports what failed, never a credential.
 */
export async function testMotConnection(): Promise<{ ok: boolean; message: string }> {
  const cfg = await dvsaConfig()
  if (!cfg) return { ok: false, message: "Not set up yet: all four DVSA values are needed." }
  token = null
  try {
    await accessToken(cfg)
  } catch (err) {
    const status = /\((\d+)\)/.exec((err as Error).message)?.[1]
    return { ok: false, message: `DVSA's login rejected the client ID, client secret or token URL${status ? ` (HTTP ${status})` : ""}.` }
  }
  try {
    const base = (process.env.DVSA_MOT_BASE_URL ?? DEFAULT_BASE).replace(/\/$/, "")
    const res = await fetch(`${base}/AB12CDE`, {
      headers: { Authorization: `Bearer ${await accessToken(cfg)}`, "X-API-Key": cfg.apiKey, Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    })
    if (res.ok || res.status === 404) return { ok: true, message: "Connected: DVSA accepted the credentials." }
    if (res.status === 401 || res.status === 403) return { ok: false, message: `DVSA's login worked but it rejected the API key (HTTP ${res.status}). Check it was pasted exactly.` }
    return { ok: false, message: `DVSA answered with an unexpected status (HTTP ${res.status}).` }
  } catch {
    return { ok: false, message: "Couldn't reach DVSA (network error or timeout). Try again." }
  }
}

/** A job description seed from the latest test's advisories, so the customer starts from what the MOT actually flagged. */
export function advisoryDescription(v: MotVehicle, max = 5): string {
  const latest = v.tests.find((t) => t.advisories.length > 0 || t.failures.length > 0)
  if (!latest) return ""
  const items = [...latest.failures.map((f) => `${f} (failed)`), ...latest.advisories.map((a) => `${a} (advisory)`)].slice(0, max)
  return `From the last MOT${latest.date ? ` (${latest.date})` : ""}: ${items.join("; ")}.`
}
