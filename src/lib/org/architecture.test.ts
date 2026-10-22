import { describe, it, expect } from "vitest"
import fs from "fs"
import path from "path"
import { isPermissionKey } from "@/lib/org/permissions"

// Guard rails for the "who is this garage user and what may they do" rules. These read the source files on purpose: they
// fail the build when someone adds a route or a lookup that quietly bypasses the permission system, which a normal
// behavioural test can't notice because the bypass simply "works".

const ROOT = path.resolve(__dirname, "../../..")
const read = (p: string) => fs.readFileSync(p, "utf8")

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? (d.name === "node_modules" || d.name === ".next" ? [] : walk(path.join(dir, d.name))) : [path.join(dir, d.name)]))
}
const rel = (p: string) => path.relative(ROOT, p).replace(/\\/g, "/")
const sourceFiles = [...walk(path.join(ROOT, "app")), ...walk(path.join(ROOT, "src"))].filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\.(ts|tsx)$/.test(f))

describe("garage access goes through the resolver", () => {
  it("nothing looks up 'the garage for this user' by hand (that is what resolveGarageAccess is for)", () => {
    // The hand-rolled lookups ignored businesses, locations and permissions. The admin support page legitimately reads a
    // specific user's garage; the resolver and the business-creation helper are the other allowed places.
    const ALLOWED = new Set(["src/lib/org/resolve.ts", "app/api/admin/support/route.ts"])
    const offenders = sourceFiles
      .filter((f) => !ALLOWED.has(rel(f)))
      .filter((f) => /prisma\.garage\.(findUnique|findUniqueOrThrow|findFirst|findFirstOrThrow)\(\s*\{\s*where:\s*\{[^}]*\buserId\b/.test(read(f)))
      .map(rel)
    expect(offenders).toEqual([])
  })

  it("every route under app/api/garage uses withGarage", () => {
    const routes = walk(path.join(ROOT, "app/api/garage")).filter((f) => f.endsWith("route.ts") && !f.endsWith(".test.ts"))
    expect(routes.length).toBeGreaterThan(20)
    const missing = routes.filter((f) => !/\bwithGarage\b/.test(read(f))).map(rel)
    expect(missing).toEqual([])
  })

  it("nothing outside the resolver reads the owner's login off a garage to decide access", () => {
    const offenders = sourceFiles
      .filter((f) => !["src/lib/org/resolve.ts", "src/lib/org/create.ts"].includes(rel(f)))
      .filter((f) => /garage\.userId\s*===|===\s*garage\.userId|userId:\s*garage\.userId/.test(read(f)))
      .map(rel)
    expect(offenders).toEqual([])
  })
})

// ---- the permission on every garage route: a reviewed snapshot ---------------------------------------------------------
// Changing who may call a route is a security decision, so it has to change HERE too, where a reviewer will see it.

const EXPECTED: Record<string, string> = {
  "app/api/garage/technicians/route.ts GET": '{ anyOf: ["bookings.view", "diary.view", "bookings.viewOwn", "diary.viewOwn"] }',
  "app/api/garage/technicians/route.ts POST": '"technicians.manage"',
  "app/api/garage/technicians/[id]/route.ts PATCH": '"technicians.manage"',
  "app/api/garage/technicians/[id]/route.ts DELETE": '"technicians.manage"',
  "app/api/garage/stripe/connect/route.ts GET": '"billing.view"',
  "app/api/garage/stripe/connect/route.ts POST": '"billing.manage"',
  "app/api/garage/settings/route.ts GET": '"member"',
  "app/api/garage/settings/route.ts PATCH": '"settings.edit"',
  "app/api/garage/change-password/route.ts POST": '"member"',
  "app/api/garage/documents/[id]/file/route.ts GET": '"documents.manage"',
  "app/api/garage/documents/route.ts GET": '"documents.manage"',
  "app/api/garage/documents/route.ts POST": '"documents.manage"',
  "app/api/garage/documents/route.ts DELETE": '"documents.manage"',
  "app/api/garage/diary/route.ts GET": '{ anyOf: ["diary.view", "diary.viewOwn"] }',
  "app/api/garage/bookings/route.ts GET": '{ anyOf: ["bookings.view", "bookings.viewOwn"] }',
  "app/api/garage/bookings/route.ts POST": '"bookings.manage"',
  "app/api/garage/billing/route.ts GET": '"billing.view"',
  "app/api/garage/billing/route.ts POST": '"billing.manage"',
  "app/api/garage/bookings/bulk/route.ts POST": '"bookings.manage"',
  "app/api/garage/insights/route.ts GET": '"insights.view"',
  "app/api/garage/reviews/[id]/route.ts PATCH": '"reviews.reply"',
  "app/api/garage/bookings/[id]/route.ts GET": '{ anyOf: ["bookings.view", "bookings.viewOwn"] }',
  "app/api/garage/bookings/[id]/route.ts PATCH": '{ anyOf: ["bookings.manage", "bookings.updateOwn"] }',
  "app/api/garage/diary/blocks/[id]/route.ts DELETE": '"diary.manage"',
  "app/api/garage/diary/blocks/route.ts POST": '"diary.manage"',
  "app/api/garage/bookings/[id]/invoice/route.ts GET": '"invoices.issue"',
  "app/api/garage/bookings/[id]/invoice/route.ts POST": '"invoices.issue"',
  "app/api/garage/customers/detail/route.ts GET": '"customers.view"',
  "app/api/garage/enquiries/route.ts GET": '"enquiries.view"',
  "app/api/garage/customers/route.ts GET": '"customers.view"',
  "app/api/garage/reviews/[id]/dispute/route.ts POST": '"reviews.reply"',
  "app/api/garage/customers/merge/route.ts POST": '"customers.manage"',
  "app/api/garage/customers/merge/route.ts DELETE": '"customers.manage"',
  "app/api/garage/pricing/route.ts GET": '"pricing.view"',
  "app/api/garage/pricing/route.ts PUT": '"pricing.edit"',
  "app/api/garage/reviews/route.ts GET": '"reviews.view"',
  "app/api/garage/customers/note/route.ts PUT": '"customers.manage"',
  "app/api/garage/overview/route.ts GET": '"member"',
  "app/api/garage/enquiries/[kind]/[id]/route.ts PATCH": '"enquiries.respond"',
  "app/api/garage/me/route.ts GET": '"member"',
  "app/api/garage/audit/route.ts GET": '"audit.view"',
  "app/api/garage/site/route.ts GET": '"website.edit"',
  "app/api/garage/site/route.ts PATCH": '"website.edit"',
  "app/api/garage/site/address/route.ts GET": '"website.edit"',
  "app/api/garage/site/address/route.ts PUT": '"website.edit"',
  "app/api/garage/site/publish/route.ts POST": '"website.edit"',
  "app/api/garage/site/upload/route.ts POST": '"website.edit"',
  "app/api/garage/business/route.ts GET": '"organisation.edit"',
  "app/api/garage/business/route.ts PATCH": '"organisation.edit"',
  "app/api/garage/location/route.ts POST": '"member"',
  "app/api/garage/locations/route.ts GET": '"locations.manage"',
  "app/api/garage/locations/route.ts POST": '"locations.manage"',
  "app/api/garage/locations/[id]/route.ts PATCH": '"locations.manage"',
  "app/api/garage/roles/route.ts GET": '{ anyOf: ["roles.manage", "staff.manage"] }',
  "app/api/garage/roles/route.ts POST": '"roles.manage"',
  "app/api/garage/roles/[id]/route.ts PATCH": '"roles.manage"',
  "app/api/garage/roles/[id]/route.ts DELETE": '"roles.manage"',
  "app/api/garage/staff/route.ts GET": '"staff.manage"',
  "app/api/garage/staff/invites/route.ts POST": '"staff.manage"',
  "app/api/garage/staff/invites/[id]/route.ts DELETE": '"staff.manage"',
  "app/api/garage/staff/invites/[id]/route.ts POST": '"staff.manage"',
  "app/api/garage/staff/[membershipId]/route.ts PATCH": '"staff.manage"',
  "app/api/garage/staff/[membershipId]/route.ts DELETE": '"staff.manage"',
  "app/api/garage/staff/[membershipId]/assignments/route.ts POST": '"staff.manage"',
  "app/api/garage/staff/[membershipId]/assignments/[assignmentId]/route.ts DELETE": '"staff.manage"',
}

/** `export const METHOD = withGarage(` calls in a file, with the `permission:` each one declares. */
function declaredPermissions(file: string): Record<string, string | null> {
  const src = read(file)
  const out: Record<string, string | null> = {}
  const starts = [...src.matchAll(/export const (GET|POST|PATCH|PUT|DELETE) = withGarage/g)]
  starts.forEach((m, i) => {
    const end = starts[i + 1]?.index ?? src.length
    const body = src.slice(m.index!, end)
    out[`${rel(file)} ${m[1]}`] = body.match(/permission:\s*("[^"]+"|\{\s*anyOf:\s*\[[^\]]*\]\s*\})/)?.[1]?.replace(/\s+/g, " ") ?? null
  })
  return out
}

describe("permission on every garage route", () => {
  const actual: Record<string, string | null> = {}
  for (const f of walk(path.join(ROOT, "app/api/garage")).filter((x) => x.endsWith("route.ts"))) Object.assign(actual, declaredPermissions(f))

  it("every withGarage call declares a permission", () => {
    expect(Object.entries(actual).filter(([, p]) => p === null).map(([k]) => k)).toEqual([])
  })

  it("matches the reviewed list exactly (a route can't be added, removed or loosened unnoticed)", () => {
    expect(actual).toEqual(EXPECTED)
  })

  it("only names real permissions", () => {
    for (const p of Object.values(actual)) {
      for (const key of (p ?? "").match(/"([^"]+)"/g) ?? []) {
        const k = key.replace(/"/g, "")
        expect(k === "member" || isPermissionKey(k), k).toBe(true)
      }
    }
  })

  it("routes that serve both customers and garages check a permission for the garage side", () => {
    // These are shared with the customer portal so they can't use withGarage; each must resolve the garage AND check a key.
    const MIXED: Record<string, string[]> = {
      "app/api/bookings/route.ts": ["bookings.view", "bookings.manage"],
      "app/api/quotes/route.ts": ["enquiries.view", "enquiries.respond"],
      "app/api/messages/route.ts": ["messages.view", "messages.reply"],
      "app/api/job-requests/route.ts": ["enquiries.view"],
      "app/api/job-requests/[id]/respond/route.ts": ["enquiries.respond"],
      "app/api/garages/[id]/route.ts": ["profile.edit"],
      "app/api/upload/route.ts": ["profile.edit"],
    }
    for (const [file, keys] of Object.entries(MIXED)) {
      const src = read(path.join(ROOT, file))
      for (const k of keys) expect(src, `${file} should check ${k}`).toContain(`"${k}"`)
    }
  })
})

describe("admin routes", () => {
  const routes = walk(path.join(ROOT, "app/api/admin")).filter((f) => f.endsWith("route.ts"))

  it("every handler in /api/admin authorises through requireAdmin (a new admin route can't forget its guard)", () => {
    expect(routes.length).toBeGreaterThan(15)
    const problems = routes.flatMap((f) => {
      const src = read(f)
      const handlers = (src.match(/^export (?:async )?function (?:GET|POST|PUT|PATCH|DELETE)\b/gm) ?? []).length
      const guards = (src.match(/await requireAdmin\(/g) ?? []).length
      return handlers === 0 || guards < handlers ? [`${rel(f)}: ${handlers} handler(s), ${guards} requireAdmin call(s)`] : []
    })
    expect(problems).toEqual([])
  })

  it("only the routes that need a super admin ask for one (settings, inviting a garage owner, and nothing else by accident)", () => {
    const superOnly = routes.filter((f) => /requireAdmin\(\{\s*superOnly:\s*true\s*\}\)/.test(read(f))).map(rel).sort()
    expect(superOnly).toEqual(["app/api/admin/garages/invite/route.ts", "app/api/admin/settings/route.ts"])
  })
})

describe("page metadata", () => {
  it("every top-level page sets its own title (a client page does it from a sibling layout.tsx, as it can't export metadata)", () => {
    const dirs = fs.readdirSync(path.join(ROOT, "app"), { withFileTypes: true }).filter((d) => d.isDirectory())
    const missing = dirs.flatMap((d) => {
      const page = path.join(ROOT, "app", d.name, "page.tsx")
      if (!fs.existsSync(page)) return []
      const layout = path.join(ROOT, "app", d.name, "layout.tsx")
      const source = read(page) + (fs.existsSync(layout) ? read(layout) : "")
      return /export const metadata\b|export (?:async )?function generateMetadata\b/.test(source) ? [] : [`app/${d.name}`]
    })
    expect(missing).toEqual([])
  })
})

describe("tests that share the database", () => {
  it("each file has its own fixture prefix (cleanupPrefix deletes every row under it, so a shared one wipes another file's data mid-run)", () => {
    const testFiles = [...walk(path.join(ROOT, "app")), ...walk(path.join(ROOT, "src"))].filter((f) => /\.test\.ts$/.test(f))
    const prefixes = testFiles.flatMap((f) => {
      const m = read(f).match(/const PREFIX = "([^"]+)"/)
      return m ? [{ file: rel(f), prefix: m[1] }] : []
    })
    expect(prefixes.length).toBeGreaterThan(50)
    // Two files sharing a prefix, or one prefix starting with another (startsWith matches both), would clean each other up.
    const clashes = prefixes.flatMap((a) => prefixes.filter((b) => b.file > a.file && (a.prefix.startsWith(b.prefix) || b.prefix.startsWith(a.prefix))).map((b) => `${a.file} and ${b.file} (${a.prefix} / ${b.prefix})`))
    expect(clashes).toEqual([])
  })
})

describe("business websites share the root domain with the marketplace", () => {
  it("no cookie is ever scoped to the root domain (a Domain cookie would be sent to every business's website)", () => {
    // Business sites are sibling subdomains of the marketplace. Host-only cookies (no Domain attribute) stay on the exact host
    // that set them, so a session or CSRF cookie can never reach <label>.<root domain>.
    const offenders = [...sourceFiles, path.join(ROOT, "proxy.ts")]
      .filter((f) => /\bdomain\s*:|Domain=/.test(read(f).replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "")))
      .map(rel)
    expect(offenders).toEqual([])
  })

  it("the sign-in cookie settings don't override NextAuth's host-only defaults", () => {
    const auth = read(path.join(ROOT, "src/lib/auth.ts"))
    expect(auth).not.toMatch(/\bcookies\s*:\s*\{/)
    expect(auth).not.toMatch(/useSecureCookies\s*:\s*false/)
  })

  it("every route handler under /sites is explicitly dynamic (a handler that never reads the request is built static and cached forever)", () => {
    // Found in the production build: the sitemap was prerendered with no revalidation, so an offline site would keep serving it.
    const handlers = walk(path.join(ROOT, "app/sites")).filter((f) => /route\.ts$/.test(f))
    expect(handlers.length).toBeGreaterThanOrEqual(2)
    for (const f of handlers) expect(read(f), rel(f)).toMatch(/export const dynamic = "force-dynamic"/)
  })

  it("the page that renders a business website never reads the visitor's cookies or session", () => {
    // It is cached and shared between visitors; reading cookies would make it per-visitor (and slow) or leak one visitor's data.
    for (const f of ["app/sites/[label]/page.tsx", "src/lib/site/public.ts", "src/lib/site/public-cached.ts", "src/components/site/SiteRenderer.tsx"]) {
      const src = read(path.join(ROOT, f))
      expect(src, f).not.toMatch(/next\/headers|next-auth|getServerSession|cookies\(/)
    }
  })
})
