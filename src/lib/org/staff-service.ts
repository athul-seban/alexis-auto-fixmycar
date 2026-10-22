import bcrypt from "bcryptjs"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { audit } from "@/lib/audit"
import { sendMail } from "@/lib/mail"
import { absoluteUrl } from "@/lib/portal/links"
import { passwordProblem } from "@/lib/password-policy"
import { escapeHtml as e } from "@/lib/utils"
import type { GarageContext } from "@/lib/garage-auth"
import { ALL_LOCATIONS } from "@/lib/org/access"
import { INVITE_VALID_DAYS, hashInviteToken, newInviteToken, parseInviteAssignments, type InviteAssignment } from "@/lib/org/invites"
import { OrgError } from "@/lib/org/org-error"
import { OWNER_ROLE_KEY } from "@/lib/org/presets"
import { actorPower, assignmentProblem, legacyPower, selfChangeProblem, type ActorPower } from "@/lib/org/rules"
import { isAdmin } from "@/lib/roles"

// The people of a garage business: invite them, let them join, change or remove their access. Every rule that keeps this
// safe lives here or in rules.ts: you can only hand out what you hold, nobody edits themselves, the last Owner can't be
// removed, and an invitation can't be used twice. Services take the caller's GarageContext and throw OrgError.

type Ctx = Pick<GarageContext, "organisation" | "assignments" | "roles" | "legacy" | "actor" | "locations">

const power = (ctx: Ctx): ActorPower => (ctx.legacy ? legacyPower() : actorPower(ctx.assignments, ctx.roles))

function business(ctx: Ctx) {
  if (!ctx.organisation) throw new OrgError("CONFLICT", "This garage hasn't been set up as a business yet. Ask support to run the upgrade.")
  return ctx.organisation
}

/** Can the caller manage staff anywhere at all (here or business-wide)? */
function managesStaffSomewhere(p: ActorPower, ctx: Ctx): boolean {
  return p.ceiling.has("staff.manage") || ctx.locations.some((l) => p.at(l.id).has("staff.manage"))
}

const roleLabel = (r: { name: string }) => r.name

// ---- input ---------------------------------------------------------------------------------------------------------

const assignmentInput = z.object({
  roleId: z.string().min(1).max(64),
  /** The locations, or null for all locations (including ones added later). */
  locationIds: z.array(z.string().min(1).max(64)).min(1).max(100).nullable(),
})

export const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address").max(200),
  name: z.string().trim().max(120).optional(),
  assignments: z.array(assignmentInput).min(1, "Choose a role").max(10),
})
export const addAssignmentsSchema = z.object({ assignments: z.array(assignmentInput).min(1).max(10) })
export const statusSchema = z.object({ status: z.enum(["ACTIVE", "SUSPENDED"]) })

export type AssignmentInput = z.infer<typeof assignmentInput>

// ---- shared lookups ------------------------------------------------------------------------------------------------

async function orgLocations(orgId: string) {
  return prisma.garage.findMany({ where: { organisationId: orgId }, select: { id: true, name: true, status: true }, orderBy: { createdAt: "asc" } })
}

/**
 * Turns requested (role, locations) pairs into concrete (role, scope) grants, checking that the roles are this business's,
 * the locations are too, and that the caller is allowed to hand each one out. Throws with the first problem.
 */
async function resolveGrants(ctx: Ctx, orgId: string, items: readonly AssignmentInput[]) {
  const p = power(ctx)
  const [roles, locations] = await Promise.all([prisma.role.findMany({ where: { organisationId: orgId } }), orgLocations(orgId)])
  const roleById = new Map(roles.map((r) => [r.id, r]))
  const locationIds = new Set(locations.map((l) => l.id))

  const grants: { role: (typeof roles)[number]; scopeKey: string; garageId: string | null }[] = []
  for (const item of items) {
    const role = roleById.get(item.roleId)
    if (!role) throw new OrgError("NOT_FOUND", "That role doesn't exist.")
    const scopes = item.locationIds === null ? [ALL_LOCATIONS] : [...new Set(item.locationIds)]
    for (const scopeKey of scopes) {
      if (scopeKey !== ALL_LOCATIONS && !locationIds.has(scopeKey)) throw new OrgError("INVALID_INPUT", "One of those locations isn't part of this business.")
      const problem = assignmentProblem(p, role, scopeKey)
      if (problem) throw new OrgError("FORBIDDEN", problem)
      grants.push({ role, scopeKey, garageId: scopeKey === ALL_LOCATIONS ? null : scopeKey })
    }
  }
  return grants
}

/** Active Owners of the business, optionally ignoring one membership (the one about to lose their ownership). */
async function activeOwnerCount(orgId: string, exceptMembershipId?: string): Promise<number> {
  return prisma.membership.count({
    where: {
      organisationId: orgId,
      status: "ACTIVE",
      ...(exceptMembershipId ? { id: { not: exceptMembershipId } } : {}),
      assignments: { some: { scopeKey: ALL_LOCATIONS, role: { presetKey: OWNER_ROLE_KEY, isSystem: true } } },
    },
  })
}

async function loadMember(orgId: string, membershipId: string) {
  const m = await prisma.membership.findFirst({
    where: { id: membershipId, organisationId: orgId }, // this business only: another's member id is "not found"
    include: { user: { select: { id: true, name: true, email: true, role: true } }, assignments: { include: { role: true } } },
  })
  if (!m) throw new OrgError("NOT_FOUND", "That person isn't on your team.")
  return m
}

type LoadedMember = Awaited<ReturnType<typeof loadMember>>

/** The caller may touch this member only if they could remove every role the person holds (nobody outranks them). */
function assertCanManage(ctx: Ctx, member: LoadedMember, actorUserId: string) {
  const self = selfChangeProblem(actorUserId, member.user.id)
  if (self) throw new OrgError("FORBIDDEN", self)
  const p = power(ctx)
  for (const a of member.assignments) {
    const problem = assignmentProblem(p, a.role, a.scopeKey, { removing: true })
    if (problem) throw new OrgError("FORBIDDEN", `You can't change ${member.user.name ?? member.user.email}'s access: ${problem}`)
  }
  if (member.assignments.length === 0 && !managesStaffSomewhere(p, ctx)) throw new OrgError("FORBIDDEN", "You don't have permission to manage staff.")
}

const isOwnerMember = (m: { assignments: { scopeKey: string; role: { isSystem: boolean; presetKey: string | null } }[] }) =>
  m.assignments.some((a) => a.scopeKey === ALL_LOCATIONS && a.role.isSystem && a.role.presetKey === OWNER_ROLE_KEY)

// ---- reading -------------------------------------------------------------------------------------------------------

export interface StaffMemberView {
  membershipId: string
  userId: string
  name: string | null
  email: string
  phone: string | null
  status: string
  isSelf: boolean
  isOwner: boolean
  /** Still has to set a password from their invitation. */
  invitePending: boolean
  assignments: { id: string; roleId: string; roleName: string; scopeKey: string; locationName: string | null }[]
  technicians: { id: string; name: string; garageId: string }[]
  /** The caller may suspend, remove or change this person. */
  canManage: boolean
}

export interface PendingInviteView {
  id: string
  email: string
  createdAt: string
  expiresAt: string
  assignments: { roleName: string; where: string }[]
  canRevoke: boolean
}

export async function listStaff(ctx: Ctx, actorUserId: string): Promise<{ members: StaffMemberView[]; invites: PendingInviteView[] }> {
  const org = business(ctx)
  const p = power(ctx)
  const [memberships, locations, technicians, invites, roles] = await Promise.all([
    prisma.membership.findMany({
      where: { organisationId: org.id },
      include: { user: { select: { id: true, name: true, email: true, phone: true, password: true } }, assignments: { include: { role: true } } },
      orderBy: { createdAt: "asc" },
    }),
    orgLocations(org.id),
    prisma.technician.findMany({ where: { garage: { organisationId: org.id }, userId: { not: null } }, select: { id: true, name: true, garageId: true, userId: true } }),
    prisma.staffInvite.findMany({ where: { organisationId: org.id, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: "desc" } }),
    prisma.role.findMany({ where: { organisationId: org.id } }),
  ])
  const locationName = new Map(locations.map((l) => [l.id, l.name]))
  const roleById = new Map(roles.map((r) => [r.id, r]))
  const anywhere = managesStaffSomewhere(p, ctx)

  const members: StaffMemberView[] = []
  for (const m of memberships) {
    const manageable = m.assignments.every((a) => assignmentProblem(p, a.role, a.scopeKey, { removing: true }) === null)
    const isSelf = m.user.id === actorUserId
    // Visible if it's you, or you could manage at least one of their roles (people at locations you don't run stay private).
    const touchable = m.assignments.some((a) => assignmentProblem(p, a.role, a.scopeKey, { removing: true }) === null)
    if (!isSelf && !touchable && !(m.assignments.length === 0 && anywhere)) continue
    members.push({
      membershipId: m.id,
      userId: m.user.id,
      name: m.user.name,
      email: m.user.email,
      phone: m.user.phone,
      status: m.status,
      isSelf,
      isOwner: isOwnerMember(m),
      invitePending: !m.user.password,
      assignments: m.assignments.map((a) => ({
        id: a.id,
        roleId: a.roleId,
        roleName: roleLabel(a.role),
        scopeKey: a.scopeKey,
        locationName: a.scopeKey === ALL_LOCATIONS ? null : (locationName.get(a.scopeKey) ?? "Removed location"),
      })),
      technicians: technicians.filter((t) => t.userId === m.user.id).map((t) => ({ id: t.id, name: t.name, garageId: t.garageId })),
      canManage: !isSelf && manageable && (m.assignments.length > 0 || anywhere),
    })
  }

  const pending: PendingInviteView[] = []
  for (const inv of invites) {
    const items = parseInviteAssignments(inv.assignments)
    const canRevoke = items.every((i) => {
      const role = roleById.get(i.roleId)
      if (!role) return true // its role was deleted: anyone who manages staff may clear it
      return (i.garageIds ?? [ALL_LOCATIONS]).every((s) => assignmentProblem(p, role, s, { removing: true }) === null)
    })
    if (!canRevoke) continue // invitations for roles above yours aren't yours to see
    pending.push({
      id: inv.id,
      email: inv.email,
      createdAt: inv.createdAt.toISOString(),
      expiresAt: inv.expiresAt.toISOString(),
      assignments: items.map((i) => ({
        roleName: roleById.get(i.roleId)?.name ?? "(removed role)",
        where: i.garageIds === null ? "All locations" : i.garageIds.map((id) => locationName.get(id) ?? "Removed location").join(", "),
      })),
      canRevoke: true,
    })
  }
  return { members, invites: pending }
}

// ---- inviting ------------------------------------------------------------------------------------------------------

export interface InviteResult {
  inviteId: string
  /** False when email isn't configured (local dev) or the send failed; the invite still exists and can be resent. */
  emailSent: boolean
  /** Only outside production, so tests and local development can follow the link. Never returned in production. */
  devUrl?: string
}

async function sendInviteEmail(opts: { to: string; token: string; businessName: string; inviterName: string | null; roleNames: string[] }): Promise<{ sent: boolean; url: string }> {
  const url = `${process.env.NEXTAUTH_URL ?? absoluteUrl("")}/join/${opts.token}`
  const mail = await sendMail({
    to: opts.to,
    subject: `Join ${opts.businessName} on Quote My Garage`,
    html: `
      <p>${e(opts.inviterName ?? "Someone")} has invited you to join <strong>${e(opts.businessName)}</strong> on Quote My Garage as ${e(opts.roleNames.join(", "))}.</p>
      <p><a href="${url}">Accept the invitation</a></p>
      <p>This link works once and expires in ${INVITE_VALID_DAYS} days. If you weren't expecting it, you can ignore this email.</p>
    `,
  })
  return { sent: mail.success && !mail.skipped, url }
}

export async function inviteStaff(ctx: Ctx, actorUserId: string, input: z.infer<typeof inviteSchema>): Promise<InviteResult> {
  const org = business(ctx)
  const grants = await resolveGrants(ctx, org.id, input.assignments)

  // Who they are: a platform administrator can never join a garage team, and nobody is invited twice.
  const existing = await prisma.user.findUnique({ where: { email: input.email }, select: { id: true, role: true, suspendedAt: true } })
  if (existing && isAdmin(existing.role)) throw new OrgError("FORBIDDEN", "That email belongs to a platform administrator and can't join a garage team.")
  if (existing?.suspendedAt) throw new OrgError("FORBIDDEN", "That account has been suspended and can't be invited.")
  if (existing && (await prisma.membership.findUnique({ where: { userId_organisationId: { userId: existing.id, organisationId: org.id } } }))) {
    throw new OrgError("CONFLICT", "That person is already on your team.")
  }

  const token = newInviteToken()
  const stored: InviteAssignment[] = input.assignments.map((a) => ({ roleId: a.roleId, garageIds: a.locationIds === null ? null : [...new Set(a.locationIds)] }))

  // Only one live invitation per email per business: a new one replaces the old.
  const invite = await prisma.$transaction(async (tx) => {
    await tx.staffInvite.updateMany({ where: { organisationId: org.id, email: input.email, acceptedAt: null, revokedAt: null }, data: { revokedAt: new Date() } })
    return tx.staffInvite.create({
      data: { organisationId: org.id, email: input.email, assignments: JSON.stringify(stored), tokenHash: hashInviteToken(token), invitedById: actorUserId, expiresAt: new Date(Date.now() + INVITE_VALID_DAYS * 24 * 3600 * 1000) },
    })
  })

  const inviter = await prisma.user.findUnique({ where: { id: actorUserId }, select: { name: true } })
  const mail = await sendInviteEmail({ to: input.email, token, businessName: org.name, inviterName: inviter?.name ?? null, roleNames: [...new Set(grants.map((g) => g.role.name))] })
  await audit({ user: ctx.actor }, { action: "STAFF_INVITED", targetType: "MEMBER", targetId: invite.id, organisationId: org.id, detail: `${input.email}: ${[...new Set(grants.map((g) => g.role.name))].join(", ")}${mail.sent ? "" : " · email not sent"}` })
  return { inviteId: invite.id, emailSent: mail.sent, ...(process.env.NODE_ENV !== "production" ? { devUrl: mail.url } : {}) }
}

async function loadInvite(orgId: string, inviteId: string) {
  const inv = await prisma.staffInvite.findFirst({ where: { id: inviteId, organisationId: orgId } })
  if (!inv) throw new OrgError("NOT_FOUND", "Invitation not found.")
  return inv
}

async function assertCanClearInvite(ctx: Ctx, orgId: string, inv: { assignments: string }) {
  const p = power(ctx)
  const roles = await prisma.role.findMany({ where: { organisationId: orgId } })
  const byId = new Map(roles.map((r) => [r.id, r]))
  for (const i of parseInviteAssignments(inv.assignments)) {
    const role = byId.get(i.roleId)
    if (!role) continue
    for (const scope of i.garageIds ?? [ALL_LOCATIONS]) {
      const problem = assignmentProblem(p, role, scope, { removing: true })
      if (problem) throw new OrgError("FORBIDDEN", problem)
    }
  }
}

export async function revokeInvite(ctx: Ctx, inviteId: string): Promise<void> {
  const org = business(ctx)
  const inv = await loadInvite(org.id, inviteId)
  if (inv.acceptedAt || inv.revokedAt) throw new OrgError("CONFLICT", "That invitation has already been used or cancelled.")
  await assertCanClearInvite(ctx, org.id, inv)
  await prisma.staffInvite.update({ where: { id: inv.id }, data: { revokedAt: new Date() } })
  await audit({ user: ctx.actor }, { action: "STAFF_INVITE_REVOKED", targetType: "MEMBER", targetId: inv.id, organisationId: org.id, detail: inv.email })
}

/** A fresh link (and a fresh expiry) for a pending invitation. The old link stops working. */
export async function resendInvite(ctx: Ctx, actorUserId: string, inviteId: string): Promise<InviteResult> {
  const org = business(ctx)
  const inv = await loadInvite(org.id, inviteId)
  if (inv.acceptedAt || inv.revokedAt) throw new OrgError("CONFLICT", "That invitation has already been used or cancelled.")
  await assertCanClearInvite(ctx, org.id, inv)

  const token = newInviteToken()
  await prisma.staffInvite.update({ where: { id: inv.id }, data: { tokenHash: hashInviteToken(token), expiresAt: new Date(Date.now() + INVITE_VALID_DAYS * 24 * 3600 * 1000) } })
  const [roles, inviter] = await Promise.all([prisma.role.findMany({ where: { organisationId: org.id } }), prisma.user.findUnique({ where: { id: actorUserId }, select: { name: true } })])
  const names = parseInviteAssignments(inv.assignments).map((i) => roles.find((r) => r.id === i.roleId)?.name).filter((n): n is string => !!n)
  const mail = await sendInviteEmail({ to: inv.email, token, businessName: org.name, inviterName: inviter?.name ?? null, roleNames: [...new Set(names)] })
  await audit({ user: ctx.actor }, { action: "STAFF_INVITED", targetType: "MEMBER", targetId: inv.id, organisationId: org.id, detail: `${inv.email}: resent${mail.sent ? "" : " · email not sent"}` })
  return { inviteId: inv.id, emailSent: mail.sent, ...(process.env.NODE_ENV !== "production" ? { devUrl: mail.url } : {}) }
}

// ---- accepting -----------------------------------------------------------------------------------------------------

export type InviteState = "ok" | "expired" | "used" | "revoked" | "invalid"

export interface InvitePreview {
  state: InviteState
  businessName?: string
  email?: string
  inviterName?: string | null
  roleNames?: string[]
  /**
   * none      no account yet: they will choose a name and password
   * existing  a garage-staff account: they must be signed in as it
   * customer  a customer account: signing in as it and confirming turns it into a staff account
   * blocked   an administrator or suspended account: can't join
   */
  account?: "none" | "existing" | "customer" | "blocked"
}

/** Looks an invitation up by the token in the emailed link. Reveals nothing unless the token is valid. */
export async function previewInvite(token: string): Promise<InvitePreview> {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return { state: "invalid" }
  const inv = await prisma.staffInvite.findUnique({ where: { tokenHash: hashInviteToken(token) }, include: { organisation: { select: { name: true, suspendedAt: true } } } })
  if (!inv || inv.organisation.suspendedAt) return { state: "invalid" }
  if (inv.acceptedAt) return { state: "used" }
  if (inv.revokedAt) return { state: "revoked" }
  if (inv.expiresAt < new Date()) return { state: "expired" }

  const [user, roles, inviter] = await Promise.all([
    prisma.user.findUnique({ where: { email: inv.email }, select: { role: true, suspendedAt: true } }),
    prisma.role.findMany({ where: { organisationId: inv.organisationId } }),
    inv.invitedById ? prisma.user.findUnique({ where: { id: inv.invitedById }, select: { name: true } }) : Promise.resolve(null),
  ])
  const account: InvitePreview["account"] = !user ? "none" : isAdmin(user.role) || user.suspendedAt ? "blocked" : user.role === "OWNER" ? "customer" : "existing"
  const roleNames = parseInviteAssignments(inv.assignments).map((i) => roles.find((r) => r.id === i.roleId)?.name).filter((n): n is string => !!n)
  return { state: "ok", businessName: inv.organisation.name, email: inv.email, inviterName: inviter?.name ?? null, roleNames: [...new Set(roleNames)], account }
}

export const acceptSchema = z.object({
  name: z.string().trim().min(2, "Enter your name").max(120).optional(),
  password: z.string().max(100).optional(),
  /** A customer account is being turned into a staff account: they must say they understand. */
  confirmConvert: z.boolean().optional(),
})

export interface AcceptResult {
  userId: string
  email: string
  /** A customer account was converted: every session is ended, so they sign in again. */
  converted: boolean
  organisationId: string
}

export async function acceptInvite(token: string, input: z.infer<typeof acceptSchema>, signedInUserId: string | null): Promise<AcceptResult> {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) throw new OrgError("NOT_FOUND", "This invitation link isn't valid.")
  const inv = await prisma.staffInvite.findUnique({ where: { tokenHash: hashInviteToken(token) }, include: { organisation: true } })
  if (!inv || inv.organisation.suspendedAt) throw new OrgError("NOT_FOUND", "This invitation link isn't valid.")
  if (inv.acceptedAt) throw new OrgError("CONFLICT", "This invitation has already been used.")
  if (inv.revokedAt) throw new OrgError("CONFLICT", "This invitation was cancelled.")
  if (inv.expiresAt < new Date()) throw new OrgError("CONFLICT", "This invitation has expired. Ask for a new one.")

  // An invitation from someone who has since left the team is void.
  if (inv.invitedById) {
    const inviterActive = await prisma.membership.findFirst({ where: { userId: inv.invitedById, organisationId: inv.organisationId, status: "ACTIVE" }, select: { id: true } })
    if (!inviterActive) throw new OrgError("CONFLICT", "This invitation is no longer valid. Ask for a new one.")
  }

  // The roles and locations may have changed since it was sent: only what still exists and is switched on is granted.
  const [roles, locations] = await Promise.all([prisma.role.findMany({ where: { organisationId: inv.organisationId, isEnabled: true } }), orgLocations(inv.organisationId)])
  const roleIds = new Set(roles.map((r) => r.id))
  const locationIds = new Set(locations.map((l) => l.id))
  const grants: { roleId: string; scopeKey: string; garageId: string | null }[] = []
  for (const i of parseInviteAssignments(inv.assignments)) {
    if (!roleIds.has(i.roleId)) continue
    if (i.garageIds === null) grants.push({ roleId: i.roleId, scopeKey: ALL_LOCATIONS, garageId: null })
    else for (const garageId of i.garageIds) if (locationIds.has(garageId)) grants.push({ roleId: i.roleId, scopeKey: garageId, garageId })
  }
  if (grants.length === 0) throw new OrgError("CONFLICT", "The roles in this invitation are no longer available. Ask for a new one.")

  const existing = await prisma.user.findUnique({ where: { email: inv.email } })
  let converted = false
  let passwordHash: string | null = null
  let name: string | null = null

  if (!existing) {
    name = input.name ?? null
    if (!name) throw new OrgError("INVALID_INPUT", "Enter your name.")
    const problem = passwordProblem(input.password ?? "", { email: inv.email, name })
    if (problem) throw new OrgError("INVALID_INPUT", problem)
    passwordHash = await bcrypt.hash(input.password!, 12)
  } else {
    if (isAdmin(existing.role) || existing.suspendedAt) throw new OrgError("FORBIDDEN", "This account can't join a garage team.")
    // The emailed link proves the inbox; it does not prove who is at the keyboard. An existing account must be signed in.
    if (signedInUserId !== existing.id) throw new OrgError("SIGN_IN_REQUIRED", `Sign in as ${inv.email} to accept this invitation.`)
    if (existing.role === "OWNER") {
      if (!input.confirmConvert) {
        throw new OrgError("CONFIRM_CONVERT", "This is a customer account. Accepting turns it into a garage staff account: your bookings and vehicles are kept, but you'll use the garage portal instead of the customer pages.")
      }
      converted = true
    }
  }

  const result = await prisma.$transaction(async (tx) => {
    // Claim it: only one request can flip acceptedAt, so a double click or a race can't create two memberships.
    const claimed = await tx.staffInvite.updateMany({ where: { id: inv.id, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } }, data: { acceptedAt: new Date() } })
    if (claimed.count === 0) throw new OrgError("CONFLICT", "This invitation has already been used.")

    const user = existing
      ? converted
        ? await tx.user.update({ where: { id: existing.id }, data: { role: "GARAGE", sessionVersion: { increment: 1 } } })
        : existing
      : await tx.user.create({ data: { email: inv.email, name, password: passwordHash, role: "GARAGE", emailVerified: new Date() } })

    const membership = await tx.membership.upsert({
      where: { userId_organisationId: { userId: user.id, organisationId: inv.organisationId } },
      create: { userId: user.id, organisationId: inv.organisationId, status: "ACTIVE", invitedById: inv.invitedById },
      update: { status: "ACTIVE" },
    })
    for (const g of grants) {
      await tx.roleAssignment.upsert({
        where: { membershipId_roleId_scopeKey: { membershipId: membership.id, roleId: g.roleId, scopeKey: g.scopeKey } },
        create: { membershipId: membership.id, roleId: g.roleId, garageId: g.garageId, scopeKey: g.scopeKey },
        update: {},
      })
    }
    return { user, membership }
  })

  await audit({ user: { id: result.user.id, email: result.user.email } }, { action: "STAFF_JOINED", targetType: "MEMBER", targetId: result.membership.id, organisationId: inv.organisationId, detail: `${result.user.email}${converted ? " (customer account converted)" : ""}` })
  return { userId: result.user.id, email: result.user.email, converted, organisationId: inv.organisationId }
}

// ---- changing access -----------------------------------------------------------------------------------------------

export async function addAssignments(ctx: Ctx, actorUserId: string, membershipId: string, items: readonly AssignmentInput[]): Promise<void> {
  const org = business(ctx)
  const member = await loadMember(org.id, membershipId)
  const self = selfChangeProblem(actorUserId, member.user.id)
  if (self) throw new OrgError("FORBIDDEN", self)
  if (member.user.role !== "GARAGE") throw new OrgError("CONFLICT", "That person doesn't have a garage account.")

  const grants = await resolveGrants(ctx, org.id, items)
  let added = 0
  for (const g of grants) {
    const exists = member.assignments.some((a) => a.roleId === g.role.id && a.scopeKey === g.scopeKey)
    if (exists) continue
    await prisma.roleAssignment.create({ data: { membershipId: member.id, roleId: g.role.id, garageId: g.garageId, scopeKey: g.scopeKey } })
    added++
  }
  if (added > 0) {
    await audit({ user: ctx.actor }, { action: "STAFF_ACCESS_CHANGED", targetType: "MEMBER", targetId: member.id, organisationId: org.id, detail: `${member.user.email}: added ${grants.map((g) => `${g.role.name} (${g.scopeKey === ALL_LOCATIONS ? "all locations" : g.scopeKey})`).join(", ")}` })
  }
}

export async function removeAssignment(ctx: Ctx, actorUserId: string, membershipId: string, assignmentId: string): Promise<void> {
  const org = business(ctx)
  const member = await loadMember(org.id, membershipId)
  const self = selfChangeProblem(actorUserId, member.user.id)
  if (self) throw new OrgError("FORBIDDEN", self)
  const target = member.assignments.find((a) => a.id === assignmentId)
  if (!target) throw new OrgError("NOT_FOUND", "That role isn't one this person holds.")

  const problem = assignmentProblem(power(ctx), target.role, target.scopeKey, { removing: true })
  if (problem) throw new OrgError("FORBIDDEN", problem)
  if (target.role.isSystem && target.role.presetKey === OWNER_ROLE_KEY && member.status === "ACTIVE" && (await activeOwnerCount(org.id, member.id)) === 0) {
    throw new OrgError("LAST_OWNER", "A business must always have an Owner. Make someone else an Owner first.")
  }
  await prisma.roleAssignment.delete({ where: { id: target.id } })
  await audit({ user: ctx.actor }, { action: "STAFF_ACCESS_CHANGED", targetType: "MEMBER", targetId: member.id, organisationId: org.id, detail: `${member.user.email}: removed ${target.role.name}` })
}

export async function setMemberStatus(ctx: Ctx, actorUserId: string, membershipId: string, status: "ACTIVE" | "SUSPENDED"): Promise<void> {
  const org = business(ctx)
  const member = await loadMember(org.id, membershipId)
  assertCanManage(ctx, member, actorUserId)
  if (member.status === status) return
  if (status === "SUSPENDED" && isOwnerMember(member) && (await activeOwnerCount(org.id, member.id)) === 0) {
    throw new OrgError("LAST_OWNER", "A business must always have an active Owner. Make someone else an Owner first.")
  }
  await prisma.membership.update({ where: { id: member.id }, data: { status } })
  await audit({ user: ctx.actor }, { action: status === "SUSPENDED" ? "STAFF_SUSPENDED" : "STAFF_REINSTATED", targetType: "MEMBER", targetId: member.id, organisationId: org.id, detail: member.user.email })
}

export async function removeMember(ctx: Ctx, actorUserId: string, membershipId: string): Promise<void> {
  const org = business(ctx)
  const member = await loadMember(org.id, membershipId)
  assertCanManage(ctx, member, actorUserId)
  if (isOwnerMember(member) && member.status === "ACTIVE" && (await activeOwnerCount(org.id, member.id)) === 0) {
    throw new OrgError("LAST_OWNER", "A business must always have an Owner. Make someone else an Owner first.")
  }

  await prisma.$transaction(async (tx) => {
    await tx.membership.delete({ where: { id: member.id } }) // their role assignments go with it
    // Technicians they were linked to stay in the diary, just without a login. A location's old login goes too.
    await tx.technician.updateMany({ where: { userId: member.user.id, garage: { organisationId: org.id } }, data: { userId: null } })
    await tx.garage.updateMany({ where: { userId: member.user.id, organisationId: org.id }, data: { userId: null } })
    // Last team they belonged to: back to an ordinary account, and every session ends so the change is immediate.
    if ((await tx.membership.count({ where: { userId: member.user.id } })) === 0 && member.user.role === "GARAGE") {
      await tx.user.update({ where: { id: member.user.id }, data: { role: "OWNER", sessionVersion: { increment: 1 } } })
    }
  })
  await audit({ user: ctx.actor }, { action: "STAFF_REMOVED", targetType: "MEMBER", targetId: member.id, organisationId: org.id, detail: member.user.email })
}
