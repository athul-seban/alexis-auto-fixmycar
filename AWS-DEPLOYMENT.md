> **Superseded.** The app is hosted on Vercel; see [VERCEL-DEPLOYMENT.md](VERCEL-DEPLOYMENT.md). This AWS App Runner plan is kept for reference and is no longer maintained.

# AWS Deployment Guide — Quote My Garage

## Architecture Overview

Cost-effective by design: **no ALB** — App Runner has load balancing and HTTPS built in, so there's no separate load balancer to provision, manage, or pay for.

```
Internet → Route 53 → CloudFront → App Runner (Next.js, containerised)
                                              ↓
                                    RDS PostgreSQL (Private VPC)
                                    S3 Bucket (Assets)
                                    SES (Email)
```

## Required AWS Services

| Service | Purpose | Config |
|---------|---------|--------|
| **App Runner** | Host the Next.js app (containerised, auto-scaling, built-in HTTPS + load balancing) | 1 vCPU, 2GB RAM minimum |
| **RDS PostgreSQL** | Primary database | `db.t4g.micro`, single-AZ (upgrade to Multi-AZ if needed) |
| **S3** | Garage images, user avatars | `quotemygarage-assets` bucket |
| **CloudFront** | CDN for static assets + caching | Distribution over App Runner |
| **Route 53** | DNS management | A record → CloudFront |
| **SES** | Transactional emails | Verify domain first |
| **Secrets Manager** | Store env secrets | Inject into App Runner service |
| **ECR** | Docker image registry | Push images here |
| **ACM** | SSL/TLS certificates | Free with AWS (used by CloudFront) |

## Quick Deploy Steps

### 1. Set Up Infrastructure

```bash
# Create ECR repository
aws ecr create-repository --repository-name quotemygarage --region ap-southeast-1

# Create RDS instance (use console or Terraform)
# - Engine: PostgreSQL 16
# - Instance: db.t4g.micro (upgrade only if traffic needs it)
# - Multi-AZ: No (single-AZ keeps cost down; enable later if needed)
# - VPC: Private subnets only
# - Security group: Allow port 5432 from App Runner's VPC connector only

# Create S3 bucket
aws s3 mb s3://quotemygarage-assets-prod --region ap-southeast-1
aws s3api put-bucket-cors --bucket quotemygarage-assets-prod --cors-configuration file://s3-cors.json
```

### 2. Build & Push Docker Image

```bash
# Authenticate with ECR
aws ecr get-login-password --region ap-southeast-1 | \
  docker login --username AWS --password-stdin \
  YOUR_ACCOUNT_ID.dkr.ecr.ap-southeast-1.amazonaws.com

# Build and push
docker build -t quotemygarage .
docker tag quotemygarage:latest YOUR_ACCOUNT_ID.dkr.ecr.ap-southeast-1.amazonaws.com/quotemygarage:latest
docker push YOUR_ACCOUNT_ID.dkr.ecr.ap-southeast-1.amazonaws.com/quotemygarage:latest
```

### 3. Environment Variables (Secrets Manager)

Store these in AWS Secrets Manager and reference in the App Runner service:

```
DATABASE_URL=postgresql://user:pass@rds-endpoint:5432/quotemygarage
NEXTAUTH_URL=https://quotemygarage.com
NEXTAUTH_SECRET=<generate with: openssl rand -base64 32>
AWS_ACCESS_KEY_ID=<IAM user with S3 permissions>
AWS_SECRET_ACCESS_KEY=<IAM secret>
AWS_S3_BUCKET=quotemygarage-assets-prod
AWS_REGION=ap-southeast-1
GOOGLE_CLIENT_ID=<from Google Cloud Console>
GOOGLE_CLIENT_SECRET=<from Google Cloud Console>
EMAIL_SERVER_HOST=email-smtp.ap-southeast-1.amazonaws.com
EMAIL_SERVER_PORT=587
EMAIL_SERVER_USER=<SES SMTP user>
EMAIL_SERVER_PASSWORD=<SES SMTP password>
EMAIL_FROM=noreply@quotemygarage.com
```

### 4. App Runner Service (key settings)

```bash
aws apprunner create-service \
  --service-name quotemygarage \
  --source-configuration '{
    "ImageRepository": {
      "ImageIdentifier": "YOUR_ECR_URI/quotemygarage:latest",
      "ImageRepositoryType": "ECR",
      "ImageConfiguration": {
        "Port": "3000",
        "RuntimeEnvironmentVariables": {"NODE_ENV": "production"},
        "RuntimeEnvironmentSecrets": {
          "DATABASE_URL": "arn:aws:secretsmanager:..."
        }
      }
    },
    "AutoDeploymentsEnabled": true
  }' \
  --instance-configuration '{"Cpu": "1024", "Memory": "2048"}' \
  --network-configuration '{"EgressConfiguration": {"EgressType": "VPC", "VpcConnectorArn": "YOUR_VPC_CONNECTOR_ARN"}}'
```

App Runner provisions HTTPS and load balancing automatically — no ALB, target group, or listener config needed. A VPC connector is only required so App Runner can reach RDS in a private subnet.

### 5. Database Migration

This project has **no `prisma/migrations` folder** — the schema is applied with `prisma db push` against `prisma/schema.prod.prisma` (Postgres). `prisma migrate deploy` will not work. Run from a bastion host or a one-off App Runner/ECS task:

```bash
npx prisma db push --schema=prisma/schema.prod.prisma
```

**Rolling out a schema change (e.g. the garage portal):**

1. Back up the database first (RDS snapshot).
2. `db push` the prod schema. Portal changes are additive or relax `NOT NULL` (`Booking.ownerId`/`vehicleId`), so no data is lost and the old code keeps working. **If Prisma asks for `--accept-data-loss`, stop** and investigate. The one expected exception is the warning about adding a unique constraint on `Booking.manageToken`: the column is new and all-null, so there can be no duplicates and it is safe. Other changes in this release: `Review.ownerId` becomes optional (reviews left via an email link have no account), new `BookingEvent`, `RateLimitHit` and `AuditLog` tables, new `Booking.reminderSentAt`/`manageToken` columns, and extra indexes.
3. Deploy the new app version.
4. Backfill existing bookings (source, customer/vehicle snapshots, reference, search text) — idempotent, safe to re-run:

   ```bash
   npm run db:backfill -- --dry-run   # report what would change
   npm run db:backfill
   ```

5. Online deposits (optional): add `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` to Secrets Manager, and in the Stripe dashboard add a webhook endpoint `https://<your-domain>/api/stripe/webhook` for `checkout.session.completed`, `checkout.session.expired`, `checkout.session.async_payment_succeeded` and `checkout.session.async_payment_failed`. Test with Stripe test keys first. Without the keys the payments switch stays disabled. New columns on `Booking` (`paymentStatus`, `depositAmount`, `refundedAmount`, `stripeSessionId` unique, `stripePaymentIntent`) and a `StripeEvent` table are additive.
6. Text messages (optional): add `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` and `TWILIO_FROM` (or `TWILIO_MESSAGING_SERVICE_SID`) to Secrets Manager. UK senders should register an alphanumeric sender ID or buy a number first. New columns `Booking.smsOptIn`, `Booking.smsReminderSentAt` and `User.smsOptIn` are additive. The hourly reminder job (next step) also sends the SMS reminders.
7. Garage tools (customers/invoices) add `Garage.invoiceCounter`, `Booking.invoiceNumber`/`invoicedAt` (with `@@unique([garageId, invoiceNumber])` — Prisma warns about adding a unique constraint; the columns are new and all-null so it is safe) and a `CustomerNote` table.
8. Schedule the reminder job: call `GET /api/cron/booking-reminders` hourly with `Authorization: Bearer $CRON_SECRET` (EventBridge Scheduler). It emails customers about appointments in the next 24 hours, once each; running it more often is harmless.

Local/CI use SQLite via `prisma/schema.prisma`; keep the two schema files identical apart from `provider`.

### 6. CloudFront

- Origin: App Runner service's default domain
- Cache behaviour: `/_next/static/*` — long cache (1 year)
- Cache behaviour: `/api/*` — no cache
- Default: pass through to App Runner

## Estimated Monthly Cost (small-medium traffic)

| Service | Est. Cost |
|---------|-----------|
| App Runner (1 vCPU / 2GB, low traffic) | ~$25 |
| RDS db.t4g.micro (single-AZ) | ~$15 |
| CloudFront | ~$5 |
| S3 | ~$3 |
| Route 53 | ~$1 |
| **Total** | **~$49/month** |

## CI/CD with GitHub Actions

See `.github/workflows/deploy.yml` for automated deployment on push to `main`.

## Monitoring

- **CloudWatch** — App logs, metrics, alarms
- **RDS Performance Insights** — Database monitoring
- **CloudFront metrics** — CDN cache hit ratio
