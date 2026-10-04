"use client"

import { useState } from "react"
import { useSession } from "next-auth/react"
import { KeyRound, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import type { DataColumn } from "@/components/ui/data-table"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { FieldLabel, NativeSelect } from "@/components/ui/form-controls"
import { useToast } from "@/components/ui/toast"
import { sendJson } from "@/hooks/use-api"
import { cn, formatDate, getStatusColor } from "@/lib/utils"
import { StatusPill } from "@/components/garage-portal/shared/StatusPill"
import { ResourceList } from "@/components/admin/ResourceList"

interface AdminUser {
  id: string
  name: string | null
  email: string
  role: string
  joinedAt: string
  suspended: boolean
  bookings: number
}

const muted = "text-slate-500 dark:text-slate-400"
const ROLE_LABELS: Record<string, string> = { OWNER: "Customer", GARAGE: "Garage", ADMIN: "Admin" }

type Confirm = "delete" | "suspend" | "unsuspend" | "reset" | null

function UserDialog({ user, onClose, onChanged }: { user: AdminUser | null; onClose: () => void; onChanged: () => void }) {
  const { toast } = useToast()
  const { data: session } = useSession()
  const [busy, setBusy] = useState(false)
  const [role, setRole] = useState("OWNER")
  const [loadedId, setLoadedId] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<Confirm>(null)

  if (user && user.id !== loadedId) {
    setLoadedId(user.id)
    setRole(user.role)
  }

  const isSelf = user !== null && (session?.user as { id?: string } | undefined)?.id === user.id

  async function call(promise: ReturnType<typeof sendJson>, success: string) {
    setBusy(true)
    const res = await promise
    setBusy(false)
    setConfirm(null)
    if (!res.ok) return toast(res.error ?? "Something went wrong", "error")
    toast(success)
    onClose()
    onChanged()
  }

  async function confirmed() {
    if (!user) return
    if (confirm === "delete") await call(sendJson(`/api/admin/users?userId=${encodeURIComponent(user.id)}`, "DELETE"), "User deleted")
    if (confirm === "suspend") await call(sendJson("/api/admin/users", "PATCH", { userId: user.id, suspended: true }), "User suspended")
    if (confirm === "unsuspend") await call(sendJson("/api/admin/users", "PATCH", { userId: user.id, suspended: false }), "User reinstated")
    if (confirm === "reset") await call(sendJson("/api/admin/users", "POST", { userId: user.id, action: "send_password_reset" }), "Password reset email sent")
  }

  const copy = {
    delete: { title: "Delete this user?", body: "This permanently removes the account. It fails if they have bookings or quotes — suspend them instead.", label: "Delete user", destructive: true },
    suspend: { title: "Suspend this user?", body: "They are signed out and can't log in until reinstated.", label: "Suspend", destructive: true },
    unsuspend: { title: "Reinstate this user?", body: "They will be able to log in again.", label: "Reinstate", destructive: false },
    reset: { title: "Send a password reset email?", body: "They receive a link, valid for one hour, to choose a new password.", label: "Send email", destructive: false },
  } as const

  return (
    <>
      <Dialog open={user !== null} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-w-md">
          {user && (
            <>
              <DialogHeader>
                <DialogTitle className="flex flex-wrap items-center gap-2">
                  {user.name ?? user.email} {user.suspended && <StatusPill status="SUSPENDED" />}
                </DialogTitle>
                <DialogDescription>
                  {user.email} · joined {formatDate(user.joinedAt)} · {user.bookings} booking{user.bookings === 1 ? "" : "s"}
                </DialogDescription>
              </DialogHeader>

              {isSelf && <p className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">This is your own account, so its role can&apos;t be changed and it can&apos;t be suspended or deleted.</p>}

              <div className="mb-5">
                <FieldLabel htmlFor="user-role">Role</FieldLabel>
                <div className="flex gap-2">
                  <div className="min-w-0 flex-1">
                    <NativeSelect id="user-role" value={role} onChange={(e) => setRole(e.target.value)} disabled={isSelf}>
                      {Object.entries(ROLE_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </NativeSelect>
                  </div>
                  <Button
                    variant="primary"
                    disabled={isSelf || role === user.role}
                    loading={busy}
                    onClick={() => call(sendJson("/api/admin/users", "PATCH", { userId: user.id, role }), "Role updated")}
                  >
                    Save
                  </Button>
                </div>
              </div>

              <div className="flex flex-col gap-2 border-t border-slate-100 pt-4 dark:border-white/10">
                <Button variant="secondary" className="justify-start gap-2" onClick={() => setConfirm("reset")}>
                  <KeyRound className="h-4 w-4" /> Send password reset
                </Button>
                <Button variant="secondary" className="justify-start" disabled={isSelf} onClick={() => setConfirm(user.suspended ? "unsuspend" : "suspend")}>
                  {user.suspended ? "Reinstate user" : "Suspend user"}
                </Button>
                <Button variant="secondary" className="justify-start gap-2 text-red-600 dark:text-red-400" disabled={isSelf} onClick={() => setConfirm("delete")}>
                  <Trash2 className="h-4 w-4" /> Delete user
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
      {confirm && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setConfirm(null)}
          title={copy[confirm].title}
          description={copy[confirm].body}
          confirmLabel={copy[confirm].label}
          destructive={copy[confirm].destructive}
          loading={busy}
          onConfirm={confirmed}
        />
      )}
    </>
  )
}

export function AdminUsersPage() {
  const [open, setOpen] = useState<AdminUser | null>(null)

  const columns: DataColumn<AdminUser>[] = [
    {
      id: "name",
      header: "User",
      mobile: "title",
      cell: (u) => (
        <span>
          <span className="font-medium text-slate-900 dark:text-white">{u.name ?? "—"}</span>
          <span className={cn("block break-all text-xs font-normal", muted)}>{u.email}</span>
        </span>
      ),
    },
    { id: "role", header: "Role", className: muted, cell: (u) => ROLE_LABELS[u.role] ?? u.role },
    { id: "bookings", header: "Bookings", className: muted, cell: (u) => u.bookings },
    { id: "joined", header: "Joined", className: muted, cell: (u) => formatDate(u.joinedAt) },
    { id: "status", header: "Status", mobile: "badge", cell: (u) => (u.suspended ? <StatusPill status="SUSPENDED" /> : <span className={cn("inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold", getStatusColor("APPROVED"))}>Active</span>) },
  ]

  return (
    <ResourceList<AdminUser>
      title="Users"
      description="Customers, garage owners and admins."
      caption="Users"
      endpoint="/api/admin/users"
      itemsKey="users"
      columns={columns}
      rowKey={(u) => u.id}
      tabs={{
        param: "role",
        defaultValue: "ALL",
        allValue: "ALL",
        options: [
          { value: "ALL", label: "All" },
          { value: "OWNER", label: "Customers" },
          { value: "GARAGE", label: "Garages" },
          { value: "ADMIN", label: "Admins" },
        ],
      }}
      searchPlaceholder="Search name or email…"
      onRowClick={setOpen}
      rowLabel={(u) => `Manage ${u.name ?? u.email}`}
      emptyTitle="No users"
    >
      {({ reload }) => <UserDialog user={open} onClose={() => setOpen(null)} onChanged={reload} />}
    </ResourceList>
  )
}
