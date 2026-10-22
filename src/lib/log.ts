// Structured logging: one JSON object per line (level, event, fields, time), which Vercel's log search and any log drain can
// filter on, instead of free text. Never put a secret, a message body or a full address in a field: mask people's contact
// details with maskEmail/maskPhone, and log what happened, not what was said.

type Level = "info" | "warn" | "error"
type Fields = Record<string, unknown>

/** `jane.doe@example.com` -> `j***@example.com`: enough to tell two people apart in a log, not enough to contact them. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@")
  if (at < 1) return "***"
  return `${email.slice(0, 1)}***${email.slice(at)}`
}

/** `+44 7700 900123` -> `***123`. */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "")
  return digits.length <= 4 ? "***" : `***${digits.slice(-3)}`
}

export function log(level: Level, event: string, fields: Fields = {}): void {
  const line = JSON.stringify({ level, event, ...fields, time: new Date().toISOString() })
  if (level === "error") console.error(line)
  else if (level === "warn") console.warn(line)
  else console.log(line)
}

export const logger = {
  info: (event: string, fields?: Fields) => log("info", event, fields),
  warn: (event: string, fields?: Fields) => log("warn", event, fields),
  error: (event: string, fields?: Fields) => log("error", event, fields),
}
