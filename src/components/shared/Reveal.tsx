"use client"

import { useEffect, useRef, useState, type ElementType, type ReactNode } from "react"

/** Fades and lifts its children into view once, the first time they scroll on screen. `delay` staggers siblings (ms). */
export function Reveal({
  children,
  delay = 0,
  as: Tag = "div",
  className = "",
}: {
  children: ReactNode
  delay?: number
  as?: ElementType
  className?: string
}) {
  const ref = useRef<HTMLElement | null>(null)
  const [shown, setShown] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true)
          io.disconnect()
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -40px 0px" },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return (
    <Tag ref={ref} className={`reveal ${shown ? "is-in" : ""} ${className}`} style={{ "--d": `${delay}ms` } as React.CSSProperties}>
      {children}
    </Tag>
  )
}
