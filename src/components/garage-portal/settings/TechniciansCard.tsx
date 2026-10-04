"use client"

import { useState } from "react"
import { Pencil, Plus, Trash2, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { FieldError, FieldLabel, TextInput } from "@/components/ui/form-controls"
import { Switch } from "@/components/ui/switch"
import { useToast } from "@/components/ui/toast"
import { sendJson, useApi } from "@/hooks/use-api"
import { cn } from "@/lib/utils"
import { Panel } from "@/components/garage-portal/shared/PageHeader"

interface Technician {
  id: string
  name: string
  email: string | null
  phone: string | null
  color: string
  isActive: boolean
}

const SWATCHES = ["#1E3A5F", "#F97316", "#10B981", "#8B5CF6", "#EF4444", "#0EA5E9", "#EAB308", "#EC4899"]

export function TechniciansCard() {
  const { toast } = useToast()
  const { data, loading, error, reload } = useApi<{ technicians: Technician[] }>("/api/garage/technicians")
  const [editing, setEditing] = useState<Technician | "new" | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const technicians = data?.technicians ?? []

  const toggleActive = async (t: Technician, isActive: boolean) => {
    const res = await sendJson(`/api/garage/technicians/${t.id}`, "PATCH", { isActive })
    if (!res.ok) return toast(res.error ?? "Couldn't update technician", "error")
    reload()
  }

  const remove = async (t: Technician) => {
    const res = await sendJson<{ deactivated: boolean }>(`/api/garage/technicians/${t.id}`, "DELETE")
    setConfirmDelete(null)
    if (!res.ok) return toast(res.error ?? "Couldn't remove technician", "error")
    toast(res.data?.deactivated ? `${t.name} has past bookings, so they were deactivated instead of deleted` : `${t.name} removed`)
    reload()
  }

  return (
    <Panel className="p-5 sm:p-6">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Technicians</h2>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
            Assign bookings to people in your team. Each active technician is one job you can run at the same time.
          </p>
        </div>
        {editing === null && (
          <Button size="sm" variant="primary" className="gap-1.5" onClick={() => setEditing("new")}>
            <Plus className="h-4 w-4" /> Add
          </Button>
        )}
      </div>

      {editing !== null && (
        <TechnicianForm
          key={editing === "new" ? "new" : editing.id}
          technician={editing === "new" ? null : editing}
          onCancel={() => setEditing(null)}
          onSaved={() => { setEditing(null); reload() }}
        />
      )}

      {error && !data ? (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">{error}</p>
      ) : !loading && technicians.length === 0 && editing === null ? (
        <EmptyState icon={Users} title="No technicians yet" description="Add your team to assign bookings and see who's busy in the diary." className="py-8" />
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-white/10">
          {technicians.map((t) => (
            <li key={t.id} className={cn("flex flex-wrap items-center gap-3 py-3", !t.isActive && "opacity-60")}>
              <span aria-hidden className="h-4 w-4 flex-shrink-0 rounded-full" style={{ backgroundColor: t.color }} />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-slate-900 dark:text-white">{t.name}{!t.isActive && <span className="ml-2 text-xs font-normal text-slate-400">inactive</span>}</p>
                {(t.email || t.phone) && <p className="truncate text-xs text-slate-500 dark:text-slate-400">{[t.email, t.phone].filter(Boolean).join(" · ")}</p>}
              </div>
              <Switch checked={t.isActive} onCheckedChange={(v) => toggleActive(t, v)} aria-label={`${t.name} active`} />
              <button type="button" aria-label={`Edit ${t.name}`} onClick={() => setEditing(t)} className="cursor-pointer rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-white">
                <Pencil className="h-4 w-4" />
              </button>
              {confirmDelete === t.id ? (
                <span className="flex items-center gap-2 text-sm">
                  <Button size="sm" variant="destructive" onClick={() => remove(t)}>Remove</Button>
                  <Button size="sm" variant="secondary" onClick={() => setConfirmDelete(null)}>Keep</Button>
                </span>
              ) : (
                <button type="button" aria-label={`Remove ${t.name}`} onClick={() => setConfirmDelete(t.id)} className="cursor-pointer rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10 dark:hover:text-red-400">
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

function TechnicianForm({ technician, onCancel, onSaved }: { technician: Technician | null; onCancel: () => void; onSaved: () => void }) {
  const { toast } = useToast()
  const [name, setName] = useState(technician?.name ?? "")
  const [email, setEmail] = useState(technician?.email ?? "")
  const [phone, setPhone] = useState(technician?.phone ?? "")
  const [color, setColor] = useState(technician?.color ?? SWATCHES[0])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return setError("Enter a name")
    setSaving(true)
    setError("")
    const body = { name: name.trim(), email: email.trim() || null, phone: phone.trim() || null, color }
    const res = technician
      ? await sendJson(`/api/garage/technicians/${technician.id}`, "PATCH", body)
      : await sendJson("/api/garage/technicians", "POST", body)
    setSaving(false)
    if (!res.ok) return setError(res.error ?? "Couldn't save")
    toast(technician ? "Technician updated" : "Technician added")
    onSaved()
  }

  return (
    <form onSubmit={submit} noValidate className="mb-4 space-y-3 rounded-xl bg-slate-50 p-4 dark:bg-white/5">
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <FieldLabel htmlFor="tech-name">Name *</FieldLabel>
          <TextInput id="tech-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoFocus />
        </div>
        <div>
          <FieldLabel htmlFor="tech-email">Email</FieldLabel>
          <TextInput id="tech-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <FieldLabel htmlFor="tech-phone">Phone</FieldLabel>
          <TextInput id="tech-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
      </div>
      <div>
        <p className="mb-1 text-xs font-semibold text-slate-500 dark:text-slate-400">Diary colour</p>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Diary colour">
          {SWATCHES.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={color === c}
              aria-label={c}
              onClick={() => setColor(c)}
              className={cn("h-7 w-7 cursor-pointer rounded-full ring-offset-2 transition-shadow dark:ring-offset-slate-800", color === c ? "ring-2 ring-slate-900 dark:ring-white" : "hover:ring-2 hover:ring-slate-300")}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      </div>
      <FieldError>{error}</FieldError>
      <div className="flex gap-2">
        <Button type="submit" size="sm" variant="primary" loading={saving}>{technician ? "Save" : "Add technician"}</Button>
        <Button type="button" size="sm" variant="secondary" onClick={onCancel} disabled={saving}>Cancel</Button>
      </div>
    </form>
  )
}
