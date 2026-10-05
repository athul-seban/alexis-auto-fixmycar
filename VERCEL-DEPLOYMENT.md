# Deploying Quote My Garage on Vercel

The app is deployed as the Vercel project **quotemygarage** (see `.vercel/project.json`) against a **Postgres** database.
`vercel.json` builds with `prisma generate --schema=prisma/schema.prod.prisma`. (`AWS-DEPLOYMENT.md` is an older
App Runner plan and no longer describes how this is hosted.)

## What a deploy does and doesn't do

- It builds the app and generates the Prisma client for the production schema.
- It does **not** change the database. There is no `prisma/migrations` folder; schema changes are applied by hand with
  `prisma db push` (below). Deploy code that needs new columns **after** the push, and make pushes additive.

## Environment variables (Vercel → Project → Settings → Environment Variables)

| Variable | Needed for |
|---|---|
| `DATABASE_URL` | Postgres connection string (use the pooled one on serverless) |
| `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `NEXT_PUBLIC_APP_URL` | auth and absolute links in emails |
| `CRON_SECRET` | protects the cron routes; Vercel sends it automatically |
| `EMAIL_SERVER_*`, `EMAIL_FROM` | email (without them mail is only logged) |
| `BLOB_READ_WRITE_TOKEN` | logo/photo uploads |
| `IP_HASH_SECRET` | hashing visitor IPs for the widget limits (falls back to `NEXTAUTH_SECRET`) |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | optional: online deposits |
| `STRIPE_CONNECT_WEBHOOK_SECRET` | optional: signing secret of the webhook endpoint that listens to connected accounts |
| `PLATFORM_FEE_PERCENT` | optional: commission taken from each deposit, 0–30 (default 0) |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` (or `TWILIO_MESSAGING_SERVICE_SID`) | optional: text messages |

`TRUSTED_PROXY_HOPS` is **not** needed on Vercel: the client IP comes from `x-vercel-forwarded-for`, which clients can't spoof.

## Applying a schema change to production

1. **Back up first** (Vercel Postgres/Neon: create a branch or snapshot).
2. From `FixMyCar/`, with the production `DATABASE_URL` in your shell:
   ```bash
   npx prisma db push --schema=prisma/schema.prod.prisma
   ```
   Read what it prints. It should only add things. Prisma warns when adding a unique constraint; that is fine for the
   new, all-empty columns in this release (`Booking.manageToken`, `Booking.stripeSessionId`,
   `Booking.invoiceNumber` with `garageId`). **Stop and investigate if it asks to drop or alter existing data.**
3. Deploy the code.
4. Once, backfill older bookings: `npm run db:backfill -- --dry-run`, then `npm run db:backfill`.

Changes in this release (all additive or relaxing): `Booking.ownerId`/`vehicleId` become optional; `Review.ownerId`
becomes optional; new `Booking` columns (portal fields, `manageToken`, `reminderSentAt`, payment, SMS, invoice);
`User.smsOptIn`; `Garage.portalSettings`, `invoiceCounter`, Stripe Connect fields; new tables `Technician`,
`ServicePrice`, `DiaryBlock`, `GarageLead`, `BookingEvent`, `RateLimitHit`, `AuditLog`, `StripeEvent`,
`CustomerNote`.

## Scheduled jobs (Vercel Cron, defined in `vercel.json`)

| Path | Schedule | What |
|---|---|---|
| `/api/cron/booking-reminders` | daily 08:00 UTC | 24-hour email and SMS appointment reminders |
| `/api/cron/reminders` | daily 07:00 UTC | MOT / service-due reminders |

**Hobby plans only allow daily cron jobs** (a more frequent schedule makes the deploy fail), so these run daily. A daily run
reminds everyone whose appointment is in the next 24 hours. On a **Pro** plan change `booking-reminders` to hourly
(`0 * * * *`) so appointments booked later in the day are reminded closer to the time; it is safe to run more often.
Make sure `CRON_SECRET` is set, otherwise the routes answer 401.

## Stripe (optional)

1. Use **test** keys first. Set `STRIPE_SECRET_KEY`.
2. Dashboard → Developers → Webhooks → add `https://<your-domain>/api/stripe/webhook` for
   `checkout.session.completed`, `checkout.session.expired`, `checkout.session.async_payment_succeeded`,
   `checkout.session.async_payment_failed`, `account.updated`; copy the signing secret to `STRIPE_WEBHOOK_SECRET`.
3. Enable **Connect** on the Stripe account (Settings → Connect). Garages connect their own Stripe account from the
   Website page; deposits are paid straight to them minus `PLATFORM_FEE_PERCENT`, and refunds are taken back from them.
4. Add a **second** webhook endpoint with the same URL but "Listen to events on Connected accounts" for
   `account.updated`, and put its signing secret in `STRIPE_CONNECT_WEBHOOK_SECRET`.

## Text messages (optional)

Set the Twilio variables. UK senders should register an alphanumeric sender ID or buy a number first.

## Checklist after the first deploy

- [ ] `/api/cron/booking-reminders` returns 401 without the secret and 200 with `Authorization: Bearer $CRON_SECRET`
- [ ] A test booking on a garage's widget appears in its portal and sends the confirmation email
- [ ] (Stripe) a test-mode deposit goes PENDING → PAID and a cancel refunds it
