"use client"

import { useSession } from "next-auth/react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { MessageThread } from "@/components/shared/MessageThread"

export type ThreadTarget = { kind: "booking" | "quote"; id: string; garageName: string }

/** A booking/quote conversation with the garage, in a dialog. */
export function ThreadDialog({ target, onClose }: { target: ThreadTarget | null; onClose: () => void }) {
  const { data: session } = useSession()
  const userId = (session?.user as { id?: string } | undefined)?.id

  return (
    <Dialog open={target !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Messages with {target?.garageName}</DialogTitle>
          <DialogDescription>Ask a question or share details about the job.</DialogDescription>
        </DialogHeader>
        {target && userId && (
          <MessageThread key={target.id} currentUserId={userId} {...(target.kind === "quote" ? { quoteId: target.id } : { bookingId: target.id })} />
        )}
      </DialogContent>
    </Dialog>
  )
}
