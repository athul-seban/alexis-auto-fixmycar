# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

"Quote My Garage" (package name `quotemygarage`) — a Next.js 16 / React 19 App Router marketplace connecting vehicle owners with garages for repair quotes and bookings. Repo root for this app is `FixMyCar/` (there is no repo-root README; this is the only sub-project in the workspace).

## Commands

Run all commands from `FixMyCar/`.

```bash
npm run dev            # start dev server (localhost:3000)
npm run build           # production build
npm run lint             # eslint .
npm test                 # vitest run (see "Tests" below)
npm run test:e2e         # Playwright browser tests (desktop + mobile) against the dev server and seeded data

npm run db:push          # push Prisma schema to DB without a migration (used for local sqlite dev)
npm run db:generate      # regenerate Prisma client after schema changes
npm run db:seed          # run prisma/seed.ts (tsx) — also seeds the garage-portal demo data
npm run db:backfill      # upgrade pre-portal bookings (add `-- --dry-run` to preview); idempotent
npm run db:backfill-orgs # make every garage the first location of its own business (`-- --dry-run`, `-- --verify`, `-- --sync-billing`); idempotent
npm run db:studio        # open Prisma Studio
```

There is no `prisma/migrations` folder (don't use `db:migrate`). On Windows, `prisma generate`/`db push` fail with EPERM while a dev server holds the query-engine DLL — stop the dev server first.

### Tests

`npm test` runs vitest. `vitest.global-setup.ts` points `DATABASE_URL` at an isolated, freshly-pushed `prisma/test.db`, so route/service tests never touch `dev.db`. Files run in parallel against that one DB: tag fixtures with a per-file `PREFIX` (**unique across files**, and never the start of another's: `cleanupPrefix` deletes everything under it, and a clash made two files wipe each other's rows mid-run; `architecture.test.ts` checks) and use `src/test/fixtures.ts` (`makeGarage`, `makeLocation`, `makeStaff`, `makeOwner`, `makeWalkInBooking`, `cleanupPrefix`, and `areaFor(prefix)` — job matching is by city/postcode, so files must not share an area). `makeGarage` builds a full business (Organisation + system roles + the owner's Owner membership); pass `legacy: true` for a garage that predates businesses. **Never count or scan whole tables in a test** (other files add rows in parallel): scope to your own rows, e.g. `backfillOrganisations({ garageIds })`. Dates in tests: pass an explicit `now` instead of using the real clock. CI runs lint, tests and build.

## Architecture essentials

Pages: `/dashboard` (OWNER), `/garage-dashboard` (GARAGE), `/admin` (ADMIN, SUPER_ADMIN). The detail for each area lives in **`docs/claude-reference.md`**, which is *not* auto-loaded: read the matching section before changing that area (roles and auth; garage businesses, locations, staff, billing and permissions in `src/lib/org/*`; hardening conventions; business websites on subdomains; garage portal and booking widget; admin and customer portals; Stripe deposits and Connect; SMS; rate limiting and audit; Phase 3 plans, ranking, messaging, push, DVSA).

- **Local DB is SQLite** (`prisma/schema.prisma`, `prisma/dev.db`); **production is Postgres** (`prisma/schema.prod.prisma`). List-like Garage fields are JSON strings parsed in `src/lib/garage-mapper.ts`. Schema changes must stay additive (`npm run schema:safety`) and are applied with `prisma db push --schema=prisma/schema.prod.prisma` (a deploy never changes the database; see `VERCEL-DEPLOYMENT.md`).
- **Roles** are `OWNER | GARAGE | ADMIN | SUPER_ADMIN`. Use `isAdmin()` / `isSuperAdmin()` (`src/lib/roles.ts`), never `role === "ADMIN"` (it locks out super admins). `proxy.ts` gates pages by `token.role` but does **no** authorisation on `/api/*`: every `/api/admin/*` handler starts with `requireAdmin()` (`{ superOnly: true }` only for platform settings and garage invites), customer routes use `requireSession()`, garage routes use `withGarage(label, handler, { permission })`.
- **A revoked token yields no session** (`getServerSession()` is `null`). Where a user id goes into a Prisma `where`, use `requireSession()`: an `undefined` filter is silently dropped and matches every row.
- **A garage is a business (`Organisation`) with locations (`Garage` rows).** Never write `prisma.garage.findUnique({ where: { userId } })`: use `resolveGarageAccess()` / `withGarage()`. `src/lib/org/architecture.test.ts` pins every route's permission (a new `withGarage` route, or one under `app/api/garage/site/**`, must be added to its snapshot). Create garages only through `createBusiness()`.
- **Billing belongs to the business**: decide from `getBilling(garageId)`, never `garage.plan` / `garage.leadCredits`; write through `billing.ts`; in tests use `setBilling()` from `src/test/fixtures.ts`. Plans aren't enforced until `PLANS_ENFORCED=true`.
- **Bookings** are created and changed only through `src/lib/portal/booking-service.ts` (never `prisma.booking.create` elsewhere). Times are Europe/London via `src/lib/portal/tz.ts` (never `setHours` or `T23:59:59Z`). Walk-in and widget bookings have no account (`ownerId`/`vehicleId` are nullable).
- **Two request flows stay separate**: the authenticated `Quote` -> `Booking` flow and the guest `JobRequest` -> `JobResponse` flow (token tracking URL at `/post-job/track/[token]`). Different models and routes, though both end in a `Booking`.
- **Conventions**: no `any` in production code (use `errorCode` / `errorMessage` / `isAbortError` from `src/lib/errors.ts`); rate-limit public reads and writes that email someone (`limitByIp` / `limitByKey`); images go through `<RemoteImage>` and hosts are added in `next.config.js` `IMAGE_HOSTS`; every top-level page needs a title and indexing rule; lists use `DataTable`; feature flags are `ORG_FEATURES=staff,locations,sites` (or `all`), and in production nothing is on unless set.
- **Business sites on subdomains** (`sites` flag): never set a cookie `Domain`; `app/sites/[label]/*` handlers must be `export const dynamic = "force-dynamic"`; call `invalidateSite` / `invalidateSiteForGarage` after anything that changes what a site shows; any inbound `x-qmg-site` header is forged (the proxy alone sets it).
- **Mail has a dev fallback**: without `EMAIL_SERVER_*`, `sendMail` just logs `[mail:dev-fallback]`. That is the expected local state, not a bug.

### Other notes

- `src/agent.ts` is a legacy stub (`export {}`) — not part of the marketplace app, safe to ignore.
- `next.config.ts` is intentionally an empty stub; the real Next.js config is `next.config.js`.
- Path alias `@/*` maps to `./src/*` (see `tsconfig.json`); route/page files under `app/` import from `src/` via this alias.
- **Hosting is Vercel** (project `quotemygarage`) with Postgres; see `VERCEL-DEPLOYMENT.md` for env vars, applying schema changes (`prisma db push --schema=prisma/schema.prod.prisma` — a deploy never changes the database) and the cron jobs in `vercel.json`. `AWS-DEPLOYMENT.md` is an older plan, kept for reference only.


<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

