import { cn } from "@/lib/utils"

export const DEVELOPER = { name: "Wireframe Solution", url: "https://wireframesolution.com" } as const

/** "Developed by Wireframe Solution" credit, linking to the developer's site. */
export function DevelopedBy({ className, linkClassName }: { className?: string; linkClassName?: string }) {
  return (
    <p className={className}>
      Developed by{" "}
      <a
        href={DEVELOPER.url}
        target="_blank"
        rel="noopener"
        className={cn("font-semibold underline-offset-2 hover:underline", linkClassName)}
      >
        {DEVELOPER.name}
      </a>
    </p>
  )
}
