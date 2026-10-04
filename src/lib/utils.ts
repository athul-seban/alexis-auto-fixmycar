import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"
import type { OpeningHours } from "@/types"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(amount)
}

export function formatDate(date: Date | string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(date))
}

export function formatDateShort(date: Date | string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(date))
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

export function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)
}

export function getServiceLabel(service: string): string {
  const labels: Record<string, string> = {
    MOT: "MOT Test",
    FULL_SERVICE: "Full Service",
    INTERIM_SERVICE: "Interim Service",
    MINOR_SERVICE: "Minor Service",
    REPAIR: "Repair",
    DIAGNOSTICS: "Diagnostics",
    TYRES: "Tyres",
    BRAKES: "Brakes",
    CLUTCH: "Clutch",
    CAMBELT: "Cambelt",
    EXHAUST: "Exhaust",
    BATTERY: "Battery",
    WINDSCREEN: "Windscreen",
    AIR_CON: "Air Con Service",
    ELECTRIC_SERVICE: "Electric Vehicle Service",
    OTHER: "Other",
  }
  return labels[service] ?? service
}

export function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    PENDING: "bg-yellow-100 text-yellow-800 dark:bg-yellow-500/15 dark:text-yellow-300",
    CONFIRMED: "bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-300",
    IN_PROGRESS: "bg-purple-100 text-purple-800 dark:bg-purple-500/15 dark:text-purple-300",
    COMPLETED: "bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300",
    CANCELLED: "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300",
    NO_SHOW: "bg-orange-100 text-orange-800 dark:bg-orange-500/15 dark:text-orange-300",
    AWAITING_OUTCOME: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
    SENT: "bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-300",
    ACCEPTED: "bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300",
    REJECTED: "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300",
    DECLINED: "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300",
    EXPIRED: "bg-gray-100 text-gray-800 dark:bg-white/10 dark:text-slate-300",
    APPROVED: "bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300",
    SUSPENDED: "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300",
    OPEN: "bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-300",
    QUOTED: "bg-purple-100 text-purple-800 dark:bg-purple-500/15 dark:text-purple-300",
    BOOKED: "bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300",
  }
  return colors[status] ?? "bg-gray-100 text-gray-800 dark:bg-white/10 dark:text-slate-300"
}

export function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

// For interpolating user-supplied text into HTML (emails).
export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

export function truncate(text: string, length: number): string {
  if (text.length <= length) return text
  return text.slice(0, length) + "..."
}

const DAY_KEYS: (keyof OpeningHours)[] = [
  "sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday",
]

export function getTodayOpeningHoursLabel(openingHours: OpeningHours | null): string {
  if (!openingHours) return "Hours not specified"
  const today = openingHours[DAY_KEYS[new Date().getDay()]]
  if (!today?.open) return "Closed today"
  return `${today.from} – ${today.to}`
}

export function distanceInKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}
