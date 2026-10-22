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

### Round 1 feature batch (bug fixes, "Book online", customer emails)

Additive schema changes: `Vehicle.motReminderFor`, `motReminderStage`, `serviceReminderFor`, `serviceReminderStage`;
`JobRequest.targetGarageId` (+ index); `Booking.reviewRequestedAt`, `Booking.marketingOptIn`; new table `EmailSuppression`.

**Order matters.** Prisma selects every column of a model, so new code running against an old database breaks every
query on that model. Always: (1) back up the database, (2) rehearse on a Neon branch of production
(`npx prisma migrate diff --from-url <prod> --to-schema-datamodel prisma/schema.prod.prisma --script` must show only
`ADD COLUMN`, `CREATE TABLE`, `CREATE INDEX`), (3) `npx prisma db push --schema=prisma/schema.prod.prisma`, (4) only then merge
to main. Old code against the new schema is fine, so a revert needs no database change.

After deploy: the first vehicle-reminder run sends one catch-up email to owners whose MOT/service is already inside the
30-day window (it used to send one every day). Legal pages (Admin > Content) stay unpublished until a solicitor-reviewed
text is published; the register, garage-register, post-job and booking forms link to them once they exist.

## Scheduled jobs (Vercel Cron, defined in `vercel.json`)

| Path | Schedule | What |
|---|---|---|
| `/api/cron/booking-reminders` | daily 08:00 UTC | 24-hour email and SMS appointment reminders |
| `/api/cron/reminders` | daily 07:00 UTC | MOT / service-due reminders |

**Hobby plans only allow daily cron jobs** (a more frequent schedule makes the deploy fail), so these run daily. A daily run
reminds everyone whose appointment is before the end of tomorrow (London time), and sends review requests a day after completion. On a **Pro** plan change `booking-reminders` to hourly
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

## Phase 3 additions

Apply the schema first (see "Applying a schema change to production"). All changes are additive: new `Garage` columns
(plan, Stripe customer/subscription, `featuredUntil`, `leadCredits`, response-time averages), `Vehicle.motHistory*`,
`Review` dispute columns, and new tables `PushSubscription`, `LeadCreditTransaction`, `GarageDocument`, `Article`, and
`PlatformSetting` (super-admin credentials; until it exists the app just uses the env vars). After the schema is
applied, promote the first super admin with a single statement (back up first):
`UPDATE "User" SET role = 'SUPER_ADMIN' WHERE email = '<their email>';`

| Variable | Purpose |
|---|---|
| `STRIPE_PRICE_PRO`, `STRIPE_PRICE_PREMIUM` | Stripe recurring Price ids for the paid plans (plans are defined in `src/lib/portal/plans.ts`) |
| `PLANS_ENFORCED` | `true` switches on plan limits and feature gates. Off by default: deploying changes nobody's experience |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Web Push (generate with `npx web-push generate-vapid-keys`) |
| `DVSA_CLIENT_ID`, `DVSA_CLIENT_SECRET`, `DVSA_TOKEN_URL`, `DVSA_API_KEY` | DVSA MOT history lookup (apply to DVSA for credentials). Optional: a super admin can paste these at `/admin/settings` instead (encrypted in the `PlatformSetting` table; a saved value overrides the env var) |
| `SETTINGS_ENCRYPTION_KEY` | Encrypts credentials saved at `/admin/settings`. Falls back to `NEXTAUTH_SECRET`. Don't change it once credentials are saved |
| `BLOB_READ_WRITE_TOKEN` | already required for logos; also stores garage verification documents (as **private** blobs) |

Stripe webhook: add `customer.subscription.created`, `customer.subscription.updated` and `customer.subscription.deleted`
to the existing platform endpoint. Enable the **Customer portal** in Stripe (Settings, Billing) so garages can change
card, switch plan and cancel.

Suggested order: apply the schema, deploy, create the Stripe prices, check the Billing page as a test garage, agree the
plan limits with the client, then set `PLANS_ENFORCED=true`.

## Garage businesses, locations and permissions (phase 1)

Every garage becomes the first location of its own **business**, and access is decided by roles and permissions instead of
by "this login owns this garage". Nothing changes for existing garages: after the backfill each owner is the business's
Owner with every permission. New staff, extra locations and websites come in later phases (behind flags).

Additive schema changes (both schema files): new tables `Organisation`, `Role`, `Membership`, `RoleAssignment`,
`StaffInvite`; new columns `Garage.organisationId`, `Message.fromGarage`, `LeadCreditTransaction.organisationId`,
`AuditLog.organisationId`, `Technician.userId`. **Nothing is dropped or altered**; `Garage.userId` and every billing
column are untouched (billing is mirrored onto the business, the garage columns stay the source of truth).

Order (same rule as above: schema first, then code; old code against the new schema is fine, so a revert needs no database change):

1. **Back up** (Neon branch or snapshot).
2. **Rehearse on a Neon branch of production**: `npx prisma migrate diff --from-url <branch-url> --to-schema-datamodel prisma/schema.prod.prisma --script`
   must show only `CREATE TABLE`, `ALTER TABLE ... ADD COLUMN` and `CREATE INDEX`. Run steps 3 to 6 against the branch first.
3. `npx prisma db push --schema=prisma/schema.prod.prisma` (never `--accept-data-loss`). It must not prompt.
4. Deploy the code. Until the backfill runs, every garage still works through the legacy path (its login is the owner).
5. Backfill. The script uses whichever Prisma client was generated last, so generate the Postgres one first and, afterwards,
   the local one again:
   ```bash
   npx prisma generate --schema=prisma/schema.prod.prisma
   npm run db:backfill-orgs -- --dry-run     # read the counts: one business per garage
   npm run db:backfill-orgs
   npm run db:backfill-orgs -- --verify      # must print "OK: every invariant holds"
   npx prisma generate                        # back to the local (sqlite) client
   ```
   It is idempotent. Run it once more after the deploy has been live for a while to catch garages registered in between.
6. Smoke test as the demo/owner login: dashboard, bookings, messages, billing, a profile edit and a logo upload.

Fixed in the same release (security): a revoked or suspended session used to see everyone's notifications and could touch
any vehicle by id; the language switcher was an open redirect; uploads trusted the browser's file type; changing or
resetting a password now signs out every session; sign-in no longer reveals which emails exist.
