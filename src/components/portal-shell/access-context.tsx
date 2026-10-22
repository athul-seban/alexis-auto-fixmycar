"use client"

import { createContext, useContext, useMemo } from "react"
import type { PermissionKey } from "@/lib/org/permissions"
import { meets, type PortalAccess } from "@/components/portal-shell/nav-filter"
import type { NavRequirement } from "@/components/portal-shell/nav"

// What the signed-in person can do at the active location, for pages to hide or disable what they can't use. The shell
// fills it from the server (the same keys the API routes check). It never grants anything: a hidden button that is
// forced through still meets a 403.

export interface PortalLocation {
  id: string
  name: string
  city: string
  status: string
}

export interface PortalAccessValue extends PortalAccess {
  can: (requirement: NavRequirement) => boolean
  locations: PortalLocation[]
  activeLocationId: string | null
  organisationName: string | null
}

// Outside the shell (a page rendered on its own, a component test) everything shows; the server still decides.
const OPEN: PortalAccessValue = {
  permissions: [],
  features: { staff: true, locations: true, sites: true },
  isOwner: false,
  can: () => true,
  locations: [],
  activeLocationId: null,
  organisationName: null,
}

const Context = createContext<PortalAccessValue>(OPEN)

export function PortalAccessProvider({
  access,
  locations,
  activeLocationId,
  organisationName,
  children,
}: {
  access: PortalAccess | undefined
  locations: PortalLocation[]
  activeLocationId: string | null
  organisationName: string | null
  children: React.ReactNode
}) {
  const value = useMemo<PortalAccessValue>(
    () => (access ? { ...access, can: (r) => meets(access.permissions, r), locations, activeLocationId, organisationName } : { ...OPEN, locations, activeLocationId, organisationName }),
    [access, locations, activeLocationId, organisationName]
  )
  return <Context.Provider value={value}>{children}</Context.Provider>
}

export const usePortalAccess = (): PortalAccessValue => useContext(Context)

/** Shorthand: `can("bookings.manage")` or `can({ anyOf: [...] })`. */
export function useCan(): (requirement: NavRequirement | PermissionKey) => boolean {
  return useContext(Context).can
}

/** Renders its children only for people who hold the permission (or any of several). */
export function Can({ permission, children, fallback = null }: { permission: NavRequirement; children: React.ReactNode; fallback?: React.ReactNode }) {
  return <>{useContext(Context).can(permission) ? children : fallback}</>
}
