import { Star, Shield, Car, MessageSquare, Calendar, CheckCircle, Minus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { formatCurrency, formatDateShort } from "@/lib/utils"
import type { CompareRowConfig } from "@/components/compare/CompareTable"
import type { TrackedJobResponse } from "@/components/post-job/types"

interface BuildRowsOptions {
  jobStatus: string
  acceptingId: string | null
  onAccept: (jobResponseId: string) => void
}

export function buildJobResponseCompareRows(
  responses: TrackedJobResponse[],
  { jobStatus, acceptingId, onAccept }: BuildRowsOptions
): CompareRowConfig<TrackedJobResponse>[] {
  return [
    {
      type: "data",
      key: "rating",
      label: "Garage Rating",
      icon: Star,
      render: (r) => (
        <span>
          <span className="font-bold text-slate-900">{r.garage.averageRating > 0 ? r.garage.averageRating.toFixed(1) : "New"}</span>
          {r.garage.totalReviews > 0 && <span className="text-slate-400"> ({r.garage.totalReviews})</span>}
        </span>
      ),
    },
    {
      type: "data",
      key: "price",
      label: "Total Price",
      highlightMin: true,
      rawValue: (r) => r.price,
      render: (r) => <span className="font-bold">{formatCurrency(r.price)}</span>,
    },
    {
      type: "data",
      key: "labor",
      label: "Labour",
      render: (r) => (r.laborCost != null ? formatCurrency(r.laborCost) : "—"),
    },
    {
      type: "data",
      key: "parts",
      label: "Parts",
      render: (r) => (r.partsCost != null ? formatCurrency(r.partsCost) : "—"),
    },
    {
      type: "data",
      key: "message",
      label: "Notes",
      icon: MessageSquare,
      render: (r) => <span className="text-slate-600">{r.message || "—"}</span>,
    },
    {
      type: "data",
      key: "validUntil",
      label: "Valid Until",
      icon: Calendar,
      render: (r) => (r.validUntil ? formatDateShort(r.validUntil) : "—"),
    },
    {
      type: "data",
      key: "verified",
      label: "Verified",
      icon: Shield,
      render: (r) =>
        r.garage.isVerified ? <CheckCircle className="h-4 w-4 text-green-500" /> : <Minus className="h-4 w-4 text-slate-300" />,
    },
    {
      type: "data",
      key: "mobile",
      label: "Mobile Mechanic",
      icon: Car,
      render: (r) =>
        r.garage.isMobile ? <CheckCircle className="h-4 w-4 text-green-500" /> : <Minus className="h-4 w-4 text-slate-300" />,
    },
    {
      type: "data",
      key: "action",
      label: "",
      render: (r) => {
        if (r.status === "ACCEPTED") {
          return <Badge>Booked</Badge>
        }
        if (jobStatus === "BOOKED" || r.status === "DECLINED") {
          return <span className="text-xs text-slate-400">Not selected</span>
        }
        return (
          <Button
            size="sm"
            className="w-full"
            loading={acceptingId === r.id}
            disabled={acceptingId !== null}
            onClick={() => onAccept(r.id)}
          >
            Accept & Book
          </Button>
        )
      },
    },
  ]
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs font-bold text-green-700 bg-green-100 px-2 py-1 rounded-full">
      <CheckCircle className="h-3 w-3" />
      {children}
    </span>
  )
}

