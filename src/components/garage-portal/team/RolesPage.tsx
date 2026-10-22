"use client"

import { useMemo, useState } from "react"
import { Copy, Library, LockKeyhole, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { FieldError, FieldLabel, TextInput } from "@/components/ui/form-controls"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { useToast } from "@/components/ui/toast"
import { sendJson, useApi } from "@/hooks/use-api"
import { cn } from "@/lib/utils"
import { PERMISSIONS, PERMISSION_GROUPS, PERMISSION_KEYS, expandPermission, normalisePermissions, type PermissionKey } from "@/lib/org/permissions"
import { PageHeader, Panel } from "@/components/garage-portal/shared/PageHeader"
import { usePortalAccess } from "@/components/portal-shell/access-context"

interface Role {
  id: string
  presetKey: string | null
  name: string
  description: string | null
  permissions: PermissionKey[]
  isSystem: boolean
  isEnabled: boolean
  edited: boolean
  updateAvailable: boolean
  members: number
}
interface Preset {
  key: string
  name: string
  description: string
  permissions: PermissionKey[]
  version: number
}

const badge = "rounded-full px-2 py-0.5 text-[11px] font-semibold"

export function RolesPage() {
  const { toast } = useToast()
  const { can } = usePortalAccess()
  const canEdit = can("roles.manage")
  const { data, error, reload } = useApi<{ roles: Role[]; library: Preset[]; limit: number }>("/api/garage/roles")
  const [editing, setEditing] = useState<Role | "new" | null>(null)
  const [deleting, setDeleting] = useState<Role | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const act = async (key: string, call: () => ReturnType<typeof sendJson>, done: string) => {
    setBusy(key)
    const res = await call()
    setBusy(null)
    setDeleting(null)
    if (!res.ok) return toast(res.error ?? "That didn't work", "error")
    toast(done)
    reload()
  }

  return (
    <>
      <PageHeader
        title="Roles"
        description="A role is a set of things someone is allowed to do. Give people the role that fits their job."
        actions={
          canEdit && (
            <Button variant="primary" className="gap-1.5" onClick={() => setEditing("new")}>
              <Plus className="h-4 w-4" /> New role
            </Button>
          )
        }
      />

      {error && !data ? (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">{error}</p>
      ) : !data ? (
        <div className="space-y-3">
          <Skeleton className="h-28 w-full rounded-xl" />
          <Skeleton className="h-28 w-full rounded-xl" />
        </div>
      ) : (
        <div className="space-y-8">
          <section aria-labelledby="roles-h">
            <h2 id="roles-h" className="sr-only">Your roles</h2>
            <ul className="space-y-3">
              {data.roles.map((r) => (
                <li key={r.id}>
                  <Panel className={cn("p-4", !r.isEnabled && "opacity-70")}>
                    <div className="flex flex-wrap items-start gap-3">
                      <div className="min-w-[12rem] flex-1">
                        <p className="flex flex-wrap items-center gap-2 font-semibold text-slate-900 dark:text-white">
                          {r.isSystem && r.presetKey === "owner" && <LockKeyhole aria-hidden className="h-4 w-4 text-slate-400" />}
                          {r.name}
                          {r.isSystem && <span className={cn(badge, "bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-300")}>Built in</span>}
                          {r.presetKey && !r.isSystem && <span className={cn(badge, "bg-blue-100 text-blue-900 dark:bg-blue-500/20 dark:text-blue-200")}>From the library</span>}
                          {r.edited && <span className={cn(badge, "bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-300")}>Edited</span>}
                          {r.updateAvailable && <span className={cn(badge, "bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-200")}>Update available</span>}
                          {!r.isEnabled && <span className={cn(badge, "bg-slate-200 text-slate-700 dark:bg-white/10 dark:text-slate-300")}>Switched off</span>}
                        </p>
                        {r.description && <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{r.description}</p>}
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                          {r.members === 0 ? "No one has this role" : `${r.members} ${r.members === 1 ? "person has" : "people have"} this role`}
                          {r.presetKey === "owner" ? " · everything" : ` · ${r.permissions.length} permissions`}
                        </p>
                        <PermissionSummary role={r} />
                      </div>
                      {canEdit && !(r.isSystem && r.presetKey === "owner") && (
                        <div className="flex flex-shrink-0 flex-wrap items-center gap-1">
                          {!r.isSystem && (
                            <Switch checked={r.isEnabled} disabled={busy === r.id} onCheckedChange={(v) => act(r.id, () => sendJson(`/api/garage/roles/${r.id}`, "PATCH", { isEnabled: v }), v ? `${r.name} switched on` : `${r.name} switched off`)} aria-label={`${r.name} switched on`} />
                          )}
                          <IconButton label={`Edit ${r.name}`} onClick={() => setEditing(r)}><Pencil className="h-4 w-4" /></IconButton>
                          <IconButton label={`Copy ${r.name}`} onClick={() => act(r.id, () => sendJson("/api/garage/roles", "POST", { cloneFrom: r.id, name: `Copy of ${r.name}` }), `Copied ${r.name}`)}><Copy className="h-4 w-4" /></IconButton>
                          {r.updateAvailable && (
                            <IconButton label={`Update ${r.name} to the latest library version`} onClick={() => act(r.id, () => sendJson(`/api/garage/roles/${r.id}`, "PATCH", { resetToPreset: true }), `${r.name} updated`)}><RefreshCw className="h-4 w-4" /></IconButton>
                          )}
                          {!r.isSystem && <IconButton label={`Delete ${r.name}`} danger onClick={() => setDeleting(r)}><Trash2 className="h-4 w-4" /></IconButton>}
                        </div>
                      )}
                    </div>
                  </Panel>
                </li>
              ))}
            </ul>
          </section>

          {data.library.length > 0 && (
            <section aria-labelledby="library-h">
              <h2 id="library-h" className="mb-1 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                <Library aria-hidden className="h-4 w-4" /> Role library
              </h2>
              <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">Ready-made roles for common jobs. They&apos;re off until you switch one on, and you can change it afterwards.</p>
              <ul className="grid gap-3 md:grid-cols-2">
                {data.library.map((p) => (
                  <li key={p.key}>
                    <Panel className="flex h-full flex-col gap-2 p-4">
                      <p className="font-semibold text-slate-900 dark:text-white">{p.name}</p>
                      <p className="flex-1 text-sm text-slate-500 dark:text-slate-400">{p.description}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{p.permissions.length} permissions</p>
                      {canEdit && (
                        <Button size="sm" variant="secondary" className="self-start" disabled={busy === p.key} onClick={() => act(p.key, () => sendJson("/api/garage/roles", "POST", { presetKey: p.key }), `${p.name} switched on`)}>
                          Switch on
                        </Button>
                      )}
                    </Panel>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}

      <RoleEditor
        role={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null)
          reload()
        }}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        destructive
        loading={busy === deleting?.id}
        title={`Delete ${deleting?.name}?`}
        description={deleting && deleting.members > 0 ? `${deleting.members} ${deleting.members === 1 ? "person has" : "people have"} this role, so it can't be deleted until they're given another.` : "This can't be undone."}
        confirmLabel="Delete role"
        onConfirm={() => deleting && act(deleting.id, () => sendJson(`/api/garage/roles/${deleting.id}`, "DELETE"), "Role deleted")}
      />
    </>
  )
}

function IconButton({ label, onClick, danger, children }: { label: string; onClick: () => void; danger?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn("cursor-pointer rounded-lg p-2 text-slate-400", danger ? "hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10 dark:hover:text-red-400" : "hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-white")}
    >
      {children}
    </button>
  )
}

/** The groups a role touches, e.g. "Bookings, Diary, Customers", with the number of permissions in each. */
function PermissionSummary({ role }: { role: Role }) {
  if (role.isSystem && role.presetKey === "owner") return null
  const counts = PERMISSION_GROUPS.map((g) => ({ g, n: role.permissions.filter((k) => PERMISSIONS[k].group === g).length })).filter((x) => x.n > 0)
  if (counts.length === 0) return <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Can&apos;t do anything yet.</p>
  return (
    <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="What this role covers">
      {counts.map(({ g, n }) => (
        <li key={g} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-700 dark:bg-white/10 dark:text-slate-300">
          {g} <span className="text-slate-500 dark:text-slate-400">{n}</span>
        </li>
      ))}
    </ul>
  )
}

function RoleEditor({ role, onClose, onSaved }: { role: Role | "new" | null; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast()
  const { permissions: mine, can } = usePortalAccess()
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [selected, setSelected] = useState<Set<PermissionKey>>(new Set())
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)
  const [seenFor, setSeenFor] = useState<string | null>(null)

  const forKey = role === null ? null : role === "new" ? "new" : role.id
  if (forKey !== seenFor) {
    setSeenFor(forKey)
    setError("")
    if (role === "new") {
      setName("")
      setDescription("")
      setSelected(new Set())
    } else if (role) {
      setName(role.name)
      setDescription(role.description ?? "")
      setSelected(new Set(role.permissions))
    }
  }

  // What is ticked, including what each ticked item brings with it (you can't manage what you can't see).
  const effective = useMemo(() => new Set(normalisePermissions(selected)), [selected])
  const impliedBy = useMemo(() => {
    const m = new Map<PermissionKey, PermissionKey>()
    for (const k of selected) for (const e of expandPermission(k)) if (e !== k && !selected.has(e) && !m.has(e)) m.set(e, k)
    return m
  }, [selected])

  const toggle = (k: PermissionKey, on: boolean) =>
    setSelected((cur) => {
      const next = new Set(cur)
      if (on) next.add(k)
      else next.delete(k) // anything another ticked item still brings with it stays ticked (shown as "Included with …")
      return next
    })

  const holds = (k: PermissionKey) => mine.includes(k)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!role) return
    if (name.trim().length < 2) return setError("Give the role a name.")
    setSaving(true)
    setError("")
    const permissions = [...selected]
    const res =
      role === "new"
        ? await sendJson("/api/garage/roles", "POST", { name: name.trim(), description: description.trim() || undefined, permissions })
        : await sendJson(`/api/garage/roles/${role.id}`, "PATCH", { name: name.trim(), description: description.trim() || null, permissions })
    setSaving(false)
    if (!res.ok) return setError(res.error ?? "Couldn't save the role")
    toast(role === "new" ? "Role created" : "Role saved")
    onSaved()
  }

  const readOnly = role !== null && role !== "new" && role.isSystem && role.presetKey === "owner"

  return (
    <Dialog open={role !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        <form onSubmit={submit} noValidate>
          <DialogHeader>
            <DialogTitle>{role === "new" ? "New role" : `Edit ${role?.name ?? ""}`}</DialogTitle>
            <DialogDescription>Tick what this role is allowed to do. You can only give permissions you have yourself.</DialogDescription>
          </DialogHeader>

          <div className="my-4 space-y-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <FieldLabel htmlFor="role-name">Name *</FieldLabel>
                <TextInput id="role-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoFocus disabled={readOnly} />
              </div>
              <div>
                <FieldLabel htmlFor="role-desc">What it&apos;s for</FieldLabel>
                <TextInput id="role-desc" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} disabled={readOnly} />
              </div>
            </div>

            {PERMISSION_GROUPS.map((group) => {
              const keys = PERMISSION_KEYS.filter((k) => PERMISSIONS[k].group === group)
              return (
                <fieldset key={group}>
                  <legend className="mb-1 text-sm font-bold text-slate-900 dark:text-white">{group}</legend>
                  <ul className="grid gap-x-4 sm:grid-cols-2">
                    {keys.map((k) => {
                      const def = PERMISSIONS[k]
                      const via = impliedBy.get(k)
                      const checked = effective.has(k)
                      const unavailable = !holds(k) && !checked
                      return (
                        <li key={k}>
                          <label className={cn("flex min-h-10 items-start gap-2 py-1.5 text-sm", via || unavailable || readOnly ? "cursor-not-allowed opacity-70" : "cursor-pointer")} title={unavailable ? "You don't have this permission yourself" : def.description}>
                            <input
                              type="checkbox"
                              className="mt-0.5 h-4 w-4 flex-shrink-0 cursor-pointer accent-[#1E3A5F]"
                              checked={checked}
                              disabled={!!via || unavailable || readOnly}
                              onChange={(e) => toggle(k, e.target.checked)}
                            />
                            <span className="min-w-0">
                              <span className="font-medium text-slate-800 dark:text-slate-100">{def.label}</span>
                              {def.scope === "organisation" && <span className="ml-1.5 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-white/10 dark:text-slate-300">Whole business</span>}
                              {def.sensitive && <span className="ml-1.5 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900 dark:bg-amber-500/20 dark:text-amber-200">Sensitive</span>}
                              <span className="block text-xs font-normal text-slate-500 dark:text-slate-400">
                                {via ? `Included with “${PERMISSIONS[via].label}”` : def.description}
                              </span>
                            </span>
                          </label>
                        </li>
                      )
                    })}
                  </ul>
                </fieldset>
              )
            })}
            {!can("roles.manage") && <p className="text-sm text-slate-500">You can look at roles but not change them.</p>}
            <FieldError>{error}</FieldError>
          </div>

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>{readOnly ? "Close" : "Cancel"}</Button>
            {!readOnly && <Button type="submit" variant="primary" loading={saving}>{role === "new" ? "Create role" : "Save role"}</Button>}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
