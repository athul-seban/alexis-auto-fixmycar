"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { FieldError } from "@/components/ui/form-controls"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/toast"
import { sendJson } from "@/hooks/use-api"

const MAX = 1000

interface ReplyFormProps {
  reviewId: string
  initial: string
  onCancel: () => void
  onSaved: () => void
}

export function ReplyForm({ reviewId, initial, onCancel, onSaved }: ReplyFormProps) {
  const { toast } = useToast()
  const [text, setText] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const editing = initial !== ""

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!text.trim()) return setError("Write a reply first")
    setSaving(true)
    setError("")
    const res = await sendJson(`/api/garage/reviews/${reviewId}`, "PATCH", { reply: text })
    setSaving(false)
    if (!res.ok) return setError(res.error ?? "Couldn't post your reply")
    toast(editing ? "Reply updated" : "Reply posted")
    onSaved()
  }

  const remove = async () => {
    setSaving(true)
    const res = await sendJson(`/api/garage/reviews/${reviewId}`, "PATCH", { reply: null })
    setSaving(false)
    if (!res.ok) return setError(res.error ?? "Couldn't remove your reply")
    toast("Reply removed")
    onSaved()
  }

  return (
    <form onSubmit={save} noValidate className="mt-4 space-y-2">
      <Textarea
        aria-label="Your public reply"
        placeholder="Thank the customer, or explain what you've done to put things right…"
        rows={3}
        value={text}
        maxLength={MAX}
        onChange={(e) => setText(e.target.value)}
        autoFocus
      />
      <div className="flex items-center justify-between text-xs text-slate-400">
        <span>Visible to everyone on your public listing.</span>
        <span>{text.length}/{MAX}</span>
      </div>
      <FieldError>{error}</FieldError>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" variant="primary" loading={saving}>{editing ? "Update reply" : "Post reply"}</Button>
        <Button type="button" size="sm" variant="secondary" onClick={onCancel} disabled={saving}>Cancel</Button>
        {editing && (
          <Button type="button" size="sm" variant="ghost" className="ml-auto text-red-600 hover:!bg-red-50 hover:!text-red-700 dark:text-red-400 dark:hover:!bg-red-500/10" onClick={remove} disabled={saving}>
            Remove reply
          </Button>
        )}
      </div>
    </form>
  )
}
