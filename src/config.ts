export const siteUrl = new URL(
  process.env.CRABYARD_SITE_URL || "https://crabyard-web-production.up.railway.app"
).origin;
