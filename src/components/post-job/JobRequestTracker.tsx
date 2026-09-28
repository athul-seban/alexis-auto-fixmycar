"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Clock, CheckCircle2, PartyPopper, AlertCircle } from "lucide-react"
import { CompareTable } from "@/components/compare/CompareTable"
import { buildJobResponseCompareRows } from "@/components/post-job/jobResponseCompareRows"
import { getServiceLabel } from "@/lib/utils"
import type { TrackedJobRequest } from "@/components/post-job/types"

const STATUS_CONFIG: Record<string, { label: string; icon: typeof Clock; className: string }> = {
  OPEN: { label: "Waiting for quotes…", icon: Clock, className: "bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-500/30" },
  QUOTED: { label: "Quotes received", icon: CheckCircle2, className: "bg-orange-50 dark:bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-200 dark:border-orange-500/30" },
  BOOKED: { label: "Booked!", icon: PartyPopper, className: "bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-400 border-green-200 dark:border-green-500/30" },
  CANCELLED: { label: "Cancelled", icon: AlertCircle, className: "bg-slate-50 dark:bg-white/5 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-white/10" },
}

interface Props {
  jobRequest: TrackedJobRequest
}

export function JobRequestTracker({ jobRequest: initialJobRequest }: Props) {
  const router = useRouter()
  const [jobRequest, setJobRequest] = useState(initialJobRequest)
  const [acceptingId, setAcceptingId] = useState<string | null>(null)
  const [error, setError] = useState("")

  const status = STATUS_CONFIG[jobRequest.status] ?? STATUS_CONFIG.OPEN
  const StatusIcon = status.icon

  const handleAccept = async (jobResponseId: string) => {
    setAcceptingId(jobResponseId)
    setError("")
    try {
      const res = await fetch(`/api/job-requests/track/${jobRequest.token}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobResponseId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Failed to accept quote")
      setJobRequest((prev) => ({
        ...prev,
        status: "BOOKED",
        responses: prev.responses.map((r) =>
          r.id === jobResponseId ? { ...r, status: "ACCEPTED" } : { ...r, status: "DECLINED" }
        ),
      }))
      router.refresh()
    } catch (err: any) {
      setError(err.message ?? "Failed to accept quote")
    } finally {
      setAcceptingId(null)
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className={`flex items-center gap-2.5 px-4 py-3 rounded-xl border mb-6 ${status.className}`}>
        <StatusIcon className="h-5 w-5 flex-shrink-0" />
        <span className="font-semibold text-sm">{status.label}</span>
        {jobRequest.status !== "BOOKED" && (
          <span className="text-sm ml-auto">
            {jobRequest.responses.length} quote{jobRequest.responses.length === 1 ? "" : "s"} so far
          </span>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-lg mb-5 text-sm text-red-700 dark:text-red-400">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}

      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-white/10 p-5 mb-6">
        <h1 className="text-lg font-bold text-slate-900 dark:text-white mb-1">{getServiceLabel(jobRequest.serviceType)}</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">
          {jobRequest.year} {jobRequest.make} {jobRequest.model} · {jobRequest.registration} · {jobRequest.city}, {jobRequest.postcode}
        </p>
        <p className="text-sm text-slate-600 dark:text-slate-300">{jobRequest.description}</p>
      </div>

      {jobRequest.responses.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-white/10">
          <Clock className="h-12 w-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">No quotes yet</h3>
          <p className="text-slate-500 dark:text-slate-400 text-sm">Garages usually respond within a few hours. We&apos;ll email you as quotes arrive.</p>
        </div>
      ) : (
        <CompareTable
          columns={jobRequest.responses.map((r) => ({ id: r.id, data: r }))}
          header={(r) => (
            <div className="flex items-start gap-3">
              {r.garage.logo ? (
                <img src={r.garage.logo} alt={r.garage.name} className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
              ) : (
                <div className="w-10 h-10 rounded-lg bg-[#1E3A5F] flex items-center justify-center text-white font-bold text-xs flex-shrink-0">
                  {r.garage.name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="font-bold text-slate-900 dark:text-white text-sm truncate">{r.garage.name}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{r.garage.city}</p>
              </div>
            </div>
          )}
          rows={buildJobResponseCompareRows(jobRequest.responses, {
            jobStatus: jobRequest.status,
            acceptingId,
            onAccept: handleAccept,
          })}
        />
      )}
    </div>
  )
}
