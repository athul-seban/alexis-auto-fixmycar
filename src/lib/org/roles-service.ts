import type { Role } from "@prisma/client"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { audit } from "@/lib/audit"
import type { GarageContext } from "@/lib/garage-auth"
import { OrgError } from "@/lib/org/org-error"
import { PERMISSION_KEYS, isPermissionKey, normalisePermissions, permissionsFromJson, permissionsToJson, type PermissionKey } from "@/lib/org/permissions"
import { PRESET_ROLES, findPreset, findTemplate } from "@/lib/org/presets"
import { MAX_ROLES_PER_BUSINESS, ROLE_NAME_MAX, actorPower, legacyPower, roleDefinitionProblem, roleNameProblem, type ActorPower } from "@/lib/org/rules"

// Managing the roles of a garage business: enable a preset, make a custom role, edit, switch off, delete. Every function
// takes the caller's GarageContext (so the business and the caller's own power come from the server, never the request)
// and throws OrgError, which handleRouteError turns into a JSON response.

type Ctx = Pick<GarageContext, "organisation" | "assignments" | "roles" | "legacy" | "actor">

const power = (ctx: Ctx): ActorPower => (ctx.legacy ? legacyPower() : actorPower(ctx.assignments, ctx.roles))

function business(ctx: Ctx) {
  if (!ctx.organisation) throw new OrgError("CONFLICT", "This garage hasn't been set up as a business yet. Ask support to run the upgrade.")
  return ctx.organisation
}

// ---- input ---------------------------------------------------------------------------------------------------------

/** Permission keys from a request: unknown keys are an error (not silently dropped), the rest are expanded and ordered. */
export function parsePermissionInput(input: unknown): PermissionKey[] {
  const arr = z.array(z.string().max(60)).max(80).safeParse(input)
  if (!arr.success) throw new OrgError("INVALID_INPUT", "Permissions must be a list of permission names.")
  const unknown = arr.data.filter((k) => !isPermissionKey(k))
  if (unknown.length > 0) throw new OrgError("INVALID_INPUT", `Unknown permission: ${unknown.slice(0, 3).join(", ")}.`)
  return normalisePermissions(arr.data)
}

const nameField = z.string().trim().max(ROLE_NAME_MAX + 20)
const descriptionField = z.string().trim().max(300).optional()

export const createRoleSchema = z.union([
  z.object({ presetKey: z.string().max(60) }), // switch on a preset from the library
  z.object({ cloneFrom: z.string().max(64), name: nameField }), // copy an existing role under a new name
  z.object({ name: nameField, description: descriptionField, permissions: z.array(z.string().max(60)).max(80) }), // a custom role
])

export const updateRoleSchema = z
  .object({
    name: nameField.optional(),
    description: z.union([z.string().trim().max(300), z.null()]).optional(),
    permissions: z.array(z.string().max(60)).max(80).optional(),
    isEnabled: z.boolean().optional(),
    /** Preset roles: apply the library's newer version, even over the garage's own edits. */
    resetToPreset: z.boolean().optional(),
  })
  .strict()

// ---- reading -------------------------------------------------------------------------------------------------------

export interface RoleView {
  id: string
  presetKey: string | null
  name: string
  description: string | null
  permissions: PermissionKey[]
  isSystem: boolean
  isEnabled: boolean
  /** Edited from the library version, so a library update won't overwrite it automatically. */
  edited: boolean
  /** The library has a newer version of this preset. */
  updateAvailable: boolean
  members: number
}

export interface PresetView {
  key: string
  name: string
  description: string
  permissions: PermissionKey[]
  version: number
}

const toView = (r: Role, members: number): RoleView => {
  const preset = findTemplate(r.presetKey)
  return {
    id: r.id,
    presetKey: r.presetKey,
    name: r.name,
    description: r.description,
    permissions: permissionsFromJson(r.permissions),
    isSystem: r.isSystem,
    isEnabled: r.isEnabled,
    edited: r.editedAt !== null,
    updateAvailable: !!preset && !r.isSystem && preset.version > r.presetVersion,
    members,
  }
}

export async function listRoles(ctx: Ctx): Promise<{ roles: RoleView[]; library: PresetView[]; limit: number }> {
  const org = business(ctx)
  const rows = await prisma.role.findMany({ where: { organisationId: org.id }, orderBy: [{ isSystem: "desc" }, { createdAt: "asc" }] })
  const counts = await prisma.roleAssignment.groupBy({ by: ["roleId"], where: { role: { organisationId: org.id } }, _count: { membershipId: true } })
  const byRole = new Map(counts.map((c) => [c.roleId, c._count.membershipId]))

  const enabled = new Set(rows.map((r) => r.presetKey))
  const library = PRESET_ROLES.filter((p) => !enabled.has(p.key)).map((p) => ({ key: p.key, name: p.name, description: p.description, permissions: [...p.permissions], version: p.version }))
  return { roles: rows.map((r) => toView(r, byRole.get(r.id) ?? 0)), library, limit: MAX_ROLES_PER_BUSINESS }
}

// ---- writing -------------------------------------------------------------------------------------------------------

async function loadRole(orgId: string, id: string): Promise<Role> {
  const role = await prisma.role.findFirst({ where: { id, organisationId: orgId } }) // scoped to this business: never another's
  if (!role) throw new OrgError("NOT_FOUND", "Role not found.")
  return role
}

async function assertRoom(orgId: string) {
  if ((await prisma.role.count({ where: { organisationId: orgId } })) >= MAX_ROLES_PER_BUSINESS) {
    throw new OrgError("LIMIT", `A business can have up to ${MAX_ROLES_PER_BUSINESS} roles. Delete one you don't use first.`)
  }
}

async function assertName(orgId: string, name: string, selfId?: string) {
  const problem = roleNameProblem(name, await prisma.role.findMany({ where: { organisationId: orgId }, select: { id: true, name: true } }), selfId)
  if (problem) throw new OrgError("INVALID_INPUT", problem)
}

function assertCanDefine(ctx: Ctx, permissions: readonly PermissionKey[]) {
  const problem = roleDefinitionProblem(power(ctx), permissions)
  if (problem) throw new OrgError("FORBIDDEN", problem)
}

export async function createRole(ctx: Ctx, input: z.infer<typeof createRoleSchema>): Promise<RoleView> {
  const org = business(ctx)
  assertCanDefine(ctx, []) // needs roles.manage before anything else is looked at
  await assertRoom(org.id)

  let data: { name: string; description: string | null; permissions: PermissionKey[]; presetKey: string | null; presetVersion: number }
  let action: "ROLE_ENABLED" | "ROLE_CREATED" = "ROLE_CREATED"

  if ("presetKey" in input) {
    const preset = findPreset(input.presetKey)
    if (!preset) throw new OrgError("NOT_FOUND", "That role isn't in the library.")
    if (await prisma.role.findFirst({ where: { organisationId: org.id, presetKey: preset.key }, select: { id: true } })) {
      throw new OrgError("CONFLICT", `${preset.name} is already switched on.`)
    }
    data = { name: preset.name, description: preset.description, permissions: [...preset.permissions], presetKey: preset.key, presetVersion: preset.version }
    action = "ROLE_ENABLED"
  } else if ("cloneFrom" in input) {
    const source = await loadRole(org.id, input.cloneFrom)
    // The Owner role always means "everything" whatever is stored on it. A copy of it is a copy of everything, so it is
    // held to the same no-escalation rule as any other role (below).
    const permissions = source.isSystem && source.presetKey === "owner" ? PERMISSION_KEYS : permissionsFromJson(source.permissions)
    data = { name: input.name, description: source.description, permissions: [...permissions], presetKey: null, presetVersion: 0 }
  } else {
    const permissions = parsePermissionInput(input.permissions)
    if (permissions.length === 0) throw new OrgError("INVALID_INPUT", "Choose at least one permission for the role.")
    data = { name: input.name, description: input.description || null, permissions, presetKey: null, presetVersion: 0 }
  }

  if (action === "ROLE_CREATED") await assertName(org.id, data.name)
  assertCanDefine(ctx, data.permissions)

  const created = await prisma.role.create({
    data: { organisationId: org.id, presetKey: data.presetKey, name: data.name.trim(), description: data.description, permissions: permissionsToJson(data.permissions), presetVersion: data.presetVersion, isSystem: false, isEnabled: true },
  })
  await audit({ user: ctx.actor }, { action, targetType: "ROLE", targetId: created.id, organisationId: org.id, detail: `${created.name}: ${data.permissions.length} permission(s)` })
  return toView(created, 0)
}

export async function updateRole(ctx: Ctx, roleId: string, input: z.infer<typeof updateRoleSchema>): Promise<RoleView> {
  const org = business(ctx)
  assertCanDefine(ctx, [])
  const role = await loadRole(org.id, roleId)
  const isOwner = role.isSystem && role.presetKey === "owner"
  if (isOwner) throw new OrgError("FORBIDDEN", "The Owner role can't be changed: it always has every permission.")

  const patch: { name?: string; description?: string | null; permissions?: string; isEnabled?: boolean; editedAt?: Date | null; presetVersion?: number } = {}
  const changes: string[] = []

  if (input.resetToPreset) {
    if (input.name !== undefined || input.description !== undefined || input.permissions !== undefined || input.isEnabled !== undefined) {
      throw new OrgError("INVALID_INPUT", "Resetting to the library version can't be combined with other changes.")
    }
    const preset = findTemplate(role.presetKey)
    if (!preset) throw new OrgError("INVALID_INPUT", "Only preset roles can be reset to the library version.")
    assertCanDefine(ctx, [...new Set([...preset.permissions, ...permissionsFromJson(role.permissions)])])
    // Back to the library version: it counts as unedited again, so future library updates can apply to it.
    Object.assign(patch, { permissions: permissionsToJson(preset.permissions), presetVersion: preset.version, description: preset.description, editedAt: null })
    if (!role.isSystem) patch.name = preset.name
    changes.push("reset to the library version")
  }

  if (input.name !== undefined && input.name.trim() !== role.name) {
    await assertName(org.id, input.name, role.id)
    patch.name = input.name.trim()
    patch.editedAt = new Date()
    changes.push(`renamed to ${patch.name}`)
  }
  if (input.description !== undefined) {
    patch.description = input.description || null
    patch.editedAt = new Date()
  }
  if (input.permissions !== undefined) {
    const permissions = parsePermissionInput(input.permissions)
    if (permissions.length === 0) throw new OrgError("INVALID_INPUT", "A role needs at least one permission.")
    // You can't edit a role into something you couldn't create, and you can't strip down a role you could never have made.
    assertCanDefine(ctx, [...new Set([...permissions, ...permissionsFromJson(role.permissions)])])
    patch.permissions = permissionsToJson(permissions)
    patch.editedAt = new Date()
    changes.push("permissions changed")
  }
  if (input.isEnabled !== undefined && input.isEnabled !== role.isEnabled) {
    if (!input.isEnabled) {
      if (role.isSystem) throw new OrgError("FORBIDDEN", `${role.name} is a built-in role and can't be switched off.`)
      const inUse = await prisma.roleAssignment.count({ where: { roleId: role.id } })
      if (inUse > 0) throw new OrgError("IN_USE", `${inUse} ${inUse === 1 ? "person has" : "people have"} this role. Give them another role first.`, { members: inUse })
    }
    patch.isEnabled = input.isEnabled
    changes.push(input.isEnabled ? "switched on" : "switched off")
  }

  if (Object.keys(patch).length === 0) return toView(role, await prisma.roleAssignment.count({ where: { roleId: role.id } }))

  const updated = await prisma.role.update({ where: { id: role.id }, data: patch })
  await audit({ user: ctx.actor }, {
    action: input.isEnabled === false ? "ROLE_DISABLED" : input.isEnabled === true && changes.length === 1 ? "ROLE_ENABLED" : "ROLE_UPDATED",
    targetType: "ROLE",
    targetId: role.id,
    organisationId: org.id,
    detail: `${updated.name}: ${changes.join(", ") || "updated"}`,
  })
  return toView(updated, await prisma.roleAssignment.count({ where: { roleId: role.id } }))
}

export async function deleteRole(ctx: Ctx, roleId: string): Promise<void> {
  const org = business(ctx)
  assertCanDefine(ctx, [])
  const role = await loadRole(org.id, roleId)
  if (role.isSystem) throw new OrgError("FORBIDDEN", `${role.name} is a built-in role and can't be deleted.`)
  const inUse = await prisma.roleAssignment.count({ where: { roleId: role.id } })
  if (inUse > 0) throw new OrgError("IN_USE", `${inUse} ${inUse === 1 ? "person has" : "people have"} this role. Give them another role first.`, { members: inUse })

  await prisma.role.delete({ where: { id: role.id } })
  await audit({ user: ctx.actor }, { action: "ROLE_DELETED", targetType: "ROLE", targetId: role.id, organisationId: org.id, detail: role.name })
}
