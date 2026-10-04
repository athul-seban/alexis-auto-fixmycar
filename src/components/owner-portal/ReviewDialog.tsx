"use client"

import { useState } from "react"
import { Star } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { FieldError } from "@/components/ui/form-controls"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/toast"
import { sendJson } from "@/hooks/use-api"
import { cn } from "@/lib/utils"

interface ReviewDialogProps {
  bookingId: string | null
  garageName?: string
  onClose: () => void
  onSubmitted: () => void
}

export function ReviewDialog({ bookingId, garageName, onClose, onSubmitted }: ReviewDialogProps) {
  const { toast } = useToast()
  const [rating, setRating] = useState(5)
  const [comment, setComment] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  async function submit() {
    if (comment.trim().length < 10) return setError("Please write at least 10 characters")
    setBusy(true)
    setError("")
    const res = await sendJson("/api/reviews", "POST", { bookingId, rating, comment })
    setBusy(false)
    if (!res.ok) return setError(res.error ?? "Failed to submit review")
    toast("Thanks — your review is live")
    setComment("")
    setRating(5)
    onSubmitted()
  }

  return (
    <Dialog open={bookingId !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Leave a review</DialogTitle>
          <DialogDescription>{garageName ? `How was your visit to ${garageName}?` : "How was your experience?"}</DialogDescription>
        </DialogHeader>
        <div role="radiogroup" aria-label="Rating" className="mb-4 flex gap-1">
          {[1, 2, 3, 4, 5].map((i) => (
            <button
              key={i}
              type="button"
              role="radio"
              aria-checked={i === rating}
              aria-label={`${i} star${i === 1 ? "" : "s"}`}
              onClick={() => setRating(i)}
              className="cursor-pointer rounded p-1"
            >
              <Star className={cn("h-8 w-8", i <= rating ? "fill-yellow-400 text-yellow-400" : "text-gray-200 dark:text-slate-700")} />
            </button>
          ))}
        </div>
        <Textarea rows={4} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Tell others what it was like…" aria-label="Your review" maxLength={2000} />
        <FieldError>{error}</FieldError>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy} onClick={submit}>
            Submit review
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
