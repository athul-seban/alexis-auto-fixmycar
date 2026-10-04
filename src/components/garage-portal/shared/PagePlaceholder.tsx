import { Hammer } from "lucide-react"
import { EmptyState } from "@/components/ui/empty-state"
import { PageHeader, Panel } from "@/components/garage-portal/shared/PageHeader"

/** Temporary stand-in while a portal page is built; replaced page by page. */
export function PagePlaceholder({ title, description }: { title: string; description: string }) {
  return (
    <>
      <PageHeader title={title} description={description} />
      <Panel>
        <EmptyState icon={Hammer} title="Coming together" description="This page is being built." />
      </Panel>
    </>
  )
}
