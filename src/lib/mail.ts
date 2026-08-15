import nodemailer, { type Transporter } from "nodemailer"

const globalForMail = globalThis as unknown as {
  mailTransporter: Transporter | null | undefined
}

function getTransporter(): Transporter | null {
  if (globalForMail.mailTransporter !== undefined) return globalForMail.mailTransporter

  const { EMAIL_SERVER_HOST, EMAIL_SERVER_USER, EMAIL_SERVER_PASSWORD, EMAIL_SERVER_PORT } = process.env

  if (!EMAIL_SERVER_HOST || !EMAIL_SERVER_USER || !EMAIL_SERVER_PASSWORD) {
    globalForMail.mailTransporter = null
    return null
  }

  const port = Number(EMAIL_SERVER_PORT) || 587
  const transporter = nodemailer.createTransport({
    host: EMAIL_SERVER_HOST,
    port,
    secure: port === 465,
    auth: { user: EMAIL_SERVER_USER, pass: EMAIL_SERVER_PASSWORD },
  })

  globalForMail.mailTransporter = transporter
  return transporter
}

interface SendMailInput {
  to: string
  subject: string
  html: string
}

export async function sendMail({ to, subject, html }: SendMailInput): Promise<{ success: boolean; skipped?: boolean }> {
  const transporter = getTransporter()

  if (!transporter) {
    console.log(`[mail:dev-fallback] to=${to} subject="${subject}"`)
    return { success: true, skipped: true }
  }

  try {
    await transporter.sendMail({
      from: process.env.EMAIL_FROM ?? "noreply@quotemygarage.com",
      to,
      subject,
      html,
    })
    return { success: true }
  } catch (err) {
    console.error("[mail:send-error]", err)
    return { success: false }
  }
}
