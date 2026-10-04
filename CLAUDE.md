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
npm run db:studio        # open Prisma Studio
```

There is no `prisma/migrations` folder (don't use `db:migrate`). On Windows, `prisma generate`/`db push` fail with EPERM while a dev server holds the query-engine DLL — stop the dev server first.

### Tests

`npm test` runs vitest. `vitest.global-setup.ts` points `DATABASE_URL` at an isolated, freshly-pushed `prisma/test.db`, so route/service tests never touch `dev.db`. Files run in parallel against that one DB: tag fixtures with a per-file `PREFIX` and use `src/test/fixtures.ts` (`makeGarage`, `makeOwner`, `makeWalkInBooking`, `cleanupPrefix`, and `areaFor(prefix)` — job matching is by city/postcode, so files must not share an area). CI runs lint, tests and build.

## Architecture

### Local DB is SQLite; production is Postgres

`prisma/schema.prisma` hardcodes `provider = "sqlite"` for local dev (`prisma/dev.db`, gitignored). `.env.example` and `AWS-DEPLOYMENT.md`, however, configure `DATABASE_URL` for AWS RDS **PostgreSQL**. Because SQLite has no native array/JSON type, list-like Garage fields (`services`, `images`) and `openingHours` are stored as JSON-encoded strings and parsed at the application layer via `src/lib/garage-mapper.ts` (`parseServiceList`, `parseImageList`, `parseOpeningHours`). If ever deploying against real Postgres, the schema provider needs to be switched deliberately — don't assume the two are interchangeable as-is.

### Three roles, enforced at the proxy layer

`User.role` is one of `OWNER | GARAGE | ADMIN`. `proxy.ts` (the Next 16 name for middleware) uses `withAuth` (NextAuth) to gate `/dashboard/*` (OWNER), `/garage-dashboard/*` (GARAGE), and `/admin/*` (ADMIN) by checking `token.role`, redirecting to `/login?error=unauthorized` on mismatch. API routes re-check `session.user.role` themselves (see `app/api/job-requests/route.ts` GET handler) — the proxy does not protect `/api/*`, so any new API route touching role-restricted data must do its own `getServerSession(authOptions)` + role check.

Auth config lives in `src/lib/auth.ts`: JWT session strategy, Google OAuth + credentials (bcrypt-hashed password) providers, `PrismaAdapter`. Role and user id are threaded through via the `jwt`/`session` callbacks onto `token`/`session.user`.

### Two parallel request flows

1. **Authenticated quote flow**: a logged-in OWNER picks a vehicle + garage and requests a `Quote` (`app/api/quotes/route.ts`), which a garage can turn into a `Booking`.
2. **Guest job-request flow** (no login required): a visitor posts a `JobRequest` (`app/api/job-requests/route.ts`) with guest contact info; the request gets a random `token` (crypto.randomBytes) used to build a guestaccessible tracking URL at `/post-job/track/[token]`. `src/lib/job-matching.ts` matches the request to nearby garages by city/postcode prefix + `serviceType` membership in the garage's services list, and emails matched garages (`sendMail`) plus a confirmation to the guest. Garages respond with a `JobResponse`; the guest accepts one via `app/api/job-requests/track/[token]/accept/route.ts`, which becomes a `Booking`.

Keep these two flows (`Quote`/`Booking` vs `JobRequest`/`JobResponse`) distinct — they are separate Prisma models with separate routes and are not interchangeable, even though both end in a `Booking`.

### Garage portal (`/garage-dashboard/*`) and booking widget

Garages use a multi-page portal: Dashboard, Diary, Bookings, Reviews, Profile, Website, Pricing, Enquiries, plus Insights and Settings. `app/garage-dashboard/layout.tsx` provides the sidebar shell (no marketing Header/Footer); pages live in `app/garage-dashboard/*` and their UI in `src/components/garage-portal/*`. The old `/garage-dashboard?booking=ID` / `?quote=ID` notification links are redirected by the portal root page (`legacyGarageRedirect`).

- **API**: all garage endpoints are `app/api/garage/*`, wrapped in `withGarage()` (`src/lib/garage-auth.ts`). It re-checks the DB on every call (the JWT role can be stale), gives suspended garages read-only access (`{ write: true }` routes 403), and maps `BookingError`/zod errors to JSON. Middleware does not protect `/api/*`.
- **One booking service** (`src/lib/portal/booking-service.ts`): `createBooking`, `transitionBooking` (rules in `booking-status.ts`), `rescheduleBooking`, `findOverlaps`, `acceptJobResponse`. Every booking path (owner, garage, widget, guest job accept) goes through it. Don't write `prisma.booking.create` elsewhere.
- **Walk-in/widget customers have no account**: `Booking.ownerId`/`vehicleId` are nullable; the portal reads only the snapshot columns (`customerName`, `vrm`, `vehicleMake`…), never joins owner/vehicle. Invariant: `ownerId != null ⇒ vehicleId != null`. `onDelete: Restrict` on both is deliberate.
- **Sources**: `Booking.source` ∈ MARKETPLACE | QUOTE | JOB_REQUEST | WIDGET | DIRECT. KPI definitions (created/attended/FIV/no-show) are documented at the top of `src/lib/portal/kpi.ts`.
- **Times are Europe/London**: use `src/lib/portal/tz.ts` (civil `YYYY-MM-DD` dates → half-open UTC ranges). Never `setHours` or `T23:59:59Z`.
- **Search is cross-DB**: SQLite's client has no `mode: "insensitive"`, so bookings store a lower-cased `searchText` and a normalised `vrm`.
- **Public widget** (`/widget/[slug]`, `/api/widget/[slug]/*`): no auth; 404 unless the garage is APPROVED and `portalSettings.widget.enabled`. Abuse limits are counted from the `Booking` table (per email, per hashed IP, per garage per hour), plus a honeypot. `next.config.js` allows framing for `/widget/*` only; everything else is `SAMEORIGIN`.
- **No double-booking**: customer-facing/capacity-respecting creation passes `checkAvailability: true` to `createBooking`, which re-checks the slot inside the transaction under a per-garage row lock (`lockGarage`); reschedules do the same. Bookings with only a placeholder time (`timeConfirmed = false`) don't hold capacity.
- Client IP for the widget's per-IP limit comes from `clientIp()` (`ip-hash.ts`): Vercel's header, else `X-Forwarded-For` honouring `TRUSTED_PROXY_HOPS`. Behind CloudFront/App Runner set that env var or the limit is spoofable.
- Garage-facing emails respect the toggles in Settings via `emailGarage()`.
- Demo data: `npx tsx prisma/seed-garage-portal.ts` (delete-and-recreate; login `premier@quotemygarage.dev` / `garage123`).

### Admin portal (`/admin/*`) and customer portal (`/dashboard/*`)

All three roles share one shell, `src/components/portal-shell/` (`PortalShell`, `Sidebar`, `Topbar`, nav definitions in `nav.ts`). Layouts pass a portal id (`garage | admin | owner`) because nav objects hold icon functions and can't cross the server/client boundary; sidebar "needs attention" badges come from `src/lib/portal/nav-badges.ts`. Garage-portal keyboard shortcuts (`g` then a letter, `/`, `?`) are declared per nav item.

- **Tables are responsive by construction**: use `DataTable` (`src/components/ui/data-table.tsx`). Below `md` each row becomes a card (columns declare `mobile: title | badge | detail | actions | hidden`), sorting becomes a select, and rows can be selectable for bulk actions. Don't hand-roll `<table>` for lists.
- Admin lists use `ResourceList` (tabs + search + pagination in the URL). Admin APIs page in the database when there is no text search; search stays in memory because SQLite and Postgres disagree on case-insensitive `contains`.
- Garage approval checks `garageReadiness()` (`readiness.ts`); approving an incomplete profile needs `force: true`. Garages are notified of status changes.
- `/admin/widgets` flags repeat widget visitors (same hashed IP / email 3+ times in 24h).
- Customers: `/dashboard/{bookings,quotes,vehicles,messages,reviews,settings}`. Account APIs: `/api/account`, `/api/account/change-password` (shared logic in `src/lib/change-password.ts`).

### Customer manage link, reminders and audit trail

Every booking gets a `manageToken` (128-bit). Emails link to `/booking/[token]`, a public page (noindex, no-referrer) backed by `/api/booking/[token]`: view, cancel (`transitionBooking` with `actor: { role: "OWNER", viaToken: true }`) and review (`review-service.ts`, which also serves signed-in customers; `Review.ownerId` is nullable). `GET /api/cron/booking-reminders` (CRON_SECRET) sends 24h reminders once each (`reminderSentAt` claim). `BookingEvent` is an append-only history written by the booking service and shown as the drawer timeline; the job sheet prints at `/garage-dashboard/bookings/[id]/job-sheet`.

### Rate limiting, audit log and accessibility

- `src/lib/rate-limit.ts`: DB-backed (`RateLimitHit`, no in-memory state, so it holds across instances). `limitByIp(req.headers, name, limit, windowMs)` returns a ready 429 or null; unknown and loopback IPs are skipped. Applied to sign-in, register, forgot/reset password, public job requests and manage-link POSTs. Behind a proxy set `TRUSTED_PROXY_HOPS` or per-IP limits are spoofable (see above).
- `src/lib/audit.ts`: `audit(session, { action, targetType, targetId, detail })` after every admin mutation (never throws). Browse at `/admin/audit`.
- Accessibility is tested: `e2e/a11y.spec.ts` runs axe (WCAG 2.1 A/AA) on the main pages at desktop and phone size. Rules of thumb: text colours need 4.5:1 (use `text-slate-500` not `-400` on white; `#C2410C` for orange text on light backgrounds, dark text on orange buttons), icon-only buttons need `aria-label`, list filters use `FilterTabs` (not ARIA tabs), full-page forms need a `main` landmark.
- CI (`.github/workflows/ci.yml`): `build` (lint, vitest, build), `e2e` (seeded SQLite + Playwright), and `postgres` (same vitest suite against Postgres with `schema.prod.prisma`; non-blocking until first seen green).

### SEO

Public garage pages emit real metadata, canonical URL and `AutoRepair` JSON-LD (`src/lib/seo.ts`); `app/sitemap.ts` and `app/robots.ts` list approved garages and block portals/APIs. All portals, the widget and token pages send `noindex`.

### Mail has a dev fallback

`src/lib/mail.ts` lazily builds a nodemailer transporter from `EMAIL_SERVER_*` env vars; if they're unset (e.g. local dev without SES configured), `sendMail` no-ops and just logs `[mail:dev-fallback]` instead of throwing. Don't assume missing email env vars is a bug — it's the expected local-dev state.

### Compare feature is client-only state

`src/context/CompareContext.tsx` keeps the "compare garages" selection (max `MAX_COMPARE_GARAGES`, see `src/lib/constants.ts`) in React state hydrated from/persisted to `sessionStorage` (key `COMPARE_STORAGE_KEY`) — no server/DB persistence.

### Other notes

- `src/agent.ts` is a legacy stub (`export {}`) — not part of the marketplace app, safe to ignore.
- `next.config.ts` is intentionally an empty stub; the real Next.js config is `next.config.js`.
- Path alias `@/*` maps to `./src/*` (see `tsconfig.json`); route/page files under `app/` import from `src/` via this alias.
- AWS deployment target (App Runner + RDS Postgres + S3 + CloudFront + SES, no ALB) is documented in `AWS-DEPLOYMENT.md`.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
