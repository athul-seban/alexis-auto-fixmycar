"use client"

import { useMemo, useState } from "react"
import { Copy, Mail, Plus, UserPlus, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { EmptyState } from "@/components/ui/empty-state"
import { FieldError, FieldLabel, TextInput } from "@/components/ui/form-controls"
import { Skeleton } from "@/components/ui/skeleton"
import { useToast } from "@/components/ui/toast"
import { sendJson, useApi } from "@/hooks/use-api"
import { cn, formatDate } from "@/lib/utils"
import type { PermissionKey } from "@/lib/org/permissions"
import { OWNER_ROLE_KEY } from "@/lib/org/presets"
import { PageHeader, Panel } from "@/components/garage-portal/shared/PageHeader"
import { StatusPill } from "@/components/garage-portal/shared/StatusPill"
import { usePortalAccess } from "@/components/portal-shell/access-context"
import { AssignmentPicker, draftsProblem, draftsToInput, newDraft, type AssignmentDraft, type RoleOption } from "@/components/garage-portal/team/AssignmentPicker"

interface Member {
  membershipId: string
  userId: string
  name: string | null
  email: string
  status: string
  isSelf: boolean
  isOwner: boolean
  invitePending: boolean
  assignments: { id: string; roleId: string; roleName: string; scopeKey: string; locationName: string | null }[]
  technicians: { id: string; name: string; garageId: string }[]
  canManage: boolean
}
interface Invite {
  id: string
  email: string
  createdAt: string
  expiresAt: string
  assignments: { roleName: string; where: string }[]
  canRevoke: boolean
}
interface RolesResponse {
  roles: { id: string; name: string; description: string | null; permissions: PermissionKey[]; isEnabled: boolean; isSystem: boolean; presetKey: string | null }[]
}

type Confirm = { kind: "remove"; member: Member } | { kind: "suspend"; member: Member } | { kind: "revoke"; invite: Invite } | { kind: "dropAccess"; member: Member; assignment: Member["assignments"][number] }

const chip = "inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700 dark:bg-white/10 dark:text-slate-200"

export function TeamPage() {
  const { toast } = useToast()
  const { locations, activeLocationId, isOwner } = usePortalAccess()
  const team = useApi<{ members: Member[]; invites: Invite[] }>("/api/garage/staff")
  const rolesApi = useApi<RolesResponse>("/api/garage/roles")
  const [inviting, setInviting] = useState(false)
  const [addingTo, setAddingTo] = useState<Member | null>(null)
  const [confirm, setConfirm] = useState<Confirm | null>(null)
  const [busy, setBusy] = useState(false)

  // Roles that can be handed out: switched on, and the Owner role only by an Owner (the server enforces this too).
  const roles: RoleOption[] = useMemo(
    () =>
      (rolesApi.data?.roles ?? [])
        .filter((r) => r.isEnabled && (isOwner || !(r.isSystem && r.presetKey === OWNER_ROLE_KEY)))
        .map((r) => ({ id: r.id, name: r.name, description: r.description, permissions: r.permissions, presetKey: r.isSystem ? r.presetKey : null }))
        // Owner last: it is the one you pick on purpose.
        .sort((a, b) => Number(a.presetKey === OWNER_ROLE_KEY) - Number(b.presetKey === OWNER_ROLE_KEY)),
    [rolesApi.data, isOwner]
  )

  const run = async (call: () => ReturnType<typeof sendJson>, done: string) => {
    setBusy(true)
    const res = await call()
    setBusy(false)
    setConfirm(null)
    if (!res.ok) return toast(res.error ?? "That didn't work", "error")
    toast(done)
    team.reload()
  }

  const members = team.data?.members ?? []
  const invites = team.data?.invites ?? []

  return (
    <>
      <PageHeader
        title="Team"
        description="Invite people to work with you and choose what each can do, and where."
        actions={
          <Button variant="primary" className="gap-1.5" onClick={() => setInviting(true)} disabled={roles.length === 0}>
            <UserPlus className="h-4 w-4" /> Invite someone
          </Button>
        }
      />

      {team.error && !team.data ? (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">{team.error}</p>
      ) : !team.data ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
        </div>
      ) : (
        <div className="space-y-8">
          {invites.length > 0 && (
            <section aria-labelledby="invites-h">
              <h2 id="invites-h" className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Waiting to join</h2>
              <Panel className="divide-y divide-slate-100 dark:divide-white/10">
                {invites.map((inv) => (
                  <div key={inv.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      <Mail aria-hidden className="mt-0.5 h-5 w-5 flex-shrink-0 text-slate-400" />
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-slate-900 dark:text-white">{inv.email}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {inv.assignments.map((a) => `${a.roleName} · ${a.where}`).join("; ")} · expires {formatDate(inv.expiresAt)}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-shrink-0 flex-wrap gap-2">
                      <Button size="sm" variant="secondary" disabled={busy} onClick={() => run(() => sendJson(`/api/garage/staff/invites/${inv.id}`, "POST"), "Invitation sent again")}>
                        Resend
                      </Button>
                      <Button size="sm" variant="secondary" className="text-red-700 dark:text-red-400" disabled={busy} onClick={() => setConfirm({ kind: "revoke", invite: inv })}>
                        Cancel invite
                      </Button>
                    </div>
                  </div>
                ))}
              </Panel>
            </section>
          )}

          <section aria-labelledby="members-h">
            <h2 id="members-h" className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">People</h2>
            {members.length === 0 ? (
              <EmptyState icon={UserPlus} title="No one here yet" description="Invite your first team member." />
            ) : (
              <ul className="space-y-3">
                {members.map((m) => (
                  <li key={m.membershipId}>
                    <Panel className={cn("p-4", m.status !== "ACTIVE" && "opacity-80")}>
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                        <div className="min-w-0 flex-1">
                          <p className="flex flex-wrap items-center gap-2 font-semibold text-slate-900 dark:text-white">
                            <span className="truncate">{m.name ?? m.email}</span>
                            {m.isSelf && <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-900 dark:bg-blue-500/20 dark:text-blue-200">You</span>}
                            {m.isOwner && <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[11px] font-semibold text-orange-900 dark:bg-orange-500/20 dark:text-orange-200">Owner</span>}
                            {m.status !== "ACTIVE" && <StatusPill status={m.status} />}
                            {m.invitePending && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900 dark:bg-amber-500/20 dark:text-amber-200">Hasn&apos;t signed in yet</span>}
                          </p>
                          {m.name && <p className="truncate text-xs text-slate-500 dark:text-slate-400">{m.email}</p>}
                        </div>
                        {m.canManage && (
                          <div className="flex flex-shrink-0 flex-wrap gap-2">
                            <Button size="sm" variant="secondary" className="gap-1" onClick={() => setAddingTo(m)}>
                              <Plus className="h-3.5 w-3.5" /> Add access
                            </Button>
                            <Button
                              size="sm"
                              variant="secondary"
                              disabled={busy}
                              onClick={() => (m.status === "ACTIVE" ? setConfirm({ kind: "suspend", member: m }) : run(() => sendJson(`/api/garage/staff/${m.membershipId}`, "PATCH", { status: "ACTIVE" }), `${m.name ?? m.email} can sign in again`))}
                            >
                              {m.status === "ACTIVE" ? "Suspend" : "Reinstate"}
                            </Button>
                            <Button size="sm" variant="secondary" className="text-red-700 dark:text-red-400" disabled={busy} onClick={() => setConfirm({ kind: "remove", member: m })}>
                              Remove
                            </Button>
                          </div>
                        )}
                      </div>

                      <ul className="mt-3 flex flex-wrap gap-2" aria-label={`Access for ${m.name ?? m.email}`}>
                        {m.assignments.length === 0 && <li className="text-xs text-slate-500 dark:text-slate-400">No access to any location.</li>}
                        {m.assignments.map((a) => (
                          <li key={a.id} className={chip}>
                            <span>
                              {a.roleName} · {a.locationName ?? "All locations"}
                            </span>
                            {m.canManage && (
                              <button
                                type="button"
                                aria-label={`Remove ${a.roleName} at ${a.locationName ?? "all locations"} from ${m.name ?? m.email}`}
                                onClick={() => setConfirm({ kind: "dropAccess", member: m, assignment: a })}
                                className="-mr-1 cursor-pointer rounded-full p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-white/20 dark:hover:text-white"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            )}
                          </li>
                        ))}
                        {m.technicians.map((t) => (
                          <li key={t.id} className={cn(chip, "bg-emerald-50 text-emerald-900 dark:bg-emerald-500/15 dark:text-emerald-200")}>
                            Technician: {t.name}
                          </li>
                        ))}
                      </ul>
                    </Panel>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      <InviteDialog
        open={inviting}
        roles={roles}
        locations={locations}
        activeId={activeLocationId}
        onClose={() => setInviting(false)}
        onDone={() => {
          setInviting(false)
          team.reload()
        }}
      />
      <AddAccessDialog member={addingTo} roles={roles} locations={locations} activeId={activeLocationId} onClose={() => setAddingTo(null)} onDone={() => { setAddingTo(null); team.reload() }} />

      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(o) => !o && setConfirm(null)}
        loading={busy}
        destructive
        title={
          confirm?.kind === "remove" ? `Remove ${confirm.member.name ?? confirm.member.email}?` :
          confirm?.kind === "suspend" ? `Suspend ${confirm.member.name ?? confirm.member.email}?` :
          confirm?.kind === "revoke" ? `Cancel the invitation to ${confirm.invite.email}?` :
          confirm?.kind === "dropAccess" ? "Remove this access?" : ""
        }
        description={
          confirm?.kind === "remove" ? "They lose all access to your business straight away and are signed out. If they only joined as staff, their account goes back to a customer account." :
          confirm?.kind === "suspend" ? "They can't sign in to your business until you reinstate them." :
          confirm?.kind === "revoke" ? "The link in their email stops working." :
          confirm?.kind === "dropAccess" ? `${confirm.member.name ?? confirm.member.email} will no longer be ${confirm.assignment.roleName} at ${confirm.assignment.locationName ?? "all locations"}.` : ""
        }
        confirmLabel={confirm?.kind === "remove" ? "Remove" : confirm?.kind === "suspend" ? "Suspend" : confirm?.kind === "revoke" ? "Cancel invitation" : "Remove access"}
        onConfirm={() => {
          if (!confirm) return
          if (confirm.kind === "remove") return run(() => sendJson(`/api/garage/staff/${confirm.member.membershipId}`, "DELETE"), "Removed from the team")
          if (confirm.kind === "suspend") return run(() => sendJson(`/api/garage/staff/${confirm.member.membershipId}`, "PATCH", { status: "SUSPENDED" }), "Suspended")
          if (confirm.kind === "revoke") return run(() => sendJson(`/api/garage/staff/invites/${confirm.invite.id}`, "DELETE"), "Invitation cancelled")
          return run(() => sendJson(`/api/garage/staff/${confirm.member.membershipId}/assignments/${confirm.assignment.id}`, "DELETE"), "Access removed")
        }}
      />
    </>
  )
}

function InviteDialog({ open, roles, locations, activeId, onClose, onDone }: { open: boolean; roles: RoleOption[]; locations: ReturnType<typeof usePortalAccess>["locations"]; activeId: string | null; onClose: () => void; onDone: () => void }) {
  const { toast } = useToast()
  const [email, setEmail] = useState("")
  const [name, setName] = useState("")
  const [drafts, setDrafts] = useState<AssignmentDraft[]>([])
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)
  const [sent, setSent] = useState<{ email: string; emailSent: boolean; devUrl?: string } | null>(null)

  // Start each time it opens with one row on the current location, and no leftovers from the last invitation.
  const [wasOpen, setWasOpen] = useState(false)
  if (open && !wasOpen) {
    setWasOpen(true)
    setEmail("")
    setName("")
    setError("")
    setSent(null)
    setDrafts([newDraft(1, roles, locations, activeId)])
  }
  if (!open && wasOpen) setWasOpen(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError("Enter a valid email address.")
    const problem = draftsProblem(drafts)
    if (problem) return setError(problem)
    setSaving(true)
    setError("")
    const res = await sendJson<{ emailSent: boolean; devUrl?: string }>("/api/garage/staff/invites", "POST", { email: email.trim(), name: name.trim() || undefined, assignments: draftsToInput(drafts) })
    setSaving(false)
    if (!res.ok) return setError(res.error ?? "Couldn't send the invitation")
    setSent({ email: email.trim(), emailSent: res.data?.emailSent ?? false, devUrl: res.data?.devUrl })
    if (res.data?.emailSent) toast(`Invitation sent to ${email.trim()}`)
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && (sent ? onDone() : onClose())}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
        {sent ? (
          <>
            <DialogHeader>
              <DialogTitle>{sent.emailSent ? "Invitation sent" : "Invitation ready"}</DialogTitle>
              <DialogDescription>
                {sent.emailSent ? `We emailed ${sent.email}. The link works once and lasts 7 days.` : `Email isn't set up here, so share this link with ${sent.email} yourself. It works once and lasts 7 days.`}
              </DialogDescription>
            </DialogHeader>
            {sent.devUrl && (
              <div className="flex items-center gap-2 rounded-lg bg-slate-50 p-2 dark:bg-white/5">
                <input readOnly aria-label="Invitation link" value={sent.devUrl} className="min-w-0 flex-1 bg-transparent text-xs text-slate-700 outline-none dark:text-slate-200" onFocus={(e) => e.currentTarget.select()} />
                <Button type="button" size="sm" variant="secondary" className="gap-1" onClick={() => { void navigator.clipboard?.writeText(sent.devUrl!); toast("Link copied") }}>
                  <Copy className="h-3.5 w-3.5" /> Copy
                </Button>
              </div>
            )}
            <DialogFooter>
              <Button variant="primary" onClick={onDone}>Done</Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={submit} noValidate>
            <DialogHeader>
              <DialogTitle>Invite someone</DialogTitle>
              <DialogDescription>They get an email with a link to set a password and join. You choose what they can do.</DialogDescription>
            </DialogHeader>
            <div className="my-4 space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <FieldLabel htmlFor="invite-email">Email *</FieldLabel>
                  <TextInput id="invite-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus autoComplete="off" maxLength={200} />
                </div>
                <div>
                  <FieldLabel htmlFor="invite-name">Name</FieldLabel>
                  <TextInput id="invite-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" maxLength={120} />
                </div>
              </div>
              <AssignmentPicker roles={roles} locations={locations} drafts={drafts} onChange={setDrafts} activeId={activeId} idPrefix="invite" />
              <FieldError>{error}</FieldError>
            </div>
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
              <Button type="submit" variant="primary" loading={saving}>Send invitation</Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

function AddAccessDialog({ member, roles, locations, activeId, onClose, onDone }: { member: Member | null; roles: RoleOption[]; locations: ReturnType<typeof usePortalAccess>["locations"]; activeId: string | null; onClose: () => void; onDone: () => void }) {
  const { toast } = useToast()
  const [drafts, setDrafts] = useState<AssignmentDraft[]>([])
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)
  const [forId, setForId] = useState<string | null>(null)
  if (member && forId !== member.membershipId) {
    setForId(member.membershipId)
    setError("")
    setDrafts([newDraft(1, roles, locations, activeId)])
  }
  if (!member && forId !== null) setForId(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!member) return
    const problem = draftsProblem(drafts)
    if (problem) return setError(problem)
    setSaving(true)
    setError("")
    const res = await sendJson(`/api/garage/staff/${member.membershipId}/assignments`, "POST", { assignments: draftsToInput(drafts) })
    setSaving(false)
    if (!res.ok) return setError(res.error ?? "Couldn't add access")
    toast("Access added")
    onDone()
  }

  return (
    <Dialog open={member !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
        <form onSubmit={submit} noValidate>
          <DialogHeader>
            <DialogTitle>Add access for {member?.name ?? member?.email}</DialogTitle>
            <DialogDescription>Give another role, or the same role somewhere else. Their existing access stays as it is.</DialogDescription>
          </DialogHeader>
          <div className="my-4 space-y-4">
            <AssignmentPicker roles={roles} locations={locations} drafts={drafts} onChange={setDrafts} activeId={activeId} idPrefix="access" />
            <FieldError>{error}</FieldError>
          </div>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button type="submit" variant="primary" loading={saving}>Add access</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
