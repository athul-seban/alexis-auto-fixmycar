// How the business's own activity is worded on its Activity page. Actions not listed here are shown as written, so a
// new kind of entry is never hidden.

const LABELS: Record<string, string> = {
  ROLE_CREATED: "Created a role",
  ROLE_UPDATED: "Changed a role",
  ROLE_DELETED: "Deleted a role",
  ROLE_ENABLED: "Switched on a role",
  ROLE_DISABLED: "Switched off a role",
  STAFF_INVITED: "Invited someone",
  STAFF_INVITE_REVOKED: "Cancelled an invitation",
  STAFF_JOINED: "Joined the team",
  STAFF_ACCESS_CHANGED: "Changed someone's access",
  STAFF_SUSPENDED: "Suspended someone",
  STAFF_REINSTATED: "Reinstated someone",
  STAFF_REMOVED: "Removed someone",
  LOCATION_ADDED: "Added a location",
  LOCATION_UPDATED: "Updated a location",
  LOCATION_ARCHIVED: "Archived a location",
  LOCATION_RESTORED: "Restored a location",
  BUSINESS_UPDATED: "Updated the business details",
  SITE_ADDRESS_CHANGED: "Changed the website address",
  SITE_SUBMITTED: "Sent the website for review",
  SITE_PUBLISHED: "Published the website",
  SITE_UNPUBLISHED: "Took the website offline",
  SITE_ROLLED_BACK: "Rolled the website back",
  SITE_APPROVED: "Website approved by Quote My Garage",
  SITE_REJECTED: "Website needs changes",
  SITE_DISABLED: "Website switched off by Quote My Garage",
  SITE_ENABLED: "Website switched back on by Quote My Garage",
}

export function auditLabel(action: string): string {
  return LABELS[action] ?? action.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase())
}
