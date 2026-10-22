"use client"

import { Plus, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { FieldLabel, NativeSelect } from "@/components/ui/form-controls"
import { cn } from "@/lib/utils"
import { PERMISSIONS, permissionScope, type PermissionKey } from "@/lib/org/permissions"
import type { PortalLocation } from "@/components/portal-shell/access-context"

export interface RoleOption {
  id: string
  name: string
  description: string | null
  permissions: PermissionKey[]
  presetKey: string | null
}

/** One row of "this role, at these locations". `locationIds` null means every location (including ones added later). */
export interface AssignmentDraft {
  key: number
  roleId: string
  all: boolean
  locationIds: string[]
}

/** The least powerful sensible starting point: Staff if the business has it, else the first role that isn't Owner. */
const defaultRole = (roles: RoleOption[]) => roles.find((r) => r.presetKey === "staff") ?? roles.find((r) => r.presetKey !== "owner") ?? roles[0]

export const newDraft = (key: number, roles: RoleOption[], locations: PortalLocation[], activeId: string | null): AssignmentDraft => ({
  key,
  roleId: defaultRole(roles)?.id ?? "",
  // A business with several locations starts on the one you are looking at, so nobody is given everything by default.
  all: locations.length <= 1,
  locationIds: locations.length > 1 && activeId ? [activeId] : [],
})

export const draftsToInput = (drafts: AssignmentDraft[]) => drafts.map((d) => ({ roleId: d.roleId, locationIds: d.all ? null : d.locationIds }))

/** Empty when the drafts can be sent; otherwise what is missing. */
export function draftsProblem(drafts: AssignmentDraft[]): string {
  if (drafts.length === 0) return "Choose a role."
  if (drafts.some((d) => !d.roleId)) return "Choose a role."
  if (drafts.some((d) => !d.all && d.locationIds.length === 0)) return "Choose at least one location, or all locations."
  return ""
}

const hasBusinessWide = (r: RoleOption | undefined) => !!r && r.permissions.some((k) => permissionScope(k) === "organisation")

export function AssignmentPicker({
  roles,
  locations,
  drafts,
  onChange,
  activeId,
  idPrefix,
}: {
  roles: RoleOption[]
  locations: PortalLocation[]
  drafts: AssignmentDraft[]
  onChange: (next: AssignmentDraft[]) => void
  activeId: string | null
  idPrefix: string
}) {
  const update = (key: number, patch: Partial<AssignmentDraft>) => onChange(drafts.map((d) => (d.key === key ? { ...d, ...patch } : d)))
  const nextKey = Math.max(0, ...drafts.map((d) => d.key)) + 1
  const multiple = locations.length > 1

  return (
    <div className="space-y-3">
      {drafts.map((d, i) => {
        const role = roles.find((r) => r.id === d.roleId)
        const wide = hasBusinessWide(role)
        return (
          <fieldset key={d.key} className="rounded-xl border border-slate-200 p-3 dark:border-white/10">
            <legend className="sr-only">Role {i + 1}</legend>
            <div className="flex items-end gap-2">
              <div className="min-w-0 flex-1">
                <FieldLabel htmlFor={`${idPrefix}-role-${d.key}`}>Role</FieldLabel>
                <NativeSelect id={`${idPrefix}-role-${d.key}`} value={d.roleId} onChange={(e) => update(d.key, { roleId: e.target.value })}>
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              {drafts.length > 1 && (
                <button
                  type="button"
                  aria-label={`Remove role ${i + 1}`}
                  onClick={() => onChange(drafts.filter((x) => x.key !== d.key))}
                  className="mb-0.5 flex h-9 w-9 flex-shrink-0 cursor-pointer items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            {role?.description && <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">{role.description}</p>}

            {multiple && (
              <div className="mt-3">
                <p className="mb-1 text-xs font-semibold text-slate-500 dark:text-slate-400">Where</p>
                <div className="flex flex-wrap gap-x-5 gap-y-1">
                  <label className="flex min-h-9 cursor-pointer items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                    <input type="radio" name={`${idPrefix}-where-${d.key}`} className="h-4 w-4 cursor-pointer accent-[#1E3A5F]" checked={d.all} onChange={() => update(d.key, { all: true })} />
                    All locations
                  </label>
                  <label className="flex min-h-9 cursor-pointer items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                    <input
                      type="radio"
                      name={`${idPrefix}-where-${d.key}`}
                      className="h-4 w-4 cursor-pointer accent-[#1E3A5F]"
                      checked={!d.all}
                      onChange={() => update(d.key, { all: false, locationIds: d.locationIds.length > 0 ? d.locationIds : activeId ? [activeId] : [] })}
                    />
                    Chosen locations
                  </label>
                </div>
                {!d.all && (
                  <ul className="mt-1 grid gap-x-4 sm:grid-cols-2" aria-label="Locations">
                    {locations.map((l) => (
                      <li key={l.id}>
                        <label className="flex min-h-9 cursor-pointer items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                          <input
                            type="checkbox"
                            className="h-4 w-4 cursor-pointer accent-[#1E3A5F]"
                            checked={d.locationIds.includes(l.id)}
                            onChange={(e) => update(d.key, { locationIds: e.target.checked ? [...d.locationIds, l.id] : d.locationIds.filter((x) => x !== l.id) })}
                          />
                          <span className="truncate">{l.name}</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
                {!d.all && wide && (
                  <p className={cn("mt-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-900 dark:bg-amber-500/10 dark:text-amber-200")}>
                    Some of this role&apos;s permissions ({[...new Set((role?.permissions ?? []).filter((k) => permissionScope(k) === "organisation").map((k) => PERMISSIONS[k].label.toLowerCase()))].slice(0, 3).join(", ")}…) cover the whole business, so they only apply when the role is given at all locations.
                  </p>
                )}
              </div>
            )}
          </fieldset>
        )
      })}
      {drafts.length < 10 && (
        <Button type="button" size="sm" variant="secondary" className="gap-1.5" onClick={() => onChange([...drafts, newDraft(nextKey, roles, locations, activeId)])}>
          <Plus className="h-4 w-4" /> Add another role
        </Button>
      )}
    </div>
  )
}
