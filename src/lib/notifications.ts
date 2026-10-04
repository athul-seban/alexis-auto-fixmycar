import { prisma } from "@/lib/prisma"

export type NotificationType =
  | "QUOTE_REQUESTED"
  | "QUOTE_RESPONDED"
  | "BOOKING_CREATED"
  | "BOOKING_STATUS_CHANGED"
  | "JOB_RESPONSE_RECEIVED"
  | "JOB_RESPONSE_ACCEPTED"
  | "MESSAGE_RECEIVED"
  | "REVIEW_RECEIVED"
  | "REVIEW_REPLY"
  | "VEHICLE_REMINDER"
  | "GARAGE_STATUS_CHANGED"
  | "BOOKING_REMINDER"

interface NotifyUserInput {
  userId: string
  type: NotificationType
  title: string
  body: string
  link?: string
}

interface NotifyGarageInput {
  garageId: string
  type: NotificationType
  title: string
  body: string
  link?: string
}

export async function notifyUser({ userId, type, title, body, link }: NotifyUserInput) {
  return prisma.notification.create({
    data: { userId, type, title, body, link },
  })
}

export async function notifyGarage({ garageId, type, title, body, link }: NotifyGarageInput) {
  return prisma.notification.create({
    data: { garageId, type, title, body, link },
  })
}
