"use client"

import { useState, useEffect, useRef } from "react"
import { Send, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface MessageItem {
  id: string
  body: string
  createdAt: string
  sender: { id: string; name: string | null; role: string }
}

interface Props {
  quoteId?: string
  bookingId?: string
  currentUserId: string
}

export function MessageThread({ quoteId, bookingId, currentUserId }: Props) {
  const [messages, setMessages] = useState<MessageItem[]>([])
  const [loading, setLoading] = useState(true)
  const [body, setBody] = useState("")
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  const query = quoteId ? `quoteId=${quoteId}` : `bookingId=${bookingId}`

  const load = () => {
    fetch(`/api/messages?${query}`)
      .then((res) => res.json())
      .then((data) => setMessages(data.messages ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteId, bookingId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages.length])

  const handleSend = async () => {
    if (!body.trim()) return
    setSending(true)
    try {
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quoteId, bookingId, body }),
      })
      const data = await res.json()
      if (res.ok) {
        setMessages((prev) => [...prev, data.message])
        setBody("")
      }
    } finally {
      setSending(false)
    }
  }

  if (loading) {
    return (
      <div className="py-6 flex justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-slate-300" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="max-h-64 overflow-y-auto flex flex-col gap-2 pr-1">
        {messages.length === 0 ? (
          <p className="text-xs text-slate-500 dark:text-slate-400 text-center py-4">No messages yet — say hello.</p>
        ) : (
          messages.map((m) => {
            const isMine = m.sender.id === currentUserId
            return (
              <div key={m.id} className={cn("flex", isMine ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[75%] rounded-2xl px-3 py-2 text-sm",
                    isMine
                      ? "bg-[#1E3A5F] text-white rounded-br-sm"
                      : "bg-slate-100 text-slate-800 rounded-bl-sm dark:bg-slate-700 dark:text-slate-100"
                  )}
                >
                  {m.body}
                  <div className={cn("text-[10px] mt-1", isMine ? "text-blue-200" : "text-slate-400 dark:text-slate-300")}>
                    {new Date(m.createdAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </div>
                </div>
              </div>
            )
          })
        )}
        <div ref={bottomRef} />
      </div>
      <div className="flex gap-2">
        <input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault()
              handleSend()
            }
          }}
          placeholder="Type a message..."
          className="flex-1 h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:placeholder:text-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]"
        />
        <Button size="sm" onClick={handleSend} loading={sending} disabled={!body.trim()}>
          <Send className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}
