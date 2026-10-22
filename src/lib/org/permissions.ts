// The permission catalogue: every action a member of a garage business can be allowed to do. Isomorphic on purpose (no
// prisma, no server imports) so the browser can use it to hide navigation and role-editor options. The server never
// trusts the browser: every route checks the same keys through withGarage (src/lib/garage-auth.ts).
//
// Two scopes:
//   location      applies to the locations a role is assigned at (one location, or all of them)
//   organisation  applies to the whole business, so it only counts when the role is held at ALL locations

export type PermissionScope = "location" | "organisation"

export interface PermissionDef {
  label: string
  description: string
  group: string
  scope: PermissionScope
  /** Powerful enough that it should be given deliberately (shown with a warning in the role editor). */
  sensitive?: boolean
}

const loc = (group: string, label: string, description: string, sensitive = false): PermissionDef => ({ group, label, description, scope: "location", sensitive })
const org = (group: string, label: string, description: string, sensitive = true): PermissionDef => ({ group, label, description, scope: "organisation", sensitive })

export const PERMISSIONS = {
  "bookings.view": loc("Bookings", "View all bookings", "See every booking at the location, with customer and vehicle details."),
  "bookings.manage": loc("Bookings", "Manage bookings", "Create, confirm, move, cancel and complete bookings."),
  "bookings.export": loc("Bookings", "Export bookings", "Download bookings as a spreadsheet.", true),
  "bookings.viewOwn": loc("Bookings", "View own jobs", "See only the bookings assigned to them as a technician."),
  "bookings.updateOwn": loc("Bookings", "Update own jobs", "Record outcomes and notes on the bookings assigned to them."),

  "diary.view": loc("Diary", "View the diary", "See the whole diary, including everyone's time off."),
  "diary.manage": loc("Diary", "Manage the diary", "Block out time and move appointments around."),
  "diary.viewOwn": loc("Diary", "View own diary", "See only their own appointments."),
  "technicians.manage": loc("Diary", "Manage technicians", "Add, edit and retire the technicians shown in the diary."),

  "customers.view": loc("Customers", "View customers", "See customer contact details and history."),
  "customers.manage": loc("Customers", "Manage customers", "Add private notes and merge duplicate customers."),
  "customers.export": loc("Customers", "Export customers", "Download the customer list.", true),

  "messages.view": loc("Messages", "Read messages", "Read customer message threads."),
  "messages.reply": loc("Messages", "Reply to messages", "Reply to customers on the garage's behalf."),

  "enquiries.view": loc("Enquiries", "View enquiries", "See quote requests and job enquiries."),
  "enquiries.respond": loc("Enquiries", "Respond to enquiries", "Send quotes. Answering a lead can use lead credits.", true),

  "reviews.view": loc("Reviews", "View reviews", "Read customer reviews."),
  "reviews.reply": loc("Reviews", "Reply to reviews", "Reply publicly to reviews and dispute unfair ones."),

  "pricing.view": loc("Pricing", "View prices", "See the service price list."),
  "pricing.edit": loc("Pricing", "Edit prices", "Change prices, durations and automatic quoting.", true),

  "invoices.issue": loc("Money", "Issue invoices", "Generate and email invoices for completed jobs.", true),
  "insights.view": loc("Reporting", "View insights", "See performance reports and revenue figures.", true),

  "profile.edit": loc("Location", "Edit the location's profile", "Change the description, photos, opening hours, services and contact details."),
  "settings.edit": loc("Location", "Edit settings", "Online booking, notifications and the booking widget."),
  "documents.manage": loc("Location", "Manage verification documents", "Upload and remove insurance and certificates.", true),
  "staff.manage": loc("Location", "Manage staff", "Invite people to this location and change their roles, within their own permissions.", true),

  "billing.view": org("Business", "View billing", "See the plan, lead credits and payment status.", false),
  "billing.manage": org("Business", "Manage billing", "Change plan, buy credits, connect payouts and promote the business."),
  "roles.manage": org("Business", "Manage roles", "Create and edit roles and switch preset roles on."),
  "locations.manage": org("Business", "Manage locations", "Add, edit and archive locations."),
  "website.edit": org("Business", "Edit the website", "Edit and publish the business's website.", false),
  "organisation.edit": org("Business", "Edit business details", "Change the business name, VAT number and logo."),
  "audit.view": org("Business", "View the activity log", "See who changed what.", false),
} as const satisfies Record<string, PermissionDef>

export type PermissionKey = keyof typeof PERMISSIONS

export const PERMISSION_KEYS = Object.keys(PERMISSIONS) as PermissionKey[]
export const LOCATION_PERMISSION_KEYS = PERMISSION_KEYS.filter((k) => PERMISSIONS[k].scope === "location")
export const ORGANISATION_PERMISSION_KEYS = PERMISSION_KEYS.filter((k) => PERMISSIONS[k].scope === "organisation")

export const isPermissionKey = (k: unknown): k is PermissionKey => typeof k === "string" && Object.prototype.hasOwnProperty.call(PERMISSIONS, k)

export const permissionScope = (k: PermissionKey): PermissionScope => PERMISSIONS[k].scope

/** Groups in the order the role editor shows them. */
export const PERMISSION_GROUPS = ["Bookings", "Diary", "Customers", "Messages", "Enquiries", "Reviews", "Pricing", "Money", "Reporting", "Location", "Business"] as const

/**
 * Holding the key on the left always includes the keys on the right (you can't manage what you can't see). Saved role
 * permissions are expanded with this, so checks only ever need to look for the one key an action requires.
 */
export const IMPLIES: Partial<Record<PermissionKey, readonly PermissionKey[]>> = {
  "bookings.manage": ["bookings.view", "bookings.updateOwn"],
  "bookings.export": ["bookings.view"],
  "bookings.view": ["bookings.viewOwn"],
  "bookings.updateOwn": ["bookings.viewOwn"],
  "diary.manage": ["diary.view"],
  "diary.view": ["diary.viewOwn"],
  "technicians.manage": ["diary.view"],
  "customers.manage": ["customers.view"],
  "customers.export": ["customers.view"],
  "messages.reply": ["messages.view"],
  "enquiries.respond": ["enquiries.view"],
  "reviews.reply": ["reviews.view"],
  "pricing.edit": ["pricing.view"],
  "invoices.issue": ["bookings.view"],
  "billing.manage": ["billing.view"],
}

/** Keys a held permission brings with it, transitively, including itself. */
export function expandPermission(key: PermissionKey): PermissionKey[] {
  const seen = new Set<PermissionKey>()
  const walk = (k: PermissionKey) => {
    if (seen.has(k)) return
    seen.add(k)
    for (const next of IMPLIES[k] ?? []) walk(next)
  }
  walk(key)
  return [...seen]
}

/** Drops unknown keys, adds implied ones, removes duplicates and sorts by catalogue order. What gets stored on a Role. */
export function normalisePermissions(keys: Iterable<unknown>): PermissionKey[] {
  const out = new Set<PermissionKey>()
  for (const k of keys) if (isPermissionKey(k)) for (const e of expandPermission(k)) out.add(e)
  return PERMISSION_KEYS.filter((k) => out.has(k))
}

/** Reads Role.permissions (a JSON string). Tolerant: bad JSON or unknown keys give an empty or smaller list, never an error. */
export function permissionsFromJson(json: string | null | undefined): PermissionKey[] {
  try {
    const parsed: unknown = JSON.parse(json ?? "[]")
    return Array.isArray(parsed) ? normalisePermissions(parsed) : []
  } catch {
    return []
  }
}

export const permissionsToJson = (keys: Iterable<unknown>): string => JSON.stringify(normalisePermissions(keys))
