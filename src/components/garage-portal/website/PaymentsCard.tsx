"use client"

import { useState } from "react"
import { CreditCard } from "lucide-react"
import { Button } from "@/components/ui/button"
import { FieldError, FieldLabel, NativeSelect } from "@/components/ui/form-controls"
import { Switch } from "@/components/ui/switch"
import { useToast } from "@/components/ui/toast"
import { sendJson } from "@/hooks/use-api"
import { Panel } from "@/components/garage-portal/shared/PageHeader"
import type { PaymentSettings } from "@/lib/portal/portal-settings"

const POLICY_LABELS: Record<PaymentSettings["refundPolicy"], string> = {
  UNTIL_24H: "Refund if they cancel 24 hours or more before",
  FULL: "Always refund when they cancel",
  NONE: "Never refund when they cancel",
}

interface PaymentsCardProps {
  payments: PaymentSettings
  /** False when the platform has no Stripe keys: the card explains instead of offering a switch that can't work. */
  available: boolean
  onSaved: () => void
}

/** Take a deposit through Stripe when a customer books on the garage's widget. */
export function PaymentsCard({ payments, available, onSaved }: PaymentsCardProps) {
  const { toast } = useToast()
  const [form, setForm] = useState(payments)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const dirty = JSON.stringify(form) !== JSON.stringify(payments)

  async function save() {
    setSaving(true)
    setError("")
    const res = await sendJson("/api/garage/settings", "PATCH", { payments: form })
    setSaving(false)
    if (!res.ok) return setError(res.error ?? "Couldn't save payment settings")
    toast("Payment settings saved")
    onSaved()
  }

  return (
    <Panel className="mt-6 p-5 sm:p-6">
      <div className="mb-4 flex items-start gap-3">
        <CreditCard className="mt-0.5 h-5 w-5 flex-shrink-0 text-slate-500 dark:text-slate-400" />
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Online deposits</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">Take part of the price up front when a customer books through your widget, so fewer slots go to no-shows.</p>
        </div>
      </div>

      {!available ? (
        <p role="status" className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600 dark:bg-slate-900 dark:text-slate-300">
          Online payments aren&apos;t switched on for the platform yet, so deposits can&apos;t be taken. Check back soon.
        </p>
      ) : (
        <div className="max-w-md space-y-4">
          <label className="flex cursor-pointer items-start gap-3">
            <Switch checked={form.enabled} onCheckedChange={(v) => setForm((f) => ({ ...f, enabled: v }))} aria-label="Take deposits online" />
            <span>
              <span className="block text-sm font-semibold text-slate-900 dark:text-white">Take deposits online</span>
              <span className="block text-xs text-slate-500 dark:text-slate-400">Customers pay by card on Stripe. Bookings with no price are never charged.</span>
            </span>
          </label>
          <div>
            <FieldLabel htmlFor="dep-pct">Deposit (% of the job price)</FieldLabel>
            <NativeSelect id="dep-pct" value={form.depositPercent} onChange={(e) => setForm((f) => ({ ...f, depositPercent: Number(e.target.value) }))} disabled={!form.enabled}>
              {[10, 20, 25, 30, 50, 100].map((p) => (
                <option key={p} value={p}>
                  {p === 100 ? "100% (pay in full)" : `${p}%`}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div>
            <FieldLabel htmlFor="dep-policy">If the customer cancels</FieldLabel>
            <NativeSelect id="dep-policy" value={form.refundPolicy} onChange={(e) => setForm((f) => ({ ...f, refundPolicy: e.target.value as PaymentSettings["refundPolicy"] }))} disabled={!form.enabled}>
              {Object.entries(POLICY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </NativeSelect>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">If you cancel, the customer is always refunded in full.</p>
          </div>
          <FieldError>{error}</FieldError>
          <div className="flex gap-2">
            <Button type="button" variant="primary" size="sm" loading={saving} disabled={!dirty} onClick={save}>
              Save payment settings
            </Button>
            {dirty && (
              <Button type="button" variant="secondary" size="sm" disabled={saving} onClick={() => { setForm(payments); setError("") }}>
                Discard
              </Button>
            )}
          </div>
        </div>
      )}
    </Panel>
  )
}
