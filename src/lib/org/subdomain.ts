// What a business may call its website address: <label>.<root domain>. Labels are chosen once and, if changed, the old
// one keeps redirecting (see SiteDomain), so the rules are strict from the start: ASCII only (no look-alike letters from
// other alphabets), a safe DNS shape, and nothing that could be mistaken for the platform itself.

export const SUBDOMAIN_MIN = 3
export const SUBDOMAIN_MAX = 40

/** Words that name our own services, mail and infrastructure, or that people trust as official. Never available. */
export const RESERVED_LABELS: ReadonlySet<string> = new Set([
  // the platform
  "www", "app", "api", "admin", "administrator", "dashboard", "portal", "garage", "garages", "garage-dashboard", "sites", "site",
  "widget", "widgets", "blog", "guides", "search", "post-job", "quote", "quotes", "quotemygarage", "quote-my-garage", "qmg",
  "account", "accounts", "login", "logout", "signin", "signup", "register", "auth", "oauth", "sso", "secure", "security",
  "billing", "pay", "payment", "payments", "checkout", "invoice", "invoices", "stripe", "support", "help", "contact", "legal",
  "privacy", "terms", "cookies", "status", "health", "metrics", "docs", "developer", "developers", "press", "careers", "jobs",
  // infrastructure and mail
  "mail", "email", "smtp", "imap", "pop", "pop3", "mx", "ns", "ns1", "ns2", "dns", "ftp", "sftp", "ssh", "vpn", "cdn", "static",
  "assets", "img", "images", "media", "files", "download", "downloads", "upload", "uploads", "cloud", "git", "ci",
  "dev", "development", "staging", "stage", "test", "testing", "demo", "preview", "sandbox", "beta", "alpha", "internal", "root",
  "localhost", "local", "origin", "edge", "proxy", "server", "web", "webmail", "autodiscover",
  // names people trust
  "official", "verified", "gov", "dvsa", "dvla", "police", "nhs", "hmrc", "bank", "google", "facebook", "instagram", "paypal",
  "microsoft", "apple", "amazon", "whatsapp", "twitter", "youtube", "tiktok",
])

/** The shape a user's text is turned into before the rules are checked: lower case, spaces and underscores to hyphens. */
export function normaliseLabel(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/-{2,}/g, "-")
}

/** A readable starting point from a business name: "Acme Motors Ltd." -> "acme-motors". */
export function suggestLabel(name: string): string {
  const ascii = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\b(ltd|limited|plc|llp|inc)\b/g, " ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SUBDOMAIN_MAX)
    .replace(/-+$/g, "")
  return ascii
}

/** Why a label can't be used, in words for the person choosing it; null when it is fine. Expects an already normalised label. */
export function subdomainProblem(label: string): string | null {
  if (label.length < SUBDOMAIN_MIN) return `Use at least ${SUBDOMAIN_MIN} characters.`
  if (label.length > SUBDOMAIN_MAX) return `Use at most ${SUBDOMAIN_MAX} characters.`
  // ASCII letters, digits and single hyphens only: no look-alike letters from other alphabets, no dots (one label), no punycode.
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(label)) return "Use only lower-case letters, numbers and single hyphens, and don't start or end with a hyphen."
  if (label.startsWith("xn--") || label.includes("--")) return "That can't be used."
  if (/^\d+$/.test(label)) return "Include at least one letter."
  if (RESERVED_LABELS.has(label)) return "That name is reserved. Please choose another."
  // Anything built on a reserved word ("admin-login", "stripe-pay") is the same trick with a hyphen in it.
  const parts = label.split("-")
  if (parts.some((p) => ["admin", "login", "stripe", "paypal", "support", "secure", "billing", "official", "dvsa", "dvla", "hmrc", "nhs", "bank"].includes(p))) {
    return "That name looks like one of ours or someone else's. Please choose another."
  }
  return null
}

/** A label ready to store: normalised and valid, or the reason it isn't. */
export function parseLabel(input: string): { ok: true; label: string } | { ok: false; error: string } {
  // Tidying the text collapses repeated hyphens, which would quietly turn a punycode prefix ("xn--") into an ordinary
  // label the person didn't type. Judge what they actually wrote.
  if (/^\s*xn--/i.test(input)) return { ok: false, error: "That can't be used." }
  const label = normaliseLabel(input)
  const problem = subdomainProblem(label)
  return problem ? { ok: false, error: problem } : { ok: true, label }
}
