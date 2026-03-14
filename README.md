# Crabyard API

Cloudflare Worker API that handles license validation, template distribution, and Stripe payments for Crabyard.

## Stack

- **Runtime:** Cloudflare Workers
- **Router:** Hono
- **Database:** Cloudflare D1
- **Storage:** Cloudflare R2
- **Payments:** Stripe
- **Email:** Resend

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Health check |
| `POST` | `/license/validate` | Validate a license key |
| `GET` | `/template/:version` | Download template tarball (Bearer auth) |
| `POST` | `/stripe/checkout` | Create Stripe checkout session |
| `GET` | `/stripe/session/:id` | Get license key for a Stripe session |
| `POST` | `/stripe/webhook` | Stripe webhook handler |

## Setup

### Prerequisites

- [Bun](https://bun.sh) or Node.js
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) (`bun add -g wrangler`)
- Cloudflare account
- Stripe account
- Resend account

### 1. Install dependencies

```sh
bun install
```

### 2. Create D1 database

```sh
wrangler d1 create crabyard-db
```

Copy the `database_id` from the output into `wrangler.toml`.

### 3. Run migrations

```sh
# Local
bun run db:migrate:local

# Remote (after deploy)
bun run db:migrate:remote
```

### 4. Create R2 bucket

```sh
wrangler r2 bucket create crabyard-templates
```

### 5. Set secrets

```sh
wrangler secret put STRIPE_SECRET_KEY
wrangler secret put STRIPE_WEBHOOK_SECRET
wrangler secret put RESEND_API_KEY
```

### 6. Set Stripe price ID

Update `STRIPE_PRICE_ID` in `wrangler.toml` with your Stripe Price ID.

### 7. Upload template

```sh
# Linux/macOS
./scripts/upload-template.sh 0.1.0

# Windows
.\scripts\upload-template.ps1 0.1.0
```

## Development

```sh
bun run dev
```

Runs the Worker locally with `wrangler dev`. Uses local D1/R2 emulation.

## Deploy

```sh
bun run deploy
```

## Project Structure

```
src/
  index.ts          # Hono app entry point + CORS
  types.ts          # Env bindings + License interface
  routes/
    license.ts      # POST /license/validate
    template.ts     # GET /template/:version
    stripe.ts       # Checkout, session lookup, webhook
schema.sql          # D1 table definitions
scripts/
  upload-template.sh    # Package + upload scaffold to R2
  upload-template.ps1   # Windows version
```

## License

Proprietary. Part of the Crabyard product.
