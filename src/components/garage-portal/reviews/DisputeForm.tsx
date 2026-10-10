"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { FieldError } from "@/components/ui/form-controls"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/toast"
import { sendJson } from "@/hooks/use-api"

/** Ask the moderators to remove a review. Shown inline under the review being disputed. */
export function DisputeForm({ reviewId, onCancel, onSent }: { reviewId: string; onCancel: () => void; onSent: () => void }) {
  const { toast } = useToast()
  const [reason, setReason] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  async function send(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError("")
    const res = await sendJson(`/api/garage/reviews/${reviewId}/dispute`, "POST", { reason })
    setSaving(false)
    if (!res.ok) return setError(res.error ?? "Couldn't send your dispute")
    toast("Dispute sent — we'll review it")
    onSent()
  }

  return (
    <form onSubmit={send} noValidate className="mt-4 space-y-2">
      <Textarea
        aria-label="Why should this review be removed?"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        maxLength={500}
        rows={3}
        placeholder="e.g. This customer never booked with us, or the review contains abuse."
      />
      <p className="text-xs text-slate-500 dark:text-slate-400">A moderator reads this. You can dispute a review once, so give the details that matter.</p>
      <FieldError>{error}</FieldError>
      <div className="flex gap-2">
        <Button type="submit" size="sm" loading={saving} disabled={reason.trim().length < 10}>
          Send dispute
        </Button>
        <Button type="button" size="sm" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
