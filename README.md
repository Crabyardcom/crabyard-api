# Crabyard API

License validation, licensed template downloads, CLI release distribution, and Stripe checkout for [Crabyard](https://github.com/Crabyardcom/).

This is a standalone Bun, Hono, and PostgreSQL service. Run commands from this repository's root.

```sh
bun install --frozen-lockfile
cp .env.example .env
bun run db:migrate
bun run dev
```

Set `DATABASE_URL` and a long random `ADMIN_KEY`. Stripe checkout requires `STRIPE_SECRET_KEY` and `STRIPE_PRICE_ID`. Fulfillment also requires `STRIPE_WEBHOOK_SECRET` and `RESEND_API_KEY` with a verified `crabyard.dev` sender. `GITHUB_TOKEN` is optional for public CLI releases; private releases require a token with read access to `Crabyardcom/crabyard-cli`.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/health` | Process health |
| POST | `/license/validate` | Validate a JSON `{ "key": "..." }` license |
| GET | `/template/:version` | Download a template with Bearer license authentication |
| POST | `/template/upload?version=0.1.0` | Upload a gzip archive with `X-Admin-Key` (32 MiB limit) |
| GET | `/cli/latest` | Latest CLI release tag |
| GET | `/cli/download/:target?version=v0.1.0` | Download a supported CLI archive |
| GET | `/cli/download/:target?version=v0.1.0&checksum=1` | Download that archive's `.sha256` sidecar |
| POST | `/stripe/checkout` | Create a one-time checkout session |
| GET | `/stripe/session/:id` | Retrieve the paid session's active license (session ID is a bearer secret) |
| POST | `/stripe/webhook` | Signed Stripe fulfillment events |

Configure Stripe to send `checkout.session.completed` and `checkout.session.async_payment_succeeded`. Only paid payment sessions created for Crabyard are fulfilled. Concurrent webhook retries reuse the original license; email delivery failures return an error for Stripe to retry. Migrations add a durable email delivery marker. Existing license prefixes remain valid; new keys use `CRAB-`.

Templates are built in [crabyard-templates](https://github.com/Crabyardcom/crabyard-templates). To upload a local checkout:

```sh
API_URL=https://api.crabyard.dev ADMIN_KEY=... ./scripts/upload-template.sh /path/to/crabyard-templates 0.1.0
```

On Windows, use `scripts/upload-template.ps1 -ScaffoldDir C:\path\to\crabyard-templates -Version 0.1.0` with the same environment variables.

```sh
bun run check
bun test
bun run build
docker build -t crabyard-api .
```

Deploy the Dockerfile with this repository as its build context. Run `bun run db:migrate` as the pre-deploy command, set the health check to `/health`, and provide PostgreSQL through `DATABASE_URL`. The service binds to Railway's `PORT` or port 3000. Secrets belong in deployment variables, never in Git.
