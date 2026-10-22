import { LOCATION_PERMISSION_KEYS, PERMISSION_KEYS, normalisePermissions, type PermissionKey } from "@/lib/org/permissions"

// The roles every business starts with, and the library of preset roles a garage admin can switch on. Pure data: no
// database. A preset is COPIED into the business as a Role row when it is enabled (so editing it never changes
// another business), and `version` lets the Roles page say "an update is available" without ever overwriting edits.

export interface RoleTemplate {
  /** Stable key, stored as Role.presetKey. */
  key: string
  name: string
  description: string
  /** Bump when the permissions change, so enabled copies can offer the update. */
  version: number
  permissions: readonly PermissionKey[]
}

const t = (key: string, name: string, description: string, permissions: readonly PermissionKey[], version = 1): RoleTemplate => ({
  key,
  name,
  description,
  version,
  permissions: normalisePermissions(permissions),
})

// ---- Created with every business (Role.isSystem) -----------------------------------------------------------------

export const OWNER_ROLE_KEY = "owner"

export const SYSTEM_ROLES: readonly RoleTemplate[] = [
  t(OWNER_ROLE_KEY, "Owner", "Full control of the business, including billing, roles and every location. Can't be edited or removed.", PERMISSION_KEYS),
  t("manager", "Manager", "Runs a location day to day: bookings, diary, customers, prices, staff and the location's profile.", LOCATION_PERMISSION_KEYS),
  t("staff", "Staff", "Takes bookings and talks to customers. Can't change prices, export data or manage people.", [
    "bookings.manage",
    "diary.view",
    "customers.view",
    "messages.reply",
    "enquiries.view",
    "reviews.view",
    "pricing.view",
  ]),
]

// ---- Preset library: all start DISABLED; a garage admin enables, edits or clones them ----------------------------

export const PRESET_ROLES: readonly RoleTemplate[] = [
  t("general_manager", "General manager", "Looks after every location: everything a manager can do, plus locations, the website, business details, billing visibility and the activity log.", [
    ...LOCATION_PERMISSION_KEYS,
    "locations.manage",
    "website.edit",
    "organisation.edit",
    "billing.view",
    "audit.view",
  ]),
  t("service_advisor", "Service advisor", "Front of house for the workshop: bookings, diary, customers, messages, quotes and invoices.", [
    "bookings.manage",
    "diary.manage",
    "customers.manage",
    "messages.reply",
    "enquiries.respond",
    "invoices.issue",
    "pricing.view",
    "reviews.view",
  ]),
  t("receptionist", "Receptionist", "Answers the phone and the diary: books customers in and replies to messages.", ["bookings.manage", "diary.manage", "customers.view", "messages.reply"]),
  t("technician", "Technician", "A mechanic with a login: sees and updates only the jobs assigned to them.", ["bookings.viewOwn", "bookings.updateOwn", "diary.viewOwn"]),
  t("mot_tester", "MOT tester", "Sees the location's bookings and records results on the jobs assigned to them.", ["bookings.view", "bookings.updateOwn", "diary.view"]),
  t("workshop_controller", "Workshop controller", "Plans the workshop: runs the diary and technicians and the day's bookings.", [
    "bookings.manage",
    "diary.manage",
    "technicians.manage",
    "customers.view",
    "messages.view",
  ]),
  t("parts_pricing", "Parts and pricing", "Maintains the price list and can see the bookings and enquiries it affects.", ["pricing.edit", "bookings.view", "enquiries.view"]),
  t("accounts", "Accounts", "Finance: invoices, exports, revenue reports, billing visibility and the activity log. Can't change bookings.", [
    "bookings.view",
    "bookings.export",
    "customers.view",
    "customers.export",
    "invoices.issue",
    "insights.view",
    "billing.view",
    "audit.view",
  ]),
  t("customer_support", "Customer support", "Handles customers after the booking: messages, notes, reviews and enquiries.", [
    "messages.reply",
    "customers.manage",
    "bookings.view",
    "enquiries.view",
    "reviews.reply",
  ]),
  t("marketing", "Marketing and website", "Looks after how the business appears online: the website, the profile, reviews and reports.", [
    "website.edit",
    "profile.edit",
    "reviews.reply",
    "insights.view",
    "pricing.view",
  ]),
  t("people_manager", "People manager", "Invites and manages staff at their locations, and can see the diary they staff.", ["staff.manage", "bookings.view", "diary.view"]),
  t("auditor", "Auditor (read-only)", "Can look at everything but change nothing.", [
    "bookings.view",
    "diary.view",
    "customers.view",
    "messages.view",
    "enquiries.view",
    "reviews.view",
    "pricing.view",
    "insights.view",
    "billing.view",
    "audit.view",
  ]),
  t("trainee", "Trainee", "Can see the bookings and diary and nothing else.", ["bookings.view", "diary.view"]),
]

export const PRESET_ROLE_KEYS = PRESET_ROLES.map((r) => r.key)

const ALL_TEMPLATES = [...SYSTEM_ROLES, ...PRESET_ROLES]

export const findTemplate = (key: string | null | undefined): RoleTemplate | undefined => ALL_TEMPLATES.find((r) => r.key === key)
export const findPreset = (key: string | null | undefined): RoleTemplate | undefined => PRESET_ROLES.find((r) => r.key === key)
export const isSystemRoleKey = (key: string | null | undefined): boolean => SYSTEM_ROLES.some((r) => r.key === key)
