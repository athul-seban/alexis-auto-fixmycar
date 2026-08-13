# AWS Deployment Guide — Quote My Garage

## Architecture Overview

```
Internet → Route 53 → CloudFront → ALB → ECS Fargate (Next.js)
                                              ↓
                                    RDS PostgreSQL (Private VPC)
                                    ElastiCache Redis (Optional)
                                    S3 Bucket (Assets)
                                    SES (Email)
```

## Required AWS Services

| Service | Purpose | Config |
|---------|---------|--------|
| **ECS Fargate** | Host the Next.js app (containerised) | 1 vCPU, 2GB RAM minimum |
| **RDS PostgreSQL** | Primary database | `db.t3.medium`, Multi-AZ for prod |
| **S3** | Garage images, user avatars | `quotemygarage-assets` bucket |
| **CloudFront** | CDN for static assets + caching | Distribution over ALB |
| **ALB** | Load balancer with HTTPS | SSL cert from ACM |
| **Route 53** | DNS management | A record → CloudFront |
| **SES** | Transactional emails | Verify domain first |
| **Secrets Manager** | Store env secrets | Inject into ECS task |
| **ECR** | Docker image registry | Push images here |
| **ACM** | SSL/TLS certificates | Free with AWS |

## Quick Deploy Steps

### 1. Set Up Infrastructure

```bash
# Create ECR repository
aws ecr create-repository --repository-name quotemygarage --region ap-southeast-1

# Create RDS instance (use console or Terraform)
# - Engine: PostgreSQL 16
# - Instance: db.t3.medium
# - Multi-AZ: Yes (production)
# - VPC: Private subnets only
# - Security group: Allow port 5432 from ECS security group only

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

Store these in AWS Secrets Manager and reference in ECS task definition:

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

### 4. ECS Task Definition (key settings)

```json
{
  "family": "quotemygarage",
  "cpu": "1024",
  "memory": "2048",
  "requiresCompatibilities": ["FARGATE"],
  "networkMode": "awsvpc",
  "containerDefinitions": [{
    "name": "quotemygarage",
    "image": "YOUR_ECR_URI/quotemygarage:latest",
    "portMappings": [{"containerPort": 3000}],
    "environment": [{"name": "NODE_ENV", "value": "production"}],
    "secrets": [
      {"name": "DATABASE_URL", "valueFrom": "arn:aws:secretsmanager:..."}
    ],
    "logConfiguration": {
      "logDriver": "awslogs",
      "options": {
        "awslogs-group": "/ecs/quotemygarage",
        "awslogs-region": "ap-southeast-1",
        "awslogs-stream-prefix": "ecs"
      }
    }
  }]
}
```

### 5. Database Migration

Run once after RDS is ready (from a bastion host or ECS exec):

```bash
npx prisma migrate deploy
# or for initial setup:
npx prisma db push
```

### 6. ALB & HTTPS

1. Create an Application Load Balancer (internet-facing)
2. Add HTTPS listener on port 443 with ACM certificate
3. Target group → ECS service on port 3000
4. HTTP → HTTPS redirect rule

### 7. CloudFront

- Origin: ALB
- Cache behaviour: `/_next/static/*` — long cache (1 year)
- Cache behaviour: `/api/*` — no cache
- Default: pass through to ALB

## Estimated Monthly Cost (small-medium traffic)

| Service | Est. Cost |
|---------|-----------|
| ECS Fargate (2 tasks) | ~$30 |
| RDS db.t3.medium | ~$60 |
| ALB | ~$20 |
| CloudFront | ~$5 |
| S3 | ~$3 |
| Route 53 | ~$1 |
| **Total** | **~$120/month** |

## CI/CD with GitHub Actions

See `.github/workflows/deploy.yml` for automated deployment on push to `main`.

## Monitoring

- **CloudWatch** — App logs, metrics, alarms
- **RDS Performance Insights** — Database monitoring
- **CloudFront metrics** — CDN cache hit ratio
