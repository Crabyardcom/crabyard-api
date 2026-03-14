import { Hono } from "hono";
import type { Env, License } from "../types";

export const licenseRoutes = new Hono<Env>();

licenseRoutes.post("/validate", async (c) => {
  const body = await c.req.json<{ key?: string }>();
  const key = body.key?.trim();

  if (!key) {
    return c.json({ valid: false, message: "Missing license key" }, 400);
  }

  const db = c.get("db");

  const [license] = await db<License[]>`
    SELECT * FROM licenses WHERE key = ${key}
  `;

  if (!license) {
    return c.json({ valid: false, message: "Unknown license key" }, 401);
  }

  if (!license.active) {
    return c.json({ valid: false, message: "License deactivated" }, 403);
  }

  await db`
    UPDATE licenses SET last_used = NOW() WHERE id = ${license.id}
  `;

  return c.json({ valid: true, plan: license.plan });
});
