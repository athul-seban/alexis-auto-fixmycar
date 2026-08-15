"use client"

import { useState } from "react"
import { Send, XCircle, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"

interface Props {
  jobRequestId: string
  onSent: (jobResponse: any) => void
}

export function RespondToJobForm({ jobRequestId, onSent }: Props) {
  const [open, setOpen] = useState(false)
  const [price, setPrice] = useState("")
  const [laborCost, setLaborCost] = useState("")
  const [partsCost, setPartsCost] = useState("")
  const [message, setMessage] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  if (!open) {
    return (
      <Button size="sm" className="gap-1.5" onClick={() => setOpen(true)}>
        <Send className="h-3.5 w-3.5" />
        Send Quote
      </Button>
    )
  }

  const handleSend = async () => {
    setLoading(true)
    setError("")
    try {
      const res = await fetch(`/api/job-requests/${jobRequestId}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          price: parseFloat(price),
          laborCost: laborCost ? parseFloat(laborCost) : undefined,
          partsCost: partsCost ? parseFloat(partsCost) : undefined,
          message: message || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Failed to send quote")
      onSent(data.jobResponse)
    } catch (err: any) {
      setError(err.message ?? "Failed to send quote")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-2 w-56">
      {error && (
        <div className="flex items-center gap-1.5 text-xs text-red-600">
          <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
          {error}
        </div>
      )}
      <input
        type="number"
        value={price}
        onChange={(e) => setPrice(e.target.value)}
        placeholder="Total price (£)"
        className="h-9 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]"
      />
      <div className="grid grid-cols-2 gap-2">
        <input
          type="number"
          value={laborCost}
          onChange={(e) => setLaborCost(e.target.value)}
          placeholder="Labour (£)"
          className="h-9 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]"
        />
        <input
          type="number"
          value={partsCost}
          onChange={(e) => setPartsCost(e.target.value)}
          placeholder="Parts (£)"
          className="h-9 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]"
        />
      </div>
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Message to customer (optional)"
        rows={2}
        className="px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A5F] resize-none"
      />
      <div className="flex gap-2">
        <Button size="sm" className="flex-1 gap-1" loading={loading} disabled={!price} onClick={handleSend}>
          <Send className="h-3 w-3" />
          Send
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={loading}>
          <XCircle className="h-4 w-4 text-red-400" />
        </Button>
      </div>
    </div>
  )
}
