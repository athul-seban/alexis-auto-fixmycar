"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { FieldLabel, TextInput } from "@/components/ui/form-controls"
import { Skeleton } from "@/components/ui/skeleton"
import { useToast } from "@/components/ui/toast"
import { sendJson, useApi } from "@/hooks/use-api"
import { formatDate } from "@/lib/utils"
import type { SettingStatus } from "@/lib/platform-settings"
import { PageHeader, Panel } from "@/components/garage-portal/shared/PageHeader"

interface Payload {
  settings: SettingStatus[]
}

const SOURCE_LABEL = { saved: "Saved here", env: "From the server's environment", none: "Not set" } as const
const SOURCE_STYLE = {
  saved: "bg-green-100 text-green-900 dark:bg-green-500/20 dark:text-green-200",
  env: "bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-200",
  none: "bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-200",
} as const

function SettingField({ s, onChanged }: { s: SettingStatus; onChanged: () => void }) {
  const { toast } = useToast()
  const [value, setValue] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const id = `setting-${s.key}`

  async function act(promise: ReturnType<typeof sendJson>, done: string) {
    setBusy(true)
    setError("")
    const res = await promise
    setBusy(false)
    if (!res.ok) return setError(res.error ?? "Couldn't save")
    setValue("")
    toast(done)
    onChanged()
  }

  return (
    <div className="py-4 first:pt-0 last:pb-0">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <FieldLabel htmlFor={id} className="!mb-0">
          {s.label} <span className="ml-1 font-mono font-normal">{s.key}</span>
        </FieldLabel>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${SOURCE_STYLE[s.source]}`}>{SOURCE_LABEL[s.source]}</span>
      </div>
      <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">{s.help}</p>
      {s.set && (
        <p className="mb-2 break-all text-sm text-slate-700 dark:text-slate-200">
          Current: <span className="font-mono">{s.preview}</span>
          {s.updatedAt && (
            <span className="text-slate-500 dark:text-slate-400">
              {" "}
              · changed {formatDate(s.updatedAt)}
              {s.updatedBy ? ` by ${s.updatedBy}` : ""}
            </span>
          )}
        </p>
      )}
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="min-w-0 flex-1">
          <TextInput
            id={id}
            type={s.secret ? "password" : "text"}
            autoComplete="off"
            spellCheck={false}
            placeholder={s.set ? "Paste a new value to replace it" : "Paste the value"}
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </div>
        <Button type="button" variant="primary" loading={busy} disabled={value.trim() === ""} onClick={() => act(sendJson("/api/admin/settings", "PUT", { key: s.key, value }), `${s.label} saved`)}>
          Save
        </Button>
        {s.source === "saved" && (
          <Button type="button" variant="outline" disabled={busy} onClick={() => act(sendJson(`/api/admin/settings?key=${s.key}`, "DELETE"), `${s.label} cleared`)}>
            Clear
          </Button>
        )}
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  )
}

function TestDvsa() {
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)

  async function run() {
    setBusy(true)
    setResult(null)
    const res = await sendJson<{ ok: boolean; message: string }>("/api/admin/settings", "POST", { action: "test", target: "dvsa" })
    setBusy(false)
    setResult(res.data && typeof res.data.ok === "boolean" ? res.data : { ok: false, message: res.error ?? "The test couldn't run" })
  }

  return (
    <div className="mt-4 border-t border-slate-100 pt-4 dark:border-white/10">
      <Button type="button" variant="secondary" loading={busy} onClick={run}>
        Test DVSA connection
      </Button>
      <p role="status" className={`mt-2 text-sm ${result ? (result.ok ? "text-green-800 dark:text-green-300" : "text-red-700 dark:text-red-400") : ""}`}>
        {result?.message}
      </p>
    </div>
  )
}

export function AdminSettingsPage() {
  const { data, loading, error, reload } = useApi<Payload>("/api/admin/settings")
  const groups = [...new Set((data?.settings ?? []).map((s) => s.group))]

  return (
    <>
      <PageHeader
        title="Platform settings"
        description="API credentials the whole site uses. Secrets are stored encrypted and can't be read back here, only replaced. A value saved here overrides the server's environment variable."
      />
      {error && !data && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      )}
      {loading && !data ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {groups.map((g) => (
            <section key={g} aria-labelledby={`grp-${g}`}>
              <h2 id={`grp-${g}`} className="mb-3 text-lg font-bold text-slate-900 dark:text-white">
                {g}
              </h2>
              <Panel className="divide-y divide-slate-100 p-4 dark:divide-white/10">
                {(data?.settings ?? [])
                  .filter((s) => s.group === g)
                  .map((s) => (
                    <SettingField key={`${s.key}:${s.updatedAt}:${s.source}`} s={s} onChanged={reload} />
                  ))}
                {g === "DVSA MOT history" && <TestDvsa />}
              </Panel>
            </section>
          ))}
        </div>
      )}
    </>
  )
}
