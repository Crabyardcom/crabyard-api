export const siteUrl = new URL(
  process.env.CRABYARD_SITE_URL || "https://crabyard.com"
).origin;
