# Agent instructions

- This standalone repository owns the Bun/Hono API, PostgreSQL migrations, and license fulfillment.
- Run `bun install --frozen-lockfile`, `bun run check`, `bun test`, and `bun run build` for API changes.
- Preserve existing license compatibility and signed webhook validation. Provision licenses only after confirmed payment and keep retries idempotent.
- Add ordered SQL migrations for schema changes; never edit an applied migration. Run migrations before starting a new deployment.
- Never log license keys, checkout session IDs, tokens, or customer data. Keep secrets in environment variables.
- Release binaries come from `Crabyardcom/crabyard-cli`; templates come from `Crabyardcom/crabyard-templates`.
- Add comments only when they explain a non-obvious constraint; keep them under two lines.
